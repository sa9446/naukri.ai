import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="text-7xl font-bold text-primary-200">404</div>
        <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
        <p className="text-gray-500">The page you're looking for doesn't exist.</p>
        <Link
          href="/"
          className="inline-block mt-4 px-6 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
