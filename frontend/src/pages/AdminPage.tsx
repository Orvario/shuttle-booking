import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { API_BASE_URL } from '../config';
import MiniCalendar from '../components/MiniCalendar';

interface Booking {
  id: string;
  direction: string;
  date: string;
  time: string;
  passenger_count: number;
  passenger_name: string;
  email: string;
  phone: string;
  amount_isk: number;
  status: string;
  created_at: string;
}

interface CalendarDay {
  date: string;
  count: number;
  passengers: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

const REFRESH_INTERVAL_MS = 60_000;

function PendingBookingCard({
  booking,
  onConfirm,
  confirming,
}: {
  booking: Booking;
  onConfirm: (id: string) => void;
  confirming: string | null;
}) {
  const isConfirming = confirming === booking.id;
  const created = new Date(booking.created_at);
  const createdLabel = created.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="min-w-0">
          <div className="font-medium text-slate-900 truncate">{booking.passenger_name}</div>
          <div className="text-sm text-slate-600">
            {booking.passenger_count} pax &middot; {booking.date} {booking.time} &middot; {booking.amount_isk.toLocaleString()} ISK
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {booking.email} &middot; {booking.phone} &middot; Created {createdLabel}
          </div>
        </div>
      </div>
      <button
        onClick={() => onConfirm(booking.id)}
        disabled={isConfirming}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:cursor-wait flex-shrink-0"
      >
        {isConfirming ? 'Confirming...' : 'Confirm & Send Emails'}
      </button>
    </div>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  const directionLabel =
    booking.direction === 'to_hotel' ? 'Airport \u2192 Hotel' : 'Hotel \u2192 Airport';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="text-2xl font-bold text-slate-900 tabular-nums w-16 flex-shrink-0">
          {booking.time}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-slate-900 truncate">{booking.passenger_name}</div>
          <div className="text-sm text-slate-500">
            {booking.passenger_count} passenger{booking.passenger_count > 1 ? 's' : ''} &middot; {directionLabel}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <a
          href={`tel:${booking.phone}`}
          className="text-sm text-sky-600 hover:text-sky-500 font-medium whitespace-nowrap"
        >
          {booking.phone}
        </a>
      </div>
    </div>
  );
}

