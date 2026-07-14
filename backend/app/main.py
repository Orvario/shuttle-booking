import json
import logging
import secrets
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from sqlalchemy import func

from app.database import Base, SessionLocal, engine, get_db
from app.email import send_confirmation_email, send_hotel_notification
from app.models import BlackoutDate, Booking, ShuttleTimeException, ShuttleTimeSlot
from app.schemas import (
    BlackoutDateCreate,
    BlackoutDateResponse,
    BookingCreated,
    BookingPayment,
    BookingRequest,
    BookingResponse,
    CalendarDay,
    ShuttleTimeExceptionCreate,
    ShuttleTimeExceptionResponse,
    ShuttleTimeSlotCreate,
    ShuttleTimeSlotResponse,
    DepartureSlotPublic,
    ShuttleTimesPublicResponse,
)
from app.settings import settings
from app.straumur import (
    PaymentLinkResult,
    create_payment_link,
    get_payment_link_details,
    verify_webhook_hmac,
)

PRICE_TABLE_ISK = {
    1: 4400,
    2: 4400,
    3: 5100,
    4: 5800,
    5: 6500,
    6: 7200,
    7: 7900,
}

SHUTTLE_CAPACITY = 7

PENDING_BOOKING_WINDOW_HOURS = 24

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
    columns = [c["name"] for c in inspector.get_columns("bookings")]
    if "payment_url" not in columns:
        conn.execute(text(
            "ALTER TABLE bookings ADD COLUMN payment_url VARCHAR(500)"
        ))
        conn.commit()
        logger.info("Added payment_url column to bookings table")


def _seed_default_shuttle_slots_if_empty() -> None:
    """First deploy: same four daily times as the original hard-coded schedule."""
    db = SessionLocal()
    try:
        if db.query(ShuttleTimeSlot).count() > 0:
            return
        for t in ("05:00", "06:00", "07:00", "14:00"):
            db.add(
                ShuttleTimeSlot(
                    id=str(uuid.uuid4()),
                    departure_time=t,
                    recurrence="daily",
                    event_date=None,
                    weekday=None,
                )
            )
        db.commit()
        logger.info("Seeded default daily shuttle time slots")
    except Exception:
        logger.exception("Shuttle time slot seed failed")
        db.rollback()
    finally:
        db.close()


_seed_default_shuttle_slots_if_empty()

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


def _success_page_url(booking_id: str) -> str:
    return f"{settings.frontend_url}/success?booking_id={booking_id}"


def _is_date_blacked_out(db: Session, date_str: str) -> bool:
    return (
        db.query(BlackoutDate).filter(BlackoutDate.date == date_str).first()
        is not None
    )


def _python_weekday_for_date(date_str: str) -> int:
    from datetime import datetime

    return datetime.strptime(date_str, "%Y-%m-%d").date().weekday()


def _departure_times_for_date(db: Session, date_str: str) -> list[str]:
    """Union of all active slot rules that apply to this calendar date."""
    wd = _python_weekday_for_date(date_str)
    times: set[str] = set()
    for slot in db.query(ShuttleTimeSlot).all():
        if slot.recurrence == "daily":
            times.add(slot.departure_time)
        elif slot.recurrence == "weekly":
            if slot.weekday == wd:
                times.add(slot.departure_time)
        elif slot.recurrence == "once":
            if slot.event_date == date_str:
                times.add(slot.departure_time)
    excluded = {
        e.departure_time
        for e in db.query(ShuttleTimeException)
        .filter(ShuttleTimeException.calendar_date == date_str)
        .all()
    }
    return sorted(times - excluded)


