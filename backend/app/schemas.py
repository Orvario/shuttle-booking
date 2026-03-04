from datetime import datetime

from pydantic import BaseModel, EmailStr


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
    status: str
    created_at: datetime


class BookingCreated(BaseModel):
    booking_id: str
    payment_url: str


class CalendarDay(BaseModel):
    date: str
    count: int
    passengers: int
