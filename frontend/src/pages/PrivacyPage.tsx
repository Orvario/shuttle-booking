import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Flyers Airport Hotel" className="h-8" />
          </Link>
          <Link
            to="/"
            className="text-sm text-sky-600 hover:text-sky-500 font-medium"
          >
            Back to Booking
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mb-10">Last updated: March 2026</p>

        <div className="space-y-8 text-slate-700 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Who we are</h2>
            <p>
              This shuttle booking service is operated by Flyers Airport Hotel, located near
              Keflavik International Airport, Iceland. We provide airport transfer services
              for our guests.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">What data we collect</h2>
            <p className="mb-3">When you make a booking, we collect the following information:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>Full name</li>
              <li>Email address</li>
              <li>Phone number (including country code)</li>
              <li>Booking details: date, time, and number of passengers</li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> collect or store payment card details. All payment
              processing is handled by our licensed payment provider (Straumur) on their
              secure, PCI-compliant platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Why we collect it</h2>
            <p>We use your personal data solely to:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 mt-2">
              <li>Process and confirm your shuttle booking</li>
              <li>Send you a booking confirmation email</li>
              <li>Contact you if there are changes to your scheduled shuttle</li>
              <li>Coordinate pickup logistics with hotel staff</li>
            </ul>
            <p className="mt-3">
              The legal basis for processing is performance of a contract (your booking) under
              Article 6(1)(b) of the GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">How we protect your data</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>All data is transmitted over encrypted connections (HTTPS/TLS)</li>
              <li>Booking data is stored in a secured database with restricted access</li>
              <li>Access to booking information is limited to authorized hotel staff</li>
              <li>Payment card data is handled entirely by our payment processor and never touches our servers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Data sharing</h2>
            <p>We share your data only with:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 mt-2">
              <li><strong>Straumur</strong> — our payment processor, to handle your payment</li>
              <li><strong>Resend</strong> — our email provider, to deliver your booking confirmation</li>
            </ul>
            <p className="mt-3">
              We do not sell, rent, or share your personal data with any other third parties
              for marketing or advertising purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Data retention</h2>
            <p>
              Booking data is retained for up to 12 months after your travel date for
              operational and accounting purposes, after which it is deleted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Your rights</h2>
            <p className="mb-2">Under the GDPR, you have the right to:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to or restrict processing of your data</li>
              <li>Receive your data in a portable format</li>
              <li>Lodge a complaint with the Icelandic Data Protection Authority (Persónuvernd)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Contact</h2>
            <p>
              For any questions about this privacy policy or your personal data, contact us at:
            </p>
            <p className="mt-2 text-slate-600">
              Flyers Airport Hotel<br />
              Email: info@flyershotel.com<br />
              Phone: +354 644 7080
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-400">
        <p>Flyers Airport Hotel Shuttle Service &middot; Iceland</p>
      </footer>
    </div>
  );
}
