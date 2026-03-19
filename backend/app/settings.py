from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./bookings.db"

    # Straumur payment gateway
    straumur_api_key: str = ""
    straumur_terminal_id: str = ""
    straumur_api_base_url: str = ""
    straumur_hmac_key: str = ""

    # Resend email
    resend_api_key: str = ""
    email_from: str = "bookings@flyershotel.is"
    hotel_notification_email: str = "stay@flyershotel.com"

    # URLs
    frontend_url: str = "http://localhost:5173"

    # Pricing
    price_per_passenger_isk: int = 2200

    # Admin dashboard
    admin_password: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
