import { useState, type FormEvent } from 'react';
import { API_BASE_URL, PRICE_PER_PASSENGER_ISK, ROUTE } from '../config';

type Direction = 'to_hotel' | 'to_airport';

const TIME_SLOTS = Array.from({ length: 13 }, (_, i) => {
  const hour = (4 + i).toString().padStart(2, '0');
  return `${hour}:30`;
});

const COUNTRY_CODES = [
  { code: '+354', flag: '\u{1F1EE}\u{1F1F8}', label: 'Iceland' },
  { code: '+1', flag: '\u{1F1FA}\u{1F1F8}', label: 'USA' },
  { code: '+44', flag: '\u{1F1EC}\u{1F1E7}', label: 'UK' },
  { code: '+49', flag: '\u{1F1E9}\u{1F1EA}', label: 'Germany' },
  { code: '+33', flag: '\u{1F1EB}\u{1F1F7}', label: 'France' },
  { code: '+34', flag: '\u{1F1EA}\u{1F1F8}', label: 'Spain' },
  { code: '+39', flag: '\u{1F1EE}\u{1F1F9}', label: 'Italy' },
  { code: '+31', flag: '\u{1F1F3}\u{1F1F1}', label: 'Netherlands' },
  { code: '+46', flag: '\u{1F1F8}\u{1F1EA}', label: 'Sweden' },
  { code: '+47', flag: '\u{1F1F3}\u{1F1F4}', label: 'Norway' },
  { code: '+45', flag: '\u{1F1E9}\u{1F1F0}', label: 'Denmark' },
  { code: '+358', flag: '\u{1F1EB}\u{1F1EE}', label: 'Finland' },
  { code: '+41', flag: '\u{1F1E8}\u{1F1ED}', label: 'Switzerland' },
  { code: '+43', flag: '\u{1F1E6}\u{1F1F9}', label: 'Austria' },
  { code: '+48', flag: '\u{1F1F5}\u{1F1F1}', label: 'Poland' },
  { code: '+61', flag: '\u{1F1E6}\u{1F1FA}', label: 'Australia' },
  { code: '+81', flag: '\u{1F1EF}\u{1F1F5}', label: 'Japan' },
  { code: '+86', flag: '\u{1F1E8}\u{1F1F3}', label: 'China' },
  { code: '+91', flag: '\u{1F1EE}\u{1F1F3}', label: 'India' },
  { code: '+55', flag: '\u{1F1E7}\u{1F1F7}', label: 'Brazil' },
];

const MIN_PASSENGERS = 2;
const MAX_PASSENGERS = 8;

export default function BookingForm() {
  const [direction, setDirection] = useState<Direction>('to_hotel');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [passengers, setPassengers] = useState(MIN_PASSENGERS);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+354');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalPrice = passengers * PRICE_PER_PASSENGER_ISK;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
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
          phone: `${countryCode} ${phone}`,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || 'Failed to create booking');
      }

      const data = await res.json();

      if (data.payment_url) {
        window.location.href = data.payment_url;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  const directionLabel =
    direction === 'to_hotel'
      ? `${ROUTE.from} → ${ROUTE.to}`
      : `${ROUTE.to} → ${ROUTE.from}`;

  return (
    <section id="booking" className="max-w-2xl mx-auto px-6 py-16">
      <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">
        Book Your Ride
      </h2>
      <p className="text-slate-500 text-center mb-8">
        Fill in the details below and proceed to payment.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8 space-y-6"
      >
        {/* Direction */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Direction
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDirection('to_hotel')}
              className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
                direction === 'to_hotel'
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
                Airport → Hotel
              </div>
            </button>
            <button
              type="button"
              onClick={() => setDirection('to_airport')}
              className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
                direction === 'to_airport'
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
                Hotel → Airport
              </div>
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">{directionLabel}</p>
        </div>

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
              min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white"
            >
              <option value="" disabled>Select time</option>
              {TIME_SLOTS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
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
          <p className="mt-1 text-xs text-slate-400">{MIN_PASSENGERS}–{MAX_PASSENGERS} passengers</p>
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
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white flex-shrink-0"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
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
                className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Price summary */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
            <span>{passengers} passenger{passengers > 1 ? 's' : ''} × {PRICE_PER_PASSENGER_ISK.toLocaleString()} ISK</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-slate-900">Total</span>
            <span className="text-lg font-bold text-slate-900">
              {totalPrice.toLocaleString()} ISK
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-sky-300 text-white font-semibold py-3 rounded-xl shadow-sm transition-colors cursor-pointer disabled:cursor-wait"
        >
          {submitting ? 'Processing...' : `Pay ${totalPrice.toLocaleString()} ISK`}
        </button>

        <p className="text-xs text-slate-400 text-center">
          You will be redirected to a secure payment page to complete your booking.
        </p>
      </form>
    </section>
  );
}