def _count_bookings_for_shuttle_slot(db: Session, slot: ShuttleTimeSlot) -> int:
    """How many bookings match this rule (any status)."""
    if slot.recurrence == "daily":
        return (
            db.query(Booking)
            .filter(Booking.time == slot.departure_time)
            .count()
        )
    if slot.recurrence == "weekly":
        if slot.weekday is None:
            return 0
        n = 0
        for b in db.query(Booking).filter(Booking.time == slot.departure_time).all():
            if _python_weekday_for_date(b.date) == slot.weekday:
                n += 1
        return n
    if slot.recurrence == "once":
        if not slot.event_date:
            return 0
        return (
            db.query(Booking)
            .filter(
                Booking.date == slot.event_date,
                Booking.time == slot.departure_time,
            )
            .count()
        )
    return 0


def _booked_passengers_for_departure(
    db: Session,
    date: str,
    time: str,
    *,
    exclude_booking_id: str | None = None,
) -> int:
    """Passengers already reserved on this departure (pending or paid)."""
    q = db.query(func.sum(Booking.passenger_count)).filter(
        Booking.date == date,
        Booking.time == time,
        Booking.status.in_(["pending", "paid"]),
    )
    if exclude_booking_id:
        q = q.filter(Booking.id != exclude_booking_id)
    return int(q.scalar() or 0)


def _remaining_seats_for_departure(
    db: Session,
    date: str,
    time: str,
    *,
    exclude_booking_id: str | None = None,
) -> int:
    booked = _booked_passengers_for_departure(
        db, date, time, exclude_booking_id=exclude_booking_id
    )
    return max(0, SHUTTLE_CAPACITY - booked)


def _find_recent_duplicate(
    db: Session,
    req: BookingRequest,
) -> Booking | None:
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(hours=PENDING_BOOKING_WINDOW_HOURS)
    return (
        db.query(Booking)
        .filter(
            Booking.email == req.email,
            Booking.date == req.date,
            Booking.time == req.time,
            Booking.direction == req.direction,
            Booking.status.in_(["pending", "paid"]),
            Booking.created_at >= cutoff,
        )
        .order_by(Booking.created_at.desc())
        .first()
    )


async def _attach_payment_link(
    booking: Booking,
    db: Session,
    description: str,
) -> PaymentLinkResult:
    result = await create_payment_link(
        booking_id=booking.id,
        amount_isk=booking.amount_isk,
        description=description,
        passenger_name=booking.passenger_name,
        email=booking.email,
    )
    booking.payment_url = result.url
    if result.reference:
        booking.payment_link_reference = result.reference
    db.commit()
    return result


async def _resolve_payment_url(
    booking: Booking,
    db: Session,
    description: str,
) -> str:
    if booking.payment_link_reference and settings.straumur_api_key:
        details = await get_payment_link_details(booking.payment_link_reference)
        if details:
            if details.is_payable and details.url:
                booking.payment_url = details.url
                db.commit()
                return details.url
            if details.status == "Used":
                logger.info(
                    "Payment link %s already used for booking %s — "
                    "awaiting webhook confirmation",
                    booking.payment_link_reference,
                    booking.id,
                )
                return _success_page_url(booking.id)

    if booking.payment_url and not settings.straumur_api_key:
        return booking.payment_url

    result = await _attach_payment_link(booking, db, description)
    return result.url


