import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


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
    email: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(50))
    amount_isk: Mapped[int] = mapped_column(Integer)
    payment_reference: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None
    )
    payment_link_reference: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None
    )
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
