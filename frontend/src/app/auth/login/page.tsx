'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { authAPI } from '@/lib/api';
import { setAuth } from '@/lib/auth';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setError('');
    try {
      const res = await authAPI.login(data);
      setAuth(res.data.token, res.data.user);
      router.push(res.data.user.role === 'RECRUITER' ? '/recruiter/dashboard' : '/job-seeker/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary-700">NaukriAI</h1>
          <p className="text-gray-500 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              {...register('email', { required: true })}
              className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="you@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              {...register('password', { required: true })}
              className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-60 transition"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          No account?{' '}
          <Link href="/auth/register" className="text-primary-600 font-medium hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
