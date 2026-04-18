from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.execution import run_user_code
from app.models import (
    RunRequest,
    RunResponse,
    StepwiseGenerateRequest,
    StepwiseGenerateResponse,
    StepwiseValidateRequest,
    StepwiseValidateResponse,
)
from app.problems import load_problem
from app.problem_io import ProblemLoadError
from app.stepwise import validate_request as run_stepwise
from app.stepwise_gen import generate_for_problem

app = FastAPI(
    title="Pictor Hack Python Runner",
    description="Pictor Hack Python execution and evaluation service.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("RUNNER_CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/evaluate", response_model=RunResponse)
def evaluate(req: RunRequest) -> RunResponse:
    try:
        return run_user_code(req)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/validate", response_model=StepwiseValidateResponse)
def validate(req: StepwiseValidateRequest) -> StepwiseValidateResponse:
    try:
        problem = load_problem(req.problem_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ProblemLoadError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return run_stepwise(req, problem)


@app.post("/generate-stepwise", response_model=StepwiseGenerateResponse)
def generate_stepwise(req: StepwiseGenerateRequest) -> StepwiseGenerateResponse:
    try:
        result = generate_for_problem(
            req.problem_id,
            overwrite=req.overwrite,
            dry_run=req.dry_run,
            force_fallback=req.force_fallback,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ProblemLoadError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    data = result.data or {}
    return StepwiseGenerateResponse(
        problem_id=result.problem_id,
        source=result.source,
        skipped=result.source == "skipped",
        skip_reason=result.skip_reason,
        sentences_count=result.sentences_count,
        solution_sentences=list(data.get("solution_sentences") or []),
        hints_per_sentence=list(data.get("hints_per_sentence") or []),
        final_explanation=str(data.get("final_explanation") or ""),
        written_paths=[str(p) for p in result.paths],
    )
