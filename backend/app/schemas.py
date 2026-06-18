from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


def _validate_yyyy_mm_dd(value: str) -> str:
    s = value.strip()
    parts = s.split("-")
    if len(parts) != 3:
        raise ValueError("Date must be YYYY-MM-DD")
    y, m, d = (int(parts[0]), int(parts[1]), int(parts[2]))
    datetime(y, m, d)
    return f"{y:04d}-{m:02d}-{d:02d}"


class BookingRequest(BaseModel):
    direction: str
    date: str
    time: str
    passenger_count: int
    passenger_name: str
    email: EmailStr
    phone: str


class BookingResponse(BaseModel):
    id: str
    direction: str
    date: str
    time: str
    passenger_count: int
    passenger_name: str
    email: str
    phone: str
    amount_isk: int
    payment_link_reference: str | None = None
    status: str
    created_at: datetime


class BookingCreated(BaseModel):
    booking_id: str
    payment_url: str
    already_paid: bool = False


class BookingPayment(BaseModel):
    booking_id: str
    payment_url: str
    status: str


class CalendarDay(BaseModel):
    date: str
    count: int
    passengers: int


class BlackoutDateResponse(BaseModel):
    model_config = {"from_attributes": True}

    date: str
    created_at: datetime


class BlackoutDateCreate(BaseModel):
    date: str

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        return _validate_yyyy_mm_dd(v)
