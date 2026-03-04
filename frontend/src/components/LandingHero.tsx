import { ROUTE } from '../config';

interface LandingHeroProps {
  onBookNow: () => void;
}

export default function LandingHero({ onBookNow }: LandingHeroProps) {
  return (
    <section className="relative text-white overflow-hidden">
      {/* Full-bleed background image */}
      <div className="absolute inset-0">
        <img
          src="/shuttle.png"
          alt="Flyers Airport Hotel shuttle at Keflavík Airport"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-slate-900/90" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-24 md:py-32 text-center">
        {/* Logo */}
        <div className="inline-block bg-white rounded-xl px-6 py-3 mb-8 shadow-lg">
          <img
            src="/logo.png"
            alt="Flyers Airport Hotel"
            className="h-10 md:h-12"
          />
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 drop-shadow-lg">
          Airport Shuttle Service
        </h1>
        <p className="text-lg md:text-xl text-slate-200 max-w-2xl mx-auto mb-6 drop-shadow">
          Comfortable and reliable transfers between
        </p>

        {/* Route display */}
        <div className="flex items-center justify-center gap-3 mb-8 flex-wrap">
          <span className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-sm font-medium">
            {ROUTE.from}
          </span>
          <svg className="w-5 h-5 text-sky-400 flex-shrink-0 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <span className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-sm font-medium">
            {ROUTE.to}
          </span>
        </div>

        {/* Price highlight */}
        <div className="inline-flex items-center gap-2 bg-sky-500/20 backdrop-blur-sm border border-sky-400/30 rounded-full px-5 py-2 text-sm text-sky-200 mb-10">
          <span>From</span>
          <span className="text-xl font-bold text-white">2,200 ISK</span>
          <span>per person</span>
        </div>

        <div>
          <button
            onClick={onBookNow}
            className="bg-sky-500 hover:bg-sky-400 text-white font-semibold text-lg px-10 py-4 rounded-xl shadow-lg shadow-sky-500/30 hover:shadow-sky-400/40 transition-all duration-200 cursor-pointer"
          >
            Book Your Shuttle
          </button>
        </div>

        {/* Contact */}
        <p className="mt-8 text-sm text-white/50">
          +354 644 7080 &middot; www.flyershotel.com
        </p>
      </div>
    </section>
  );
}
