import logging
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from sqlalchemy import func

from app.database import Base, engine, get_db
from app.email import send_confirmation_email
from app.models import Booking
from app.schemas import BookingCreated, BookingRequest, BookingResponse, CalendarDay
from app.settings import settings
from app.straumur import create_payment_link, verify_webhook_hmac

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Shuttle Booking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/bookings", response_model=BookingCreated)
async def create_booking(
    req: BookingRequest,
    db: Session = Depends(get_db),
):
    if req.direction != "to_airport":
        raise HTTPException(status_code=400, detail="Only hotel-to-airport shuttles available")
    if req.passenger_count < 3 or req.passenger_count > 8:
        raise HTTPException(status_code=400, detail="3-8 passengers allowed")

    amount = req.passenger_count * settings.price_per_passenger_isk

    booking = Booking(
        direction=req.direction,
        date=req.date,
        time=req.time,
        passenger_count=req.passenger_count,
        passenger_name=req.passenger_name,
        email=req.email,
        phone=req.phone,
        amount_isk=amount,
        status="pending",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    logger.info("Booking %s created for %s", booking.id, req.email)

    direction_label = (
        "Airport to Flyers Hotel"
        if req.direction == "to_hotel"
        else "Flyers Hotel to Airport"
    )
    payment_url = await create_payment_link(
        booking_id=booking.id,
        amount_isk=amount,
        description=f"Shuttle {direction_label} - {req.passenger_count} pax",
        passenger_name=req.passenger_name,
        email=req.email,
    )

    return BookingCreated(booking_id=booking.id, payment_url=payment_url)


@app.get("/api/bookings/{booking_id}", response_model=BookingResponse)
def get_booking(booking_id: str, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@app.post("/api/webhooks/straumur")
async def straumur_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()

    event_type = (payload.get("additionalData") or {}).get("eventType", "")
    if event_type != "Authorization":
        return {"status": "ignored", "event": event_type}

    is_valid = verify_webhook_hmac(
        checkout_reference=payload.get("checkoutReference"),
        payfac_reference=payload.get("payfacReference", ""),
        merchant_reference=payload.get("merchantReference"),
        amount=payload.get("amount", ""),
        currency=payload.get("currency", ""),
        reason=payload.get("reason"),
        success=payload.get("success", ""),
        received_signature=payload.get("hmacSignature", ""),
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid HMAC signature")

    booking_id = payload.get("merchantReference")
    success = payload.get("success") == "true"
    payfac_ref = payload.get("payfacReference", "")

    if not booking_id:
        raise HTTPException(status_code=400, detail="Missing merchantReference")

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if success:
        booking.status = "paid"
        booking.payment_reference = payfac_ref
        db.commit()

        logger.info("Booking %s marked as paid (payfac=%s)", booking.id, payfac_ref)

        send_confirmation_email(
            to_email=booking.email,
            passenger_name=booking.passenger_name,
            direction=booking.direction,
            date=booking.date,
            time=booking.time,
            passenger_count=booking.passenger_count,
            amount_isk=booking.amount_isk,
        )
    else:
        booking.status = "failed"
        db.commit()
        logger.info("Booking %s payment failed", booking.id)

    return {"status": "ok"}


def _verify_admin(authorization: str = Header(...)) -> None:
    if not settings.admin_password:
        raise HTTPException(status_code=503, detail="Admin not configured")
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[len(prefix):]
    if not secrets.compare_digest(token, settings.admin_password):
        raise HTTPException(status_code=401, detail="Invalid password")


@app.post("/api/mock-confirm/{booking_id}")
def mock_confirm_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    """Development-only endpoint to simulate Straumur payment confirmation."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking.status = "paid"
    booking.payment_reference = "mock_straumur_ref"
    db.commit()

    send_confirmation_email(
        to_email=booking.email,
        passenger_name=booking.passenger_name,
        direction=booking.direction,
        date=booking.date,
        time=booking.time,
        passenger_count=booking.passenger_count,
        amount_isk=booking.amount_isk,
    )

    return {"status": "confirmed", "booking_id": booking.id}


@app.get("/api/admin/bookings/calendar", response_model=list[CalendarDay])
def admin_calendar(
    month: str = Query(..., description="Month in YYYY-MM format"),
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    rows = (
        db.query(
            Booking.date,
            func.count(Booking.id).label("count"),
            func.sum(Booking.passenger_count).label("passengers"),
        )
        .filter(
            Booking.date.like(f"{month}-%"),
        )
        .group_by(Booking.date)
        .all()
    )
    return [
        CalendarDay(date=row.date, count=row.count, passengers=row.passengers or 0)
        for row in rows
    ]


@app.get("/api/admin/bookings", response_model=list[BookingResponse])
def admin_list_bookings(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    status: str = Query("all", description="Filter by status: paid, pending, failed, or all"),
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    query = db.query(Booking).filter(Booking.date == date)
    if status != "all":
        query = query.filter(Booking.status == status)
    return query.order_by(Booking.time).all()


@app.get("/health")
def health():
    return {"status": "ok"}
