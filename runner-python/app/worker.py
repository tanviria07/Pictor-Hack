"""
Redis queue worker: BRPOP run queue, evaluate code, store raw RunResponse JSON.

Queue message format (JSON object, one string element from Redis):
  {"job_id","problem_id","language","code"}
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any

import redis

from app.execution import run_user_code
from app.models import RunRequest

log = logging.getLogger("runner.worker")

REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
QUEUE_KEY = os.environ.get("RUN_QUEUE_KEY", "run:queue")
JOB_KEY_PREFIX = os.environ.get("RUN_JOB_KEY_PREFIX", "run:job:")
RAW_KEY_PREFIX = os.environ.get("RUN_RAW_RESULT_PREFIX", "run:raw:")
TTL_SEC = int(os.environ.get("RUN_JOB_TTL_SEC", "3600"))


def _job_key(job_id: str) -> str:
    return f"{JOB_KEY_PREFIX}{job_id}"


def _raw_key(job_id: str) -> str:
    return f"{RAW_KEY_PREFIX}{job_id}"


def _set_job_meta(r: redis.Redis, job_id: str, meta: dict[str, Any]) -> None:
    key = _job_key(job_id)
    r.set(key, json.dumps(meta), ex=TTL_SEC)


def _process_one(r: redis.Redis, payload: dict[str, Any]) -> None:
    job_id = payload.get("job_id", "")
    if not job_id:
        log.warning("missing job_id in payload")
        return

    problem_id = payload.get("problem_id", "")
    language = payload.get("language") or "python"
    code = payload.get("code", "")

    _set_job_meta(r, job_id, {"status": "processing"})

    try:
        req = RunRequest(problem_id=problem_id, language=language, code=code)
        out = run_user_code(req)
        raw_json = out.model_dump_json()
        r.set(_raw_key(job_id), raw_json, ex=TTL_SEC)
        _set_job_meta(r, job_id, {"status": "completed"})
    except Exception as exc:  # noqa: BLE001
        log.exception("job %s failed", job_id)
        _set_job_meta(
            r,
            job_id,
            {"status": "failed", "error": str(exc)[:2000]},
        )


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stdout,
    )
    log.info("worker starting REDIS_URL=%s QUEUE=%s", REDIS_URL, QUEUE_KEY)
    r = redis.from_url(REDIS_URL, decode_responses=True)

    while True:
        try:
            item = r.brpop(QUEUE_KEY, timeout=5)
            if item is None:
                continue
            _, raw = item
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                log.warning("invalid json: %s", raw[:200])
                continue
            if not isinstance(payload, dict):
                continue
            _process_one(r, payload)
        except redis.ConnectionError as e:
            log.error("redis connection: %s", e)
            time.sleep(2)
        except KeyboardInterrupt:
            log.info("shutdown")
            break


if __name__ == "__main__":
    main()