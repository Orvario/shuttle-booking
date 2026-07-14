from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator, model_validator


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


def _normalize_hh_mm(value: str) -> str:
    s = value.strip()
    parts = s.split(":")
    if len(parts) < 2:
        raise ValueError("Time must be HH:MM")
    h, m = int(parts[0]), int(parts[1])
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError("Invalid time")
    return f"{h:02d}:{m:02d}"


class ShuttleTimeSlotCreate(BaseModel):
    departure_time: str
    recurrence: Literal["once", "daily", "weekly"]
    event_date: str | None = None
    weekday: int | None = None

    @field_validator("departure_time")
    @classmethod
    def validate_departure_time(cls, v: str) -> str:
        return _normalize_hh_mm(v)

    @field_validator("event_date")
    @classmethod
    def validate_event_date(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return _validate_yyyy_mm_dd(v)

    @model_validator(mode="after")
    def recurrence_fields(self) -> "ShuttleTimeSlotCreate":
        if self.recurrence == "once":
            if not self.event_date:
                raise ValueError("One-time departures require a date.")
            if self.weekday is not None:
                raise ValueError("One-time departures must not set a weekday.")
        elif self.recurrence == "weekly":
            if self.weekday is None or self.weekday < 0 or self.weekday > 6:
                raise ValueError(
                    "Weekly departures require a weekday (0=Monday .. 6=Sunday)."
                )
            if self.event_date is not None:
                raise ValueError("Weekly departures must not set a specific date.")
        else:
            if self.event_date is not None or self.weekday is not None:
                raise ValueError(
                    "Daily departures must not include a date or weekday."
                )
        return self


class ShuttleTimeSlotResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    departure_time: str
    recurrence: str
    event_date: str | None
    weekday: int | None
    created_at: datetime


class DepartureSlotPublic(BaseModel):
    time: str
    remaining_seats: int


class ShuttleTimesPublicResponse(BaseModel):
    slots: list[DepartureSlotPublic]


class ShuttleTimeExceptionCreate(BaseModel):
    calendar_date: str
    departure_time: str

    @field_validator("calendar_date")
    @classmethod
    def validate_calendar_date(cls, v: str) -> str:
        return _validate_yyyy_mm_dd(v)

    @field_validator("departure_time")
    @classmethod
    def validate_departure_time(cls, v: str) -> str:
        return _normalize_hh_mm(v)


class ShuttleTimeExceptionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    calendar_date: str
    departure_time: str
    created_at: datetime