function BookingGroup({ title, bookings }: { title: string; bookings: Booking[] }) {
  if (bookings.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="space-y-2">
        {bookings.map((b) => (
          <BookingCard key={b.id} booking={b} />
        ))}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [password, setPassword] = useState(() => sessionStorage.getItem('admin_pw') || '');
  const [authenticated, setAuthenticated] = useState(() => !!sessionStorage.getItem('admin_pw'));
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  const [date, setDate] = useState(todayStr);
  const [currentMonth, setCurrentMonth] = useState(() => todayStr().slice(0, 7));
  const [calendarData, setCalendarData] = useState<CalendarDay[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState('');

  const fetchCalendar = useCallback(async (month: string) => {
    if (!password) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/bookings/calendar?month=${month}`,
        { headers: { Authorization: `Bearer ${password}` } },
      );
      if (res.ok) {
        const data: CalendarDay[] = await res.json();
        setCalendarData(data);
      }
    } catch {
      // calendar data is non-critical, silently fail
    }
  }, [password]);

  const fetchBookings = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    setFetchError('');

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/bookings?date=${date}`,
        { headers: { Authorization: `Bearer ${password}` } },
      );

      if (res.status === 401) {
        sessionStorage.removeItem('admin_pw');
        setAuthenticated(false);
        setPassword('');
        setPwError('Invalid password');
        return;
      }

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const data: Booking[] = await res.json();
      setBookings(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [password, date]);

  const fetchPendingBookings = useCallback(async () => {
    if (!password) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/bookings/recent?limit=50`,
        { headers: { Authorization: `Bearer ${password}` } },
      );
      if (res.ok) {
        const data: Booking[] = await res.json();
        setPendingBookings(data.filter((b) => b.status === 'pending'));
      }
    } catch {
      // non-critical, pending list will just be empty
    }
  }, [password]);

  async function handleConfirmBooking(bookingId: string) {
    setConfirmingId(bookingId);
    setConfirmSuccess('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mock-confirm/${bookingId}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${password}` },
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Failed: ${res.status}`);
      }
      const confirmed = pendingBookings.find((b) => b.id === bookingId);
      setConfirmSuccess(
        `Booking confirmed for ${confirmed?.passenger_name ?? bookingId}. Emails sent.`,
      );
      fetchPendingBookings();
      fetchBookings();
      fetchCalendar(currentMonth);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to confirm booking');
    } finally {
      setConfirmingId(null);
    }
  }

  useEffect(() => {
    if (authenticated) {
      fetchBookings();
      fetchPendingBookings();
      fetchCalendar(currentMonth);
    }
  }, [authenticated, fetchBookings, fetchPendingBookings, fetchCalendar, currentMonth]);

  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      fetchBookings();
      fetchPendingBookings();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [authenticated, fetchBookings, fetchPendingBookings]);

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!pwInput.trim()) return;
    sessionStorage.setItem('admin_pw', pwInput);
    setPassword(pwInput);
    setAuthenticated(true);
    setPwError('');
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <form
          onSubmit={handleLogin}
          className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8"
        >
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-sky-100 mb-4">
              <svg className="w-7 h-7 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Shuttle Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Enter the admin password to continue</p>
          </div>

          {pwError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 mb-4">
              {pwError}
            </div>
          )}

          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 mb-4"
          />

          <button
            type="submit"
            className="w-full bg-sky-500 hover:bg-sky-400 text-white font-semibold py-2.5 rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            Sign In
          </button>
        </form>
      </div>
    );
  }

  const toHotel = bookings.filter((b) => b.direction === 'to_hotel');
  const toAirport = bookings.filter((b) => b.direction === 'to_airport');

  const totalPassengers = bookings.reduce((sum, b) => sum + b.passenger_count, 0);
  const totalRevenue = bookings.reduce((sum, b) => sum + b.amount_isk, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Flyers Hotel" className="h-8" />
            <h1 className="text-lg font-bold text-slate-900 hidden sm:block">Shuttle Dashboard</h1>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem('admin_pw');
              setAuthenticated(false);
              setPassword('');
            }}
            className="text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Calendar */}
        <MiniCalendar
          selectedDate={date}
          calendarData={calendarData}
          onSelectDate={setDate}
          onMonthChange={(ym) => {
            setCurrentMonth(ym);
          }}
        />

        {/* Pending bookings alert */}
        {pendingBookings.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold">
                {pendingBookings.length}
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Pending Bookings
              </h2>
              <span className="text-sm text-slate-400">
                — paid but webhook may have failed
              </span>
            </div>
            {pendingBookings.map((b) => (
              <PendingBookingCard
                key={b.id}
                booking={b}
                onConfirm={handleConfirmBooking}
                confirming={confirmingId}
              />
            ))}
          </div>
        )}

        {/* Confirm success banner */}
        {confirmSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 flex items-center justify-between">
            <span>{confirmSuccess}</span>
            <button
              onClick={() => setConfirmSuccess('')}
              className="text-emerald-400 hover:text-emerald-600 cursor-pointer ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Selected date heading */}
        <div className="text-center">
          <div className="text-lg font-bold text-slate-900">{formatDate(date)}</div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{bookings.length}</div>
            <div className="text-xs text-slate-500 mt-0.5">Bookings</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{totalPassengers}</div>
            <div className="text-xs text-slate-500 mt-0.5">Passengers</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{totalRevenue.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-0.5">ISK Revenue</div>
          </div>
        </div>

        {/* Error */}
        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {fetchError}
          </div>
        )}

        {/* Loading */}
        {loading && bookings.length === 0 && (
          <div className="text-center py-12 text-slate-400">Loading bookings...</div>
        )}

        {/* Empty state */}
        {!loading && bookings.length === 0 && !fetchError && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">No bookings for this date</p>
            <p className="text-sm text-slate-400 mt-1">Select a different date to see bookings</p>
          </div>
        )}

        {/* Booking groups */}
        {bookings.length > 0 && (
          <div className="space-y-6">
            <BookingGroup title="Airport to Hotel" bookings={toHotel} />
            <BookingGroup title="Hotel to Airport" bookings={toAirport} />
          </div>
        )}
      </main>
    </div>
  );
}
