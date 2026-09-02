import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BlackoutDate(Base):
    """Dates when shuttle bookings are not accepted (admin-managed)."""

    __tablename__ = "blackout_dates"

    date: Mapped[str] = mapped_column(String(10), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )


class ShuttleTimeSlot(Base):
    """Configurable departure times: one-off, every day, or weekly on a weekday."""

    __tablename__ = "shuttle_time_slots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    departure_time: Mapped[str] = mapped_column(String(5))
    recurrence: Mapped[str] = mapped_column(String(10))
    event_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )


class ShuttleTimeException(Base):
    """Hide one departure time on one calendar day without changing recurring rules."""

    __tablename__ = "shuttle_time_exceptions"
    __table_args__ = (
        UniqueConstraint(
            "calendar_date",
            "departure_time",
            name="uq_shuttle_time_exception_day_time",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    calendar_date: Mapped[str] = mapped_column(String(10))
    departure_time: Mapped[str] = mapped_column(String(5))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    direction: Mapped[str] = mapped_column(String(20))
    date: Mapped[str] = mapped_column(String(10))
    time: Mapped[str] = mapped_column(String(5))
    passenger_count: Mapped[int] = mapped_column(Integer)
    passenger_name: Mapped[str] = mapped_column(String(200))
    room_number: Mapped[str] = mapped_column(String(50), default="")
    email: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(50))
    amount_isk: Mapped[int] = mapped_column(Integer)
    payment_reference: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None
    )
    payment_link_reference: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None
    )
    payment_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