@app.post("/api/bookings", response_model=BookingCreated)
async def create_booking(
    req: BookingRequest,
    db: Session = Depends(get_db),
):
    if req.direction != "to_airport":
        raise HTTPException(status_code=400, detail="Only hotel-to-airport shuttles available")
    if req.passenger_count < 1 or req.passenger_count > SHUTTLE_CAPACITY:
        raise HTTPException(
            status_code=400,
            detail=f"1-{SHUTTLE_CAPACITY} passengers allowed per booking",
        )

    from datetime import datetime, timedelta, timezone
    try:
        booking_dt = datetime.strptime(f"{req.date} {req.time}", "%Y-%m-%d %H:%M")
        booking_dt = booking_dt.replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date or time format")
    now = datetime.now(timezone.utc)
    cutoff = (booking_dt - timedelta(days=1)).replace(hour=22, minute=0, second=0, microsecond=0)
    if now >= cutoff:
        raise HTTPException(
            status_code=400,
            detail="Bookings must be made before 10:00 pm the day before departure",
        )

    amount = PRICE_TABLE_ISK[req.passenger_count]

    direction_label = (
        "Airport to Flyers Hotel"
        if req.direction == "to_hotel"
        else "Flyers Hotel to Airport"
    )
    payment_description = (
        f"Shuttle {direction_label} - {req.passenger_count} pax"
    )

    existing = _find_recent_duplicate(db, req)
    if existing:
        if existing.status == "paid":
            logger.info(
                "Duplicate booking attempt for already-paid booking %s",
                existing.id,
            )
            return BookingCreated(
                booking_id=existing.id,
                payment_url=_success_page_url(existing.id),
                already_paid=True,
            )

        logger.info(
            "Resuming pending booking %s for %s (no new charge)",
            existing.id,
            req.email,
        )
        payment_url = await _resolve_payment_url(
            existing, db, payment_description
        )
        return BookingCreated(
            booking_id=existing.id,
            payment_url=payment_url,
        )

    allowed_times = _departure_times_for_date(db, req.date)
    if req.time not in allowed_times:
        raise HTTPException(status_code=400, detail="Invalid departure time")

    if _is_date_blacked_out(db, req.date):
        raise HTTPException(
            status_code=400,
            detail="This departure date is not available for booking.",
        )

    remaining = _remaining_seats_for_departure(db, req.date, req.time)
    if req.passenger_count > remaining:
        if remaining == 0:
            raise HTTPException(
                status_code=400,
                detail="This departure is full. Please choose another time.",
            )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only {remaining} seat{'s' if remaining != 1 else ''} "
                f"remaining for this departure."
            ),
        )

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

    result = await _attach_payment_link(booking, db, payment_description)

    logger.info(
        "Payment link result for booking %s: url=%s reference=%s",
        booking.id, result.url, result.reference,
    )

    if not result.reference:
        logger.warning(
            "No payment link reference returned for booking %s",
            booking.id,
        )

    return BookingCreated(booking_id=booking.id, payment_url=result.url)


