from datetime import date

from sqlalchemy import Date, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserActivity(Base):
    __tablename__ = "user_activity"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_user_activity_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    problems_solved: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
