'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearAuth, getUser } from '@/lib/auth';

export default function Navbar() {
  const router = useRouter();
  const user = getUser();

  const handleLogout = () => {
    clearAuth();
    router.push('/auth/login');
  };

  const navLinks =
    user?.role === 'RECRUITER'
      ? [
          { href: '/recruiter/dashboard', label: 'Dashboard' },
          { href: '/recruiter/upload-cvs', label: 'Upload CVs' },
          { href: '/recruiter/candidates', label: 'Candidates' },
        ]
      : [
          { href: '/job-seeker/dashboard', label: 'Dashboard' },
          { href: '/job-seeker/upload-cv', label: 'Upload CV' },
          { href: '/job-seeker/jobs', label: 'Browse Jobs' },
          { href: '/job-seeker/job-matches', label: 'My Matches' },
        ];

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold text-primary-700">
        NaukriAI
      </Link>
      <div className="flex items-center gap-6">
        {navLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-sm text-gray-600 hover:text-primary-600 font-medium transition"
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/settings"
          className="text-sm text-gray-600 hover:text-primary-600 font-medium transition"
        >
          Settings
        </Link>
        <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full font-medium">
          {user?.role === 'RECRUITER' ? 'Recruiter' : 'Job Seeker'}
        </span>
        <button
          onClick={handleLogout}
          className="text-sm text-red-500 hover:text-red-700 font-medium"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
