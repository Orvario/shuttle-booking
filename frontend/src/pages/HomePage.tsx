import { useRef } from 'react';
import { Link } from 'react-router-dom';
import LandingHero from '../components/LandingHero';
import BookingForm from '../components/BookingForm';

export default function HomePage() {
  const bookingRef = useRef<HTMLDivElement>(null);

  function scrollToBooking() {
    bookingRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <LandingHero onBookNow={scrollToBooking} />
      <div ref={bookingRef}>
        <BookingForm />
      </div>

      {/* Booking policy */}
      <section className="max-w-xl mx-auto px-6 py-10 text-center">
        <h2 className="text-base font-semibold text-slate-700 mb-2">Shuttle Booking Policy</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          All shuttle bookings must be made at least 24 hours in advance to guarantee availability.
        </p>
        <p className="text-sm text-slate-500 leading-relaxed mt-2">
          If you require a shuttle with shorter notice, please contact us directly by phone at{' '}
          <a href="tel:+3546447080" className="text-sky-600 hover:text-sky-500 font-medium">
            +354 644 7080
          </a>
          . We will do our best to accommodate your request, subject to availability.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-400">
        <p>Flyers Airport Hotel Shuttle Service &middot; Iceland</p>
        <Link to="/privacy" className="text-slate-400 hover:text-slate-500 underline mt-1 inline-block">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
