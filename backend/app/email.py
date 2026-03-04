"""
Email sending via Resend.

When the Resend API key is not configured, emails are logged to stdout
instead, so development works without a Resend account.
"""

import logging

from app.settings import settings

logger = logging.getLogger(__name__)

CONFIRMATION_SUBJECT = "Shuttle Booking Confirmed - Flyers Hotel"


def _build_confirmation_html(
    passenger_name: str,
    direction: str,
    date: str,
    time: str,
    passenger_count: int,
    amount_isk: int,
) -> str:
    direction_label = (
        "Airport → Flyers Hotel"
        if direction == "to_hotel"
        else "Flyers Hotel → Airport"
    )

    return f"""\
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
  <h1 style="font-size: 22px; color: #0f172a; margin-bottom: 8px;">Booking Confirmed</h1>
  <p style="color: #64748b; font-size: 15px; margin-bottom: 24px;">
    Thank you, {passenger_name}! Your shuttle has been booked and paid.
  </p>

  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr>
      <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #e2e8f0;">Direction</td>
      <td style="padding: 10px 0; color: #0f172a; font-weight: 600; border-bottom: 1px solid #e2e8f0; text-align: right;">{direction_label}</td>
    </tr>
    <tr>
      <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #e2e8f0;">Date</td>
      <td style="padding: 10px 0; color: #0f172a; font-weight: 600; border-bottom: 1px solid #e2e8f0; text-align: right;">{date}</td>
    </tr>
    <tr>
      <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #e2e8f0;">Time</td>
      <td style="padding: 10px 0; color: #0f172a; font-weight: 600; border-bottom: 1px solid #e2e8f0; text-align: right;">{time}</td>
    </tr>
    <tr>
      <td style="padding: 10px 0; color: #64748b; border-bottom: 1px solid #e2e8f0;">Passengers</td>
      <td style="padding: 10px 0; color: #0f172a; font-weight: 600; border-bottom: 1px solid #e2e8f0; text-align: right;">{passenger_count}</td>
    </tr>
    <tr>
      <td style="padding: 12px 0; color: #0f172a; font-weight: 700;">Total Paid</td>
      <td style="padding: 12px 0; color: #0f172a; font-weight: 700; text-align: right;">{amount_isk:,} ISK</td>
    </tr>
  </table>

  <p style="color: #94a3b8; font-size: 13px; margin-top: 32px;">
    Flyers Hotel Shuttle Service &middot; Iceland
  </p>
</div>
"""


def send_confirmation_email(
    to_email: str,
    passenger_name: str,
    direction: str,
    date: str,
    time: str,
    passenger_count: int,
    amount_isk: int,
) -> None:
    html = _build_confirmation_html(
        passenger_name=passenger_name,
        direction=direction,
        date=date,
        time=time,
        passenger_count=passenger_count,
        amount_isk=amount_isk,
    )

    if not settings.resend_api_key:
        logger.warning(
            "Resend API key not configured -- logging email instead"
        )
        logger.info(
            "Would send email to=%s subject=%s",
            to_email,
            CONFIRMATION_SUBJECT,
        )
        return

    import resend

    resend.api_key = settings.resend_api_key
    resend.Emails.send(
        {
            "from": settings.email_from,
            "to": [to_email],
            "subject": CONFIRMATION_SUBJECT,
            "html": html,
        }
    )

    logger.info("Confirmation email sent to %s", to_email)
