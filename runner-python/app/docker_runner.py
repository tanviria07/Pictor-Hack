"""Run user evaluation inside a short-lived Docker container (host Docker daemon)."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import docker
from docker.types import Mount

from app.feedback import deterministic_interviewer_note
from app.internal_errors import parse_subprocess_stdout_json
from app.models import RunRequest, RunResponse, StructuredEvaluation

ROOT = Path(__file__).resolve().parent.parent


def _problem_test_counts(problem_id: str) -> tuple[int, int]:
    from app.problems import ProblemLoadError, load_problem, problem_path

    try:
        if not problem_path(problem_id).exists():
            return 0, 0
        p = load_problem(problem_id)
        return len(p.get("visible_tests", [])), len(p.get("hidden_tests", []))
    except (OSError, ProblemLoadError, FileNotFoundError):
        return 0, 0


def _timeout_response(problem_id: str) -> RunResponse:
    tv, th = _problem_test_counts(problem_id)
    ev = StructuredEvaluation(
        status="runtime_error",
        syntax_ok=True,
        function_found=True,
        signature_ok=True,
        passed_visible_tests=0,
        total_visible_tests=tv,
        passed_hidden_tests=0,
        total_hidden_tests=th,
        error_type="Timeout",
        error_message="Execution exceeded the sandbox time limit.",
        failing_case_summary=None,
        likely_stage="timeout",
        feedback_targets=[
            "Reduce complexity or infinite loops; aim for linear passes where possible.",
        ],
        visible_test_results=[],
    )
    return RunResponse(
        status="runtime_error",
        evaluation=ev,
        visible_test_results=[],
        interviewer_feedback=deterministic_interviewer_note(ev),
    )


def _docker_unreachable_response(problem_id: str, msg: str) -> RunResponse:
    tv, th = _problem_test_counts(problem_id)
    ev = StructuredEvaluation(
        status="runtime_error",
        syntax_ok=True,
        function_found=False,
        signature_ok=False,
        passed_visible_tests=0,
        total_visible_tests=tv,
        passed_hidden_tests=0,
        total_hidden_tests=th,
        error_type="DockerError",
        error_message=msg[:2000],
        failing_case_summary=None,
        likely_stage="internal",
        feedback_targets=["The sandbox could not be started. If this persists, contact support."],
        visible_test_results=[],
    )
    return RunResponse(
        status="runtime_error",
        evaluation=ev,
        visible_test_results=[],
        interviewer_feedback=deterministic_interviewer_note(ev),
    )


def run_in_docker(req: RunRequest) -> RunResponse:
    """
    Spawn one container per submission: no network, read-only root, memory/CPU caps, wall timeout.
    Requires Docker on the host and an image (see Dockerfile.sandbox). When the API process runs
    inside Compose without a host-visible job directory, set RUNNER_DOCKER_JOB_DIR to a bind-mounted
    path that the Docker daemon can read, or keep RUNNER_USE_DOCKER=0.
    """
    image = os.environ.get("RUNNER_DOCKER_IMAGE", "pictorhack-runner-sandbox:latest")
    timeout_sec = int(os.environ.get("RUNNER_DOCKER_TIMEOUT_SEC", os.environ.get("RUNNER_SUBPROCESS_TIMEOUT_SEC", "8")))
    mem_limit = os.environ.get("RUNNER_DOCKER_MEMORY", "256m")
    cpus = float(os.environ.get("RUNNER_DOCKER_CPUS", "1"))
    nano_cpus = int(cpus * 1e9)
    if nano_cpus < 1_000_000:
        nano_cpus = 1_000_000

    job_dir = os.environ.get("RUNNER_DOCKER_JOB_DIR", "").strip()
    payload_path: Path | None = None
    tmp_dir: str | None = None
    if job_dir:
        job_root = Path(job_dir)
        job_root.mkdir(parents=True, exist_ok=True)
        fd, raw = tempfile.mkstemp(prefix="job-", suffix=".json", dir=job_root)
        os.close(fd)
        payload_path = Path(raw)
    else:
        tmp_dir = tempfile.mkdtemp(prefix="pictor-docker-job-")
        payload_path = Path(tmp_dir) / "payload.json"

    payload = json.dumps({"code": req.code, "problem_id": req.problem_id}, ensure_ascii=False).encode("utf-8")
    try:
        payload_path.write_bytes(payload)
    except OSError as exc:
        if tmp_dir:
            try:
                os.rmdir(tmp_dir)
            except OSError:
                pass
        return _docker_unreachable_response(req.problem_id, f"Could not write job payload: {exc}")

    mounts = [
        Mount(target="/sandbox", source=str(ROOT.resolve()), type="bind", read_only=True),
        Mount(target="/job/payload.json", source=str(payload_path.resolve()), type="bind", read_only=True),
    ]

    try:
        client = docker.from_env()
    except docker.errors.DockerException as exc:
        _cleanup_payload(payload_path, tmp_dir)
        return _docker_unreachable_response(req.problem_id, str(exc))

    cmd = ["python", "-m", "app.run_job", "/job/payload.json"]
    env = {
        "PYTHONPATH": "/sandbox",
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
    }

    try:
        out = client.containers.run(
            image,
            command=cmd,
            mounts=mounts,
            environment=env,
            working_dir="/sandbox",
            network_mode="none",
            read_only=True,
            tmpfs={"/tmp": "rw,nosuid,size=64m"},
            mem_limit=mem_limit,
            nano_cpus=nano_cpus,
            pids_limit=64,
            security_opt=["no-new-privileges:true"],
            remove=True,
            stdout=True,
            stderr=True,
            detach=False,
            timeout=timeout_sec,
        )
    except docker.errors.ContainerError as exc:
        err_txt = ""
        if exc.stderr:
            err_txt = exc.stderr.decode("utf-8", errors="replace")[:2000]
        elif exc.stdout:
            err_txt = exc.stdout.decode("utf-8", errors="replace")[:2000]
        tv, th = _problem_test_counts(req.problem_id)
        ev = StructuredEvaluation(
            status="runtime_error",
            syntax_ok=True,
            function_found=False,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=tv,
            passed_hidden_tests=0,
            total_hidden_tests=th,
            error_type="ContainerError",
            error_message=err_txt or f"Container exited with status {exc.exit_status}.",
            failing_case_summary=None,
            likely_stage="sandbox",
            feedback_targets=["Your code hit a sandbox error; simplify and avoid unsupported operations."],
            visible_test_results=[],
        )
        return RunResponse(
            status="runtime_error",
            evaluation=ev,
            visible_test_results=[],
            interviewer_feedback=deterministic_interviewer_note(ev),
        )
    except (docker.errors.APIError, docker.errors.ImageNotFound) as exc:
        return _docker_unreachable_response(req.problem_id, str(exc))
    except Exception as exc:  # noqa: BLE001 — map any client/timeout failure
        msg = str(exc).lower()
        if "timeout" in msg or "timed out" in msg:
            return _timeout_response(req.problem_id)
        return _docker_unreachable_response(req.problem_id, str(exc))
    finally:
        _cleanup_payload(payload_path, tmp_dir)

    tv, th = _problem_test_counts(req.problem_id)
    return parse_subprocess_stdout_json(
        out,
        problem_id=req.problem_id,
        visible_count=tv,
        hidden_count=th,
    )


def _cleanup_payload(payload_path: Path | None, tmp_dir: str | None) -> None:
    if payload_path and payload_path.is_file():
        try:
            payload_path.unlink()
        except OSError:
            pass
    if tmp_dir:
        try:
            os.rmdir(tmp_dir)
        except OSError:
            pass
