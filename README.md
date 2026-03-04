# Shuttle Booking - Flyers Hotel

Airport shuttle booking app for Keflavík Airport (KEF) ↔ Flyers Hotel, Iceland.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS (Netlify)
- **Backend**: Python FastAPI (Railway)
- **Payments**: Straumur Pay by Link (3D Secure)
- **Email**: Resend (custom domain)
- **Database**: SQLite (dev) / PostgreSQL (production)

## Local Development

### Backend

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload
```

API runs at http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at http://localhost:5173

### Mock Payment Flow

Without Straumur credentials, the backend returns a mock payment URL
that redirects straight to the success page. To simulate the full
flow including email:

1. Book a shuttle on the frontend
2. You'll be redirected to the success page automatically
3. Call the mock confirm endpoint to trigger the email:
   ```
   curl -X POST http://localhost:8000/api/mock-confirm/{booking_id}
   ```

## Deployment

### Backend (Railway)

1. Create a new project at railway.app
2. Connect your git repo (or `railway up` from the backend folder)
3. Add a PostgreSQL database service
4. Set environment variables:
   - `DATABASE_URL` (auto-set by Railway PostgreSQL)
   - `STRAUMUR_API_KEY`, `STRAUMUR_TERMINAL_ID`, `STRAUMUR_HMAC_KEY`
   - `RESEND_API_KEY`, `EMAIL_FROM`
   - `FRONTEND_URL` (your Netlify URL)

### Frontend (Netlify)

1. Connect your git repo at netlify.com
2. Set build directory to `frontend`
3. Set environment variable:
   - `VITE_API_BASE_URL` = your Railway backend URL

### Straumur Webhook

After deploying the backend, configure the webhook in the
[Straumur Merchant Portal](https://portal.straumur.is/):

- URL: `https://your-backend.railway.app/api/webhooks/straumur`
- Events: Authorization

Copy the HMAC key from the portal and set it as `STRAUMUR_HMAC_KEY`.

## Credentials Needed

| Service | Where to get it | What you need |
|---------|----------------|---------------|
| Straumur | portal.straumur.is | API key, Terminal ID, HMAC key |
| Resend | resend.com/api-keys | API key + verify your custom domain |
