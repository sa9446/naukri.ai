'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, isAuthenticated } from '@/lib/auth';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated()) {
      const user = getUser();
      router.replace(
        user?.role === 'RECRUITER' ? '/recruiter/dashboard' : '/job-seeker/dashboard'
      );
    }
  }, [router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary-900 to-primary-600 text-white px-4">
      <div className="max-w-3xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">NaukriAI</h1>
        <p className="text-xl text-primary-100">
          AI-powered CV parsing, candidate evaluation, and job matching — for job seekers and
          recruiters.
        </p>
        <div className="flex gap-4 justify-center mt-8">
          <Link
            href="/auth/login"
            className="px-6 py-3 bg-white text-primary-700 font-semibold rounded-xl hover:bg-primary-50 transition"
          >
            Sign In
          </Link>
          <Link
            href="/auth/register"
            className="px-6 py-3 border-2 border-white text-white font-semibold rounded-xl hover:bg-white/10 transition"
          >
            Get Started
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-6 mt-16 text-sm text-primary-200">
          <div className="bg-white/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">80%+</div>
            <div>Minimum match threshold</div>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">4-Layer</div>
            <div>Scoring: Skills, Experience, Domain, Behavioral</div>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">AI-First</div>
            <div>LLM-powered CV parsing via API</div>
          </div>
        </div>
      </div>
    </main>
  );
}
