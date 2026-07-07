import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL, PRICE_TABLE_ISK, ROUTE } from '../config';
import {
  COUNTRY_DIAL_CODES_SORTED,
  countryOptionLabel,
  dialCodeForCountry,
} from '../countryCodes';

const PENDING_BOOKING_KEY = 'shuttle_pending_booking_id';

interface PendingBooking {
  id: string;
  status: string;
  date: string;
  time: string;
  passenger_name: string;
  amount_isk: number;
}

const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 7;
const CUTOFF_HOUR = 22;

export default function BookingForm() {
  const navigate = useNavigate();
  const direction = 'to_airport';
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryIso, setCountryIso] = useState('IS');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState('');
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  const [blackoutDates, setBlackoutDates] = useState<Set<string>>(new Set());
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [timesLoading, setTimesLoading] = useState(false);

  const totalPrice = PRICE_TABLE_ISK[passengers] ?? 0;

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/blackouts`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { date: string }[]) => {
        setBlackoutDates(new Set(rows.map((x) => x.date)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!date) {
      setAvailableTimes([]);
      setTime('');
      return;
    }
    setTimesLoading(true);
    fetch(`${API_BASE_URL}/api/shuttle-times?date=${encodeURIComponent(date)}`)
      .then((r) => (r.ok ? r.json() : { times: [] }))
      .then((data: { times?: string[] }) => {
        const times = data.times ?? [];
        setAvailableTimes(times);
        setTime((prev) => (prev && times.includes(prev) ? prev : ''));
      })
      .catch(() => {
        setAvailableTimes([]);
        setTime('');
      })
      .finally(() => setTimesLoading(false));
  }, [date]);

  useEffect(() => {
    const storedId = sessionStorage.getItem(PENDING_BOOKING_KEY);
    if (!storedId) return;

    fetch(`${API_BASE_URL}/api/bookings/${storedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PendingBooking | null) => {
        if (!data) {
          sessionStorage.removeItem(PENDING_BOOKING_KEY);
          return;
        }
        if (data.status === 'paid') {
          sessionStorage.removeItem(PENDING_BOOKING_KEY);
          navigate(`/success?booking_id=${data.id}`);
          return;
        }
        if (data.status === 'pending') {
          setPendingBooking(data);
        } else {
          sessionStorage.removeItem(PENDING_BOOKING_KEY);
        }
      })
      .catch(() => {});
  }, [navigate]);

  async function redirectToPayment(bookingId: string, paymentUrl: string) {
    sessionStorage.setItem(PENDING_BOOKING_KEY, bookingId);
    window.location.href = paymentUrl;
  }

  async function handleResumePayment() {
    if (!pendingBooking) return;
    setError('');
    setResuming(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/bookings/${pendingBooking.id}/payment`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || 'Could not resume payment');
      }
      const data = await res.json();
      if (data.status === 'paid') {
        sessionStorage.removeItem(PENDING_BOOKING_KEY);
        navigate(`/success?booking_id=${data.booking_id}`);
        return;
      }
      await redirectToPayment(data.booking_id, data.payment_url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resume payment');
      setResuming(false);
    }
  }

  function dismissPendingBooking() {
    sessionStorage.removeItem(PENDING_BOOKING_KEY);
    setPendingBooking(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const departureDateObj = new Date(`${date}T00:00:00`);
      const cutoff = new Date(departureDateObj);
      cutoff.setDate(cutoff.getDate() - 1);
      cutoff.setHours(CUTOFF_HOUR, 0, 0, 0);
      if (new Date() >= cutoff) {
        throw new Error('Bookings must be made before 10:00 pm the day before departure.');
      }

      if (blackoutDates.has(date)) {
        throw new Error('This date is not available for booking. Please choose another day.');
      }

      if (!availableTimes.includes(time)) {
        throw new Error('Please select a valid departure time for this date.');
      }

      const res = await fetch(`${API_BASE_URL}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction,
          date,
          time,
          passenger_count: passengers,
          passenger_name: name,
          email,
          phone: `${dialCodeForCountry(countryIso)} ${phone}`,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = body?.detail;
        const message =
          typeof detail === 'string'
            ? detail
            : detail?.error || 'Failed to create booking';
        throw new Error(message);
      }

      const data = await res.json();

      if (data.already_paid) {
        sessionStorage.removeItem(PENDING_BOOKING_KEY);
        navigate(`/success?booking_id=${data.booking_id}`);
        return;
      }

      if (data.payment_url) {
        setPendingBooking(null);
        await redirectToPayment(data.booking_id, data.payment_url);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <section id="booking" className="max-w-2xl mx-auto px-6 py-16">
      <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">
        Book Your Ride
      </h2>
      <p className="text-slate-500 text-center mb-8">
        {ROUTE.to} → {ROUTE.from}
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-6"
      >

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-slate-700 mb-1">
              Date
            </label>
            <input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 ${
                date && blackoutDates.has(date)
                  ? 'border-rose-400 bg-rose-50'
                  : 'border-slate-300'
              }`}
            />
            {date && blackoutDates.has(date) && (
              <p className="mt-1 text-xs text-rose-600">
                This date is closed for shuttle bookings. Please select another date.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="time" className="block text-sm font-medium text-slate-700 mb-1">
              Time
            </label>
            <select
              id="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date || timesLoading}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="" disabled>
                {!date
                  ? 'Select a date first'
                  : timesLoading
                    ? 'Loading times...'
                    : availableTimes.length === 0
                      ? 'No departures this day'
                      : 'Select time'}
              </option>
              {availableTimes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {date && !timesLoading && availableTimes.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                No shuttle departures are scheduled for this date. Choose another date.
              </p>
            )}
          </div>
        </div>

        {/* Passengers */}
        <div>
          <label htmlFor="passengers" className="block text-sm font-medium text-slate-700 mb-1">
            Number of Passengers
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPassengers(Math.max(MIN_PASSENGERS, passengers - 1))}
              disabled={passengers <= MIN_PASSENGERS}
              className="w-10 h-10 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              −
            </button>
            <input
              id="passengers"
              type="number"
              min={MIN_PASSENGERS}
              max={MAX_PASSENGERS}
              required
              value={passengers}
              onChange={(e) => {
                const v = parseInt(e.target.value) || MIN_PASSENGERS;
                setPassengers(Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, v)));
              }}
              className="w-20 text-center rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
            <button
              type="button"
              onClick={() => setPassengers(Math.min(MAX_PASSENGERS, passengers + 1))}
              disabled={passengers >= MAX_PASSENGERS}
              className="w-10 h-10 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {MIN_PASSENGERS}–{MAX_PASSENGERS} passengers (shuttle capacity)
          </p>
        </div>

        {/* Contact details */}
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
              Phone <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={countryIso}
                onChange={(e) => setCountryIso(e.target.value)}
                aria-label="Country code"
                className="w-full sm:w-auto sm:min-w-[6.5rem] sm:max-w-[9.5rem] rounded-lg border border-slate-300 px-2 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white sm:flex-shrink-0"
              >
                {COUNTRY_DIAL_CODES_SORTED.map((c) => (
                  <option key={c.iso2} value={c.iso2}>
                    {countryOptionLabel(c)}
                  </option>
                ))}
              </select>
              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Price summary */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
            <span>{passengers} passenger{passengers > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-slate-900">Total</span>
            <span className="text-lg font-bold text-slate-900">
              {totalPrice.toLocaleString()} ISK
            </span>
          </div>
        </div>

        {pendingBooking && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900 space-y-3">
            <p>
              You have an unfinished payment for{' '}
              <strong>{pendingBooking.date}</strong> at{' '}
              <strong>{pendingBooking.time}</strong>. Resume payment instead of
              booking again to avoid being charged twice.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleResumePayment}
                disabled={resuming}
                className="bg-amber-600 hover:bg-amber-500 disabled:bg-amber-300 text-white font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-wait"
              >
                {resuming ? 'Opening payment...' : 'Resume payment'}
              </button>
              <button
                type="button"
                onClick={dismissPendingBooking}
                className="text-amber-800 underline hover:text-amber-900 cursor-pointer"
              >
                Start a new booking
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={
            submitting
            || (Boolean(date) && blackoutDates.has(date))
            || !time
            || timesLoading
            || availableTimes.length === 0
          }
          className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-sky-300 text-white font-semibold py-3 rounded-xl shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {submitting ? 'Processing...' : `Pay ${totalPrice.toLocaleString()} ISK`}
        </button>

        <p className="text-xs text-slate-400 text-center">
          You will be redirected to a secure payment page to complete your booking.
          If you close the payment window, return here and use{' '}
          <strong className="text-slate-500">Resume payment</strong> — do not submit
          the form again. By proceeding, you agree to our{' '}
          <Link to="/privacy" className="underline hover:text-slate-500">Privacy Policy</Link>.
        </p>
      </form>
    </section>
  );
}
