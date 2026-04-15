"""Business logic: streaks, yearly totals, upsert increments."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import UserActivity
from app.schemas import ActivityDay


def _daterange_inclusive(start: date, end: date) -> Iterable[date]:
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def load_counts_by_date(db: Session, user_id: str, start: date, end: date) -> dict[date, int]:
    rows = db.execute(
        select(UserActivity).where(
            UserActivity.user_id == user_id,
            UserActivity.date >= start,
            UserActivity.date <= end,
        )
    ).scalars().all()
    return {r.date: r.problems_solved for r in rows}


def build_activity_days(
    db: Session,
    user_id: str,
    *,
    days_back: int = 365,
) -> list[ActivityDay]:
    """Return one row per day for the last `days_back` days ending today (inclusive)."""
    today = date.today()
    start = today - timedelta(days=days_back - 1)
    counts = load_counts_by_date(db, user_id, start, today)
    out: list[ActivityDay] = []
    for d in _daterange_inclusive(start, today):
        c = counts.get(d, 0)
        out.append(ActivityDay(date=d.isoformat(), count=c))
    return out


def total_for_calendar_year(counts_by_date: dict[date, int], year: int) -> int:
    total = 0
    for d, c in counts_by_date.items():
        if d.year == year:
            total += c
    return total


def current_streak_from_today(counts_by_date: dict[date, int], today: date) -> int:
    streak = 0
    d = today
    while counts_by_date.get(d, 0) > 0:
        streak += 1
        d -= timedelta(days=1)
    return streak


def longest_streak_in_range(counts_by_date: dict[date, int], start: date, end: date) -> int:
    best = 0
    run = 0
    for d in _daterange_inclusive(start, end):
        if counts_by_date.get(d, 0) > 0:
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best


def increment_solved(db: Session, user_id: str, on: date) -> UserActivity:
    row = db.execute(
        select(UserActivity).where(
            UserActivity.user_id == user_id,
            UserActivity.date == on,
        )
    ).scalar_one_or_none()
    if row is None:
        row = UserActivity(user_id=user_id, date=on, problems_solved=1)
        db.add(row)
    else:
        row.problems_solved += 1
    db.commit()
    db.refresh(row)
    return row
