from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserActivity
from app.schemas import ActivityDay, ActivitySummary, SolveBody
from app.services import activity_service

router = APIRouter(prefix="/activity", tags=["activity"])


def _calendar_year_total(db: Session, user_id: str, year: int) -> int:
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    value = db.execute(
        select(func.coalesce(func.sum(UserActivity.problems_solved), 0)).where(
            UserActivity.user_id == user_id,
            UserActivity.date >= start,
            UserActivity.date <= end,
        )
    ).scalar_one()
    return int(value or 0)


@router.get("/{user_id}/summary", response_model=ActivitySummary)
def get_activity_summary(user_id: str, db: Session = Depends(get_db)) -> ActivitySummary:
    """Heatmap payload plus streak and yearly stats (bonus)."""
    if not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id required")
    days = activity_service.build_activity_days(db, user_id, days_back=365)
    today = date.today()
    start = today - timedelta(days=364)
    counts = {date.fromisoformat(d.date): d.count for d in days}
    y = today.year
    total_year = _calendar_year_total(db, user_id, y)
    return ActivitySummary(
        days=days,
        total_this_year=total_year,
        current_streak=activity_service.current_streak_from_today(counts, today),
        longest_streak=activity_service.longest_streak_in_range(counts, start, today),
    )


@router.get("/{user_id}", response_model=list[ActivityDay])
def get_activity_days(user_id: str, db: Session = Depends(get_db)) -> list[ActivityDay]:
    """
    Last 365 days (inclusive of today), one entry per day.
    Days with no record return count 0.
    """
    if not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id required")
    return activity_service.build_activity_days(db, user_id, days_back=365)


@router.post("/{user_id}/solve")
def record_problem_solved(
    user_id: str,
    body: SolveBody | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """
    Call when the user solves a problem: increments problems_solved for that date
    (creates row if missing).
    """
    if not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id required")
    on = body.date if body and body.date else date.today()
    row = activity_service.increment_solved(db, user_id, on)
    return {
        "user_id": row.user_id,
        "date": row.date.isoformat(),
        "problems_solved": row.problems_solved,
    }