@app.get("/api/bookings/{booking_id}", response_model=BookingResponse)
def get_booking(booking_id: str, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@app.get("/api/bookings/{booking_id}/payment", response_model=BookingPayment)
async def get_booking_payment(
    booking_id: str,
    db: Session = Depends(get_db),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status == "paid":
        return BookingPayment(
            booking_id=booking.id,
            payment_url=_success_page_url(booking.id),
            status=booking.status,
        )

    if booking.status != "pending":
        raise HTTPException(
            status_code=400,
            detail="This booking cannot be paid. Please start a new booking.",
        )

    direction_label = (
        "Airport to Flyers Hotel"
        if booking.direction == "to_hotel"
        else "Flyers Hotel to Airport"
    )
    payment_url = await _resolve_payment_url(
        booking,
        db,
        f"Shuttle {direction_label} - {booking.passenger_count} pax",
    )
    return BookingPayment(
        booking_id=booking.id,
        payment_url=payment_url,
        status=booking.status,
    )


@app.get("/api/blackouts", response_model=list[BlackoutDateResponse])
def list_blackouts_public(db: Session = Depends(get_db)):
    """Dates blocked from new public bookings (used by the booking form)."""
    rows = (
        db.query(BlackoutDate)
        .order_by(BlackoutDate.date.asc())
        .all()
    )
    return rows


@app.get("/api/shuttle-times", response_model=ShuttleTimesPublicResponse)
def get_shuttle_times_public(
    date: str = Query(..., description="Departure date YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    from datetime import datetime

    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format") from None
    times = _departure_times_for_date(db, date)
    slots = [
        DepartureSlotPublic(
            time=t,
            remaining_seats=_remaining_seats_for_departure(db, date, t),
        )
        for t in times
    ]
    return ShuttleTimesPublicResponse(slots=slots)


def _webhook_success(payload: dict) -> bool:
    """Straumur docs show success as the string 'true'/'false'; accept booleans too."""
    raw = payload.get("success")
    if isinstance(raw, bool):
        return raw
    return str(raw).lower() == "true"


@app.post("/api/webhooks/straumur")
async def straumur_webhook(request: Request, db: Session = Depends(get_db)):
    raw_body = await request.body()
    raw_text = raw_body.decode("utf-8", errors="replace")
    logger.info("Straumur webhook raw body: %s", raw_text)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as e:
        logger.error("Straumur webhook invalid JSON: %s", e)
        raise HTTPException(status_code=400, detail="Invalid JSON body") from e

    logger.info("Straumur webhook parsed: %s", payload)

    additional_data = payload.get("additionalData")
    if not isinstance(additional_data, dict):
        additional_data = {}
    event_type = (additional_data.get("eventType") or "").strip()
    logger.info("Webhook eventType=%s", event_type)
    if event_type.lower() != "authorization":
        logger.warning(
            "Ignoring non-Authorization event: %r (only Authorization is processed)",
            event_type,
        )
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

    link_id = (
        additional_data.get("paymentLinkReference")
        or additional_data.get("paymentLinkIdentifier")
    )
    success = _webhook_success(payload)
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
        # 200 so the gateway treats the webhook URL as valid (avoids 404 in access
        # logs looking like a missing route). Correlation failure is in body + logs.
        return JSONResponse(
            status_code=200,
            content={
                "status": "error",
                "error": "booking_not_found",
                "paymentLinkIdentifier": link_id,
            },
        )

    logger.info("Found booking %s (status=%s) for link_id %s", booking.id, booking.status, link_id)

    if booking.status == "paid":
        logger.info("Booking %s already paid — ignoring duplicate webhook", booking.id)
        return {"status": "ok", "detail": "already_paid"}

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


def _admin_shuttle_slot_exists(db: Session, body: ShuttleTimeSlotCreate) -> bool:
    q = db.query(ShuttleTimeSlot)
    if body.recurrence == "daily":
        return (
            q.filter(
                ShuttleTimeSlot.recurrence == "daily",
                ShuttleTimeSlot.departure_time == body.departure_time,
            ).first()
            is not None
        )
    if body.recurrence == "weekly":
        return (
            q.filter(
                ShuttleTimeSlot.recurrence == "weekly",
                ShuttleTimeSlot.weekday == body.weekday,
                ShuttleTimeSlot.departure_time == body.departure_time,
            ).first()
            is not None
        )
    return (
        q.filter(
            ShuttleTimeSlot.recurrence == "once",
            ShuttleTimeSlot.event_date == body.event_date,
            ShuttleTimeSlot.departure_time == body.departure_time,
        ).first()
        is not None
    )


@app.get("/api/admin/blackouts", response_model=list[BlackoutDateResponse])
def admin_list_blackouts(
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    rows = (
        db.query(BlackoutDate)
        .order_by(BlackoutDate.date.asc())
        .all()
    )
    return rows


@app.post("/api/admin/blackouts", response_model=BlackoutDateResponse)
def admin_add_blackout(
    body: BlackoutDateCreate,
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    if db.query(BlackoutDate).filter(BlackoutDate.date == body.date).first():
        raise HTTPException(
            status_code=409,
            detail="This date is already blocked.",
        )
    row = BlackoutDate(date=body.date)
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("Blackout added for date %s", body.date)
    return row


@app.delete("/api/admin/blackouts/{date}")
def admin_remove_blackout(
    date: str,
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    row = db.query(BlackoutDate).filter(BlackoutDate.date == date).first()
    if not row:
        raise HTTPException(status_code=404, detail="Blackout not found")
    db.delete(row)
    db.commit()
    logger.info("Blackout removed for date %s", date)
    return {"status": "ok", "date": date}


@app.get("/api/admin/shuttle-time-slots", response_model=list[ShuttleTimeSlotResponse])
def admin_list_shuttle_time_slots(
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    return (
        db.query(ShuttleTimeSlot)
        .order_by(
            ShuttleTimeSlot.recurrence.asc(),
            ShuttleTimeSlot.weekday.asc().nullsfirst(),
            ShuttleTimeSlot.event_date.asc().nullsfirst(),
            ShuttleTimeSlot.departure_time.asc(),
        )
        .all()
    )


@app.post("/api/admin/shuttle-time-slots", response_model=ShuttleTimeSlotResponse)
def admin_add_shuttle_time_slot(
    body: ShuttleTimeSlotCreate,
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    if _admin_shuttle_slot_exists(db, body):
        raise HTTPException(
            status_code=409,
            detail="An identical departure rule already exists.",
        )
    row = ShuttleTimeSlot(
        id=str(uuid.uuid4()),
        departure_time=body.departure_time,
        recurrence=body.recurrence,
        event_date=body.event_date,
        weekday=body.weekday,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        "Shuttle time slot added: %s %s",
        body.departure_time,
        body.recurrence,
    )
    return row


@app.delete("/api/admin/shuttle-time-slots/{slot_id}")
def admin_delete_shuttle_time_slot(
    slot_id: str,
    force: bool = Query(False, description="Set true after confirming removal despite bookings"),
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    row = db.query(ShuttleTimeSlot).filter(ShuttleTimeSlot.id == slot_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Time slot not found")
    booking_count = _count_bookings_for_shuttle_slot(db, row)
    if booking_count > 0 and not force:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "bookings_exist",
                "message": (
                    f"This departure rule matches {booking_count} existing "
                    f"booking(s). Removing it stops new bookings for this time; "
                    f"existing records are unchanged."
                ),
                "booking_count": booking_count,
            },
        )
    db.delete(row)
    db.commit()
    logger.info("Shuttle time slot removed: %s", slot_id)
    return {"status": "ok", "id": slot_id}


@app.get(
    "/api/admin/shuttle-time-exceptions",
    response_model=list[ShuttleTimeExceptionResponse],
)
def admin_list_shuttle_time_exceptions(
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    return (
        db.query(ShuttleTimeException)
        .order_by(
            ShuttleTimeException.calendar_date.asc(),
            ShuttleTimeException.departure_time.asc(),
        )
        .all()
    )


@app.post(
    "/api/admin/shuttle-time-exceptions",
    response_model=ShuttleTimeExceptionResponse,
)
def admin_add_shuttle_time_exception(
    body: ShuttleTimeExceptionCreate,
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    if (
        db.query(ShuttleTimeException)
        .filter(
            ShuttleTimeException.calendar_date == body.calendar_date,
            ShuttleTimeException.departure_time == body.departure_time,
        )
        .first()
    ):
        raise HTTPException(
            status_code=409,
            detail="This departure is already hidden on that date.",
        )
    row = ShuttleTimeException(
        id=str(uuid.uuid4()),
        calendar_date=body.calendar_date,
        departure_time=body.departure_time,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        "Shuttle time exception added: %s %s",
        body.calendar_date,
        body.departure_time,
    )
    return row


@app.delete("/api/admin/shuttle-time-exceptions/{exception_id}")
def admin_delete_shuttle_time_exception(
    exception_id: str,
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    row = (
        db.query(ShuttleTimeException)
        .filter(ShuttleTimeException.id == exception_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Exception not found")
    db.delete(row)
    db.commit()
    logger.info("Shuttle time exception removed: %s", exception_id)
    return {"status": "ok", "id": exception_id}


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


@app.delete("/api/admin/bookings/purge")
def admin_purge_unpaid(
    db: Session = Depends(get_db),
    _auth: None = Depends(_verify_admin),
):
    count = db.query(Booking).filter(Booking.status != "paid").delete()
    db.commit()
    return {"deleted": count}


@app.get("/health")
def health():
    return {"status": "ok"}
