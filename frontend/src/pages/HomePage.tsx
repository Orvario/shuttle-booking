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
