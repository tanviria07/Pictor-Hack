from datetime import date as Date

from pydantic import BaseModel, Field


class ActivityDay(BaseModel):
    date: str = Field(..., description="ISO date YYYY-MM-DD")
    count: int = Field(..., ge=0, description="Problems solved that day")


class ActivitySummary(BaseModel):
    days: list[ActivityDay]
    total_this_year: int = Field(..., ge=0)
    current_streak: int = Field(..., ge=0)
    longest_streak: int = Field(..., ge=0)


class SolveBody(BaseModel):
    date: Date | None = Field(
        default=None,
        description="Defaults to today (server local date) if omitted",
    )
