# Shuttle Booking - Flyers Hotel

Airport shuttle booking app for Keflavík Airport (KEF) and Flyers Airport Hotel, Iceland.

## Architecture

| Piece | Stack |
|--------|--------|
| Frontend | React, Vite, Tailwind (hosted on **Netlify**) |
| Backend | Python **FastAPI** (hosted on **Railway**) |
| Payments | **Straumur** Pay by Link (3-D Secure) |
| Email | **Resend** (custom domain) |
| Database | SQLite locally / **PostgreSQL** on Railway |

---

## Production checklist

Use this when setting up or debugging live traffic.

### 1. Backend (Railway)

1. Create a Railway project and connect this GitHub repo (or deploy from the `backend` root).
2. Add a **PostgreSQL** plugin; Railway injects `DATABASE_URL`.
3. Set **all** variables in the table below (see [Environment variables](#environment-variables)).
4. Confirm the public URL (for example `https://shuttle-booking-production.up.railway.app`) and use it in the frontend and in Straumur.

### 2. Frontend (Netlify)

1. Connect the repo; set **base directory** to `frontend`.
2. Build command: `npm run build`; publish directory: `dist` (see `frontend/netlify.toml`).
3. Set `VITE_API_BASE_URL` to your **Railway backend URL** (no trailing slash), for example `https://shuttle-booking-production.up.railway.app`.
4. Redeploy after changing env vars.

### 3. Straumur (payments and webhooks)

1. In the [Straumur Merchant Portal](https://portal.straumur.is/), configure a webhook:
   - **URL**: `https://<your-railway-host>/api/webhooks/straumur`
   - **Event**: **Authorization** (required; other event types are ignored by the app).
2. Copy the **HMAC** secret into Railway as `STRAUMUR_HMAC_KEY` (hex string from the portal).
3. Ensure `STRAUMUR_API_KEY` and `STRAUMUR_TERMINAL_ID` match the same merchant/terminal.

Without `STRAUMUR_API_KEY`, the API runs in **mock payment mode**: customers skip the real gateway and **no** `payment_link_reference` is stored, so **Straumur webhooks cannot be matched** to a booking. Use mock mode only for local UI tests; production needs real credentials.

### 4. Admin dashboard

- Open `https://<your-netlify-site>/admin`.
- Enter the same password as the backend **`ADMIN_PASSWORD`** (stored only on the server). There is no separate frontend secret; the browser sends `Authorization: Bearer <password>` to the API.

---

## Environment variables

### Backend (`backend/.env` locally, Railway Variables in production)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL URL on Railway (auto from the Postgres service). |
| `FRONTEND_URL` | Yes | Public site URL (Netlify), used for payment return links and CORS. |
| `STRAUMUR_API_KEY` | For real payments | Omit only for local mock flow. |
| `STRAUMUR_TERMINAL_ID` | For real payments | 12-character terminal id from the portal. |
| `STRAUMUR_HMAC_KEY` | For webhook verification | Hex HMAC key from Straumur; must match the portal. |
| `STRAUMUR_API_BASE_URL` | No | Override only if Straumur gives you a non-default API base (see `.env.example`). |
| `RESEND_API_KEY` | Yes for email | |
| `EMAIL_FROM` | Yes | Verified sender in Resend, e.g. `bookings@yourdomain.is`. |
| `ADMIN_PASSWORD` | Yes for `/admin` | Same value you type on the admin login page. |

### Frontend (Netlify)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Full origin of the FastAPI service, e.g. `https://xxx.up.railway.app`. |

---

## How payment confirmation works

1. Customer submits a booking; the backend creates a **Straumur payment link** and saves **`payment_link_reference`** on the booking row.
2. After payment, Straumur sends a **POST** to `/api/webhooks/straumur` with `additionalData.paymentLinkIdentifier`.
3. The backend finds the booking where `payment_link_reference` equals that identifier, marks it **paid**, and sends confirmation emails.

If the identifier does not match any row (wrong DB, mock booking, or missing reference), the handler **still returns HTTP 200** with a JSON error body so the webhook URL is not confused with a missing route. Check **Railway deploy logs** for lines containing `No booking found for paymentLinkIdentifier` or `Looking up booking`.

---

## Local development

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env: at minimum FRONTEND_URL, ADMIN_PASSWORD; add Straumur + Resend for full flow
uv sync
uv run uvicorn app.main:app --reload
```

API: http://localhost:8000 — health: `GET /health`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173 — set `VITE_API_BASE_URL=http://localhost:8000` in `frontend/.env` if needed.

### Mock payment flow (no Straumur keys)

The backend returns a mock success URL. No webhook will match a booking.

1. Complete a booking in the UI.
2. To trigger emails as if payment succeeded, call (replace `{id}` with the booking id from the URL or API):

   ```bash
   curl -X POST "http://localhost:8000/api/mock-confirm/{booking_id}" \
     -H "Authorization: Bearer YOUR_ADMIN_PASSWORD"
   ```

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Webhook “does nothing” / emails never sent | Railway logs for `Straumur webhook`; confirm **Authorization** event in portal; confirm `STRAUMUR_HMAC_KEY`; confirm booking has `payment_link_reference` (real Pay by Link only). |
| Log shows `booking_not_found` or “No booking found for paymentLinkIdentifier” | Same database as bookings; payment used real link (not mock); `payment_link_reference` saved at booking time. |
| Admin API returns 401 | `ADMIN_PASSWORD` set on Railway; same password entered on `/admin`. |
| CORS errors | `FRONTEND_URL` on the backend must match your Netlify site origin exactly (scheme + host). |

---

## Credentials overview

| Service | Where to get credentials |
|---------|----------------------------|
| Straumur | [portal.straumur.is](https://portal.straumur.is/) — API key, Terminal ID, HMAC key, webhook URL |
| Resend | [resend.com](https://resend.com) — API key; verify sending domain |
| Railway | Project settings — Postgres, env vars, public URL |
| Netlify | Site settings — build, `VITE_API_BASE_URL` |
