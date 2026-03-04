import { Link } from 'react-router-dom';

export default function FailurePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-6">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment Failed</h1>
        <p className="text-slate-500 mb-6">
          Your payment could not be processed. No charge has been made. Please try again.
        </p>

        <Link
          to="/"
          className="inline-block bg-sky-500 hover:bg-sky-400 text-white font-medium px-6 py-2.5 rounded-xl transition-colors"
        >
          Try Again
        </Link>
      </div>
    </div>
  );
}
