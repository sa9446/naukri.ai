'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { authAPI } from '@/lib/api';
import { setAuth } from '@/lib/auth';

interface RegisterForm {
  email: string;
  password: string;
  role: 'JOB_SEEKER' | 'RECRUITER';
  firstName: string;
  lastName: string;
  companyName?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<RegisterForm>({
    defaultValues: { role: 'JOB_SEEKER' },
  });
  const role = watch('role');

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    try {
      const res = await authAPI.register(data);
      setAuth(res.data.token, res.data.user);
      router.push(res.data.user.role === 'RECRUITER' ? '/recruiter/dashboard' : '/job-seeker/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Registration failed.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary-700">NaukriAI</h1>
          <p className="text-gray-500 mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Role Selection */}
          <div className="grid grid-cols-2 gap-3">
            {(['JOB_SEEKER', 'RECRUITER'] as const).map((r) => (
              <label
                key={r}
                className={`flex items-center justify-center gap-2 border-2 rounded-xl p-3 cursor-pointer transition ${
                  role === r ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200'
                }`}
              >
                <input type="radio" value={r} {...register('role')} className="hidden" />
                <span className="font-medium text-sm">
                  {r === 'JOB_SEEKER' ? 'Job Seeker' : 'Recruiter'}
                </span>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                {...register('firstName', { required: true })}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                {...register('lastName', { required: true })}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {role === 'RECRUITER' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                {...register('companyName')}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              {...register('email', { required: true })}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              {...register('password', { required: true, minLength: 8 })}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Min. 8 characters"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-60 transition"
          >
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-primary-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
