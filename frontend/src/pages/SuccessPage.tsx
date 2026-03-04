import { useSearchParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';

interface BookingInfo {
  id: string;
  direction: string;
  date: string;
  time: string;
  passenger_count: number;
  passenger_name: string;
  email: string;
  status: string;
  amount_isk: number;
}

export default function SuccessPage() {
  const [params] = useSearchParams();
  const bookingId = params.get('booking_id');
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/api/bookings/${bookingId}`)
      .then((r) => r.json())
      .then((data) => setBooking(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookingId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
        {/* Success icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-6">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Booking Confirmed</h1>
        <p className="text-slate-500 mb-6">
          Your shuttle has been booked and paid. A confirmation email will arrive shortly.
        </p>

        {booking && (
          <div className="bg-slate-50 rounded-xl p-4 text-left text-sm space-y-2 mb-6">
            <div className="flex justify-between">
              <span className="text-slate-500">Direction</span>
              <span className="font-medium text-slate-800">
                {booking.direction === 'to_hotel' ? 'Airport → Hotel' : 'Hotel → Airport'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date</span>
              <span className="font-medium text-slate-800">{booking.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Time</span>
              <span className="font-medium text-slate-800">{booking.time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Passengers</span>
              <span className="font-medium text-slate-800">{booking.passenger_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Name</span>
              <span className="font-medium text-slate-800">{booking.passenger_name}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
              <span className="text-slate-500">Total Paid</span>
              <span className="font-bold text-slate-900">{booking.amount_isk.toLocaleString()} ISK</span>
            </div>
          </div>
        )}

        <Link
          to="/"
          className="inline-block bg-sky-500 hover:bg-sky-400 text-white font-medium px-6 py-2.5 rounded-xl transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
