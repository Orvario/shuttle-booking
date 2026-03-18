"""
Straumur payment gateway integration.

Uses the Pay by Link API to create hosted payment pages.
Docs: https://docs.straumur.is/payment-gateway/payment-links/api/create-payment-link

When credentials are not configured, falls back to a mock flow that
redirects directly to the success page.
"""

import base64
import hashlib
import hmac
import logging

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)

DEFAULT_URL = "https://greidslugatt.straumur.is/api/v1"


def _api_base() -> str:
    return settings.straumur_api_base_url or DEFAULT_URL


class PaymentLinkResult:
    def __init__(self, url: str, reference: str | None = None):
        self.url = url
        self.reference = reference


async def create_payment_link(
    booking_id: str,
    amount_isk: int,
    description: str,
    passenger_name: str,
    email: str,
) -> PaymentLinkResult:
    """Create a Straumur pay-by-link and return the payment URL + reference."""

    if not settings.straumur_api_key:
        logger.warning(
            "Straumur API key not configured -- using mock payment redirect"
        )
        return PaymentLinkResult(
            url=(
                f"{settings.frontend_url}/success"
                f"?booking_id={booking_id}&mock_payment=true"
            ),
        )

    amount_minor = amount_isk * 100

    payload = {
        "type": "PayByLink",
        "terminalIdentifier": settings.straumur_terminal_id,
        "amount": amount_minor,
        "currency": "ISK",
        "description": f"Booking {booking_id}: {description}",
        "returnUrl": (
            f"{settings.frontend_url}/success?booking_id={booking_id}"
        ),
        "items": [
            {
                "name": description,
                "quantity": 1,
                "amount": amount_minor,
                "unitPrice": amount_minor,
                "amountWithoutDiscount": amount_minor,
            }
        ],
        "shopperInfos": [
            {
                "field": "EmailAddress",
                "requirementType": "Prefilled",
                "prefilledValue": email,
            },
            {
                "field": "FullName",
                "requirementType": "Prefilled",
                "prefilledValue": passenger_name,
            },
            {
                "field": "Telephone",
                "requirementType": "Optional",
            },
        ],
        "exactSalesCount": 1,
    }

    url = f"{_api_base()}/paymentlinks/create"
    logger.info("Straumur request: POST %s", url)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "X-API-Key": settings.straumur_api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except Exception:
        logger.exception("Straumur connection error for %s", url)
        raise

    if not response.is_success:
        logger.error(
            "Straumur API error: status=%s body=%s headers=%s",
            response.status_code,
            response.text,
            dict(response.headers),
        )
        from fastapi import HTTPException
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Payment gateway error",
                "straumur_status": response.status_code,
                "straumur_body": response.text[:500],
            },
        )
    data = response.json()

    ref = data.get("paymentLinkReference")
    logger.info(
        "Straumur payment link created: ref=%s url=%s",
        ref,
        data.get("url"),
    )

    return PaymentLinkResult(url=data["url"], reference=ref)


def verify_webhook_hmac(
    checkout_reference: str | None,
    payfac_reference: str,
    merchant_reference: str | None,
    amount: str,
    currency: str,
    reason: str | None,
    success: str,
    received_signature: str,
) -> bool:
    """
    Verify the Straumur webhook HMAC signature.

    Signature is computed over the colon-separated values:
    CheckoutReference:PayfacReference:MerchantReference:Amount:Currency:Reason:Success

    Key is hex-encoded, hash is SHA-256, result is base64.
    """
    if not settings.straumur_hmac_key:
        logger.warning(
            "Straumur HMAC key not configured -- skipping verification"
        )
        return True

    values = [
        checkout_reference or "",
        payfac_reference,
        merchant_reference or "",
        amount,
        currency,
        reason or "",
        success,
    ]
    payload_str = ":".join(values)
    payload_bytes = payload_str.encode("utf-8")

    hex_key = settings.straumur_hmac_key
    if len(hex_key) % 2 == 1:
        hex_key += "0"
    key_bytes = bytes.fromhex(hex_key)

    computed = hmac.new(key_bytes, payload_bytes, hashlib.sha256).digest()
    computed_b64 = base64.b64encode(computed).decode("utf-8")

    return hmac.compare_digest(computed_b64, received_signature)
