'use client';

export interface AuthUser {
  id: string;
  email: string;
  role: 'JOB_SEEKER' | 'RECRUITER';
  profile: Record<string, unknown>;
}

export const getToken = (): string | null =>
  typeof window !== 'undefined' ? localStorage.getItem('token') : null;

export const getUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
};

export const setAuth = (token: string, user: AuthUser) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};

export const clearAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const isAuthenticated = (): boolean => !!getToken();

export const isRecruiter = (): boolean => getUser()?.role === 'RECRUITER';

export const isJobSeeker = (): boolean => getUser()?.role === 'JOB_SEEKER';
