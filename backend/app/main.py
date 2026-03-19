import logging
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from sqlalchemy import func

from app.database import Base, engine, get_db
from app.email import send_confirmation_email, send_hotel_notification
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

with engine.connect() as conn:
    from sqlalchemy import text, inspect
    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("bookings")]
    if "payment_link_reference" not in columns:
        conn.execute(text(
            "ALTER TABLE bookings ADD COLUMN payment_link_reference VARCHAR(200)"
        ))
        conn.commit()
        logger.info("Added payment_link_reference column to bookings table")

app = FastAPI(title="Shuttle Booking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "https://shuttle.flyershotel.com",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
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
    result = await create_payment_link(
        booking_id=booking.id,
        amount_isk=amount,
        description=f"Shuttle {direction_label} - {req.passenger_count} pax",
        passenger_name=req.passenger_name,
        email=req.email,
    )

    logger.info(
        "Payment link result for booking %s: url=%s reference=%s",
        booking.id, result.url, result.reference,
    )

    if result.reference:
        booking.payment_link_reference = result.reference
        db.commit()
        logger.info("Stored payment link ref %s for booking %s", result.reference, booking.id)
    else:
        logger.warning("No payment link reference returned for booking %s", booking.id)

    return BookingCreated(booking_id=booking.id, payment_url=result.url)


@app.get("/api/bookings/{booking_id}", response_model=BookingResponse)
def get_booking(booking_id: str, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@app.post("/api/webhooks/straumur")
async def straumur_webhook(request: Request, db: Session = Depends(get_db)):
    raw_body = await request.body()
    logger.info("Straumur webhook raw body: %s", raw_body.decode("utf-8", errors="replace"))

    payload = await request.json()
    logger.info("Straumur webhook parsed: %s", payload)

    event_type = (payload.get("additionalData") or {}).get("eventType", "")
    logger.info("Webhook eventType=%s", event_type)
    if event_type != "Authorization":
        logger.info("Ignoring non-Authorization event: %s", event_type)
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
        logger.error("HMAC verification failed for webhook payload")
        raise HTTPException(status_code=400, detail="Invalid HMAC signature")

    logger.info("HMAC verification passed")

    additional_data = payload.get("additionalData") or {}
    link_id = additional_data.get("paymentLinkIdentifier")
    success = payload.get("success") == "true"
    payfac_ref = payload.get("payfacReference", "")

    logger.info(
        "Looking up booking: paymentLinkIdentifier=%s success=%s payfacRef=%s",
        link_id, success, payfac_ref,
    )

    booking = None
    if link_id:
        booking = (
            db.query(Booking)
            .filter(Booking.payment_link_reference == link_id)
            .first()
        )

    if not booking:
        pending_count = db.query(Booking).filter(Booking.status == "pending").count()
        logger.error(
            "No booking found for paymentLinkIdentifier=%s "
            "(pending bookings in DB: %d)",
            link_id, pending_count,
        )
        if pending_count > 0:
            recent = (
                db.query(Booking)
                .filter(Booking.status == "pending")
                .order_by(Booking.created_at.desc())
                .first()
            )
            logger.error(
                "Most recent pending booking: id=%s ref=%s email=%s created=%s",
                recent.id, recent.payment_link_reference,
                recent.email, recent.created_at,
            )
        raise HTTPException(status_code=404, detail="Booking not found")

    logger.info("Found booking %s for link_id %s", booking.id, link_id)

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

        send_hotel_notification(
            passenger_name=booking.passenger_name,
            direction=booking.direction,
            date=booking.date,
            time=booking.time,
            passenger_count=booking.passenger_count,
            amount_isk=booking.amount_isk,
            email=booking.email,
            phone=booking.phone or "",
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

    send_hotel_notification(
        passenger_name=booking.passenger_name,
        direction=booking.direction,
        date=booking.date,
        time=booking.time,
        passenger_count=booking.passenger_count,
        amount_isk=booking.amount_isk,
        email=booking.email,
        phone=booking.phone or "",
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
            Booking.status == "paid",
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
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    return (
        db.query(Booking)
        .filter(Booking.date == date, Booking.status == "paid")
        .order_by(Booking.time)
        .all()
    )


@app.get("/api/admin/bookings/recent", response_model=list[BookingResponse])
def admin_recent_bookings(
    limit: int = Query(10, description="Number of recent bookings"),
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    return (
        db.query(Booking)
        .order_by(Booking.created_at.desc())
        .limit(limit)
        .all()
    )


@app.get("/health")
def health():
    return {"status": "ok"}
