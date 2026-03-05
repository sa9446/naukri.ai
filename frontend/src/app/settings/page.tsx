'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import { profileAPI } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { Save, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const user = getUser();
  const isRecruiter = user?.role === 'RECRUITER';

  const profile = user?.profile as Record<string, string> | undefined;

  const [form, setForm] = useState({
    firstName: (profile?.firstName as string) || '',
    lastName: (profile?.lastName as string) || '',
    phone: (profile?.phone as string) || '',
    location: (profile?.location as string) || '',
    // recruiter-only
    companyName: (profile?.companyName as string) || '',
    industry: (profile?.industry as string) || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload = isRecruiter
        ? { companyName: form.companyName, industry: form.industry, phone: form.phone, location: form.location }
        : { firstName: form.firstName, lastName: form.lastName, phone: form.phone, location: form.location };
      await profileAPI.update(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Update your profile information</p>
        </div>

        <div className="bg-white rounded-2xl border p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-5">Profile</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email (read-only) */}
            <div>
              <label className="text-xs font-medium text-gray-600">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              />
            </div>

            {isRecruiter ? (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600">Company Name</label>
                  <input
                    name="companyName"
                    value={form.companyName}
                    onChange={handleChange}
                    className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="Acme Corp"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Industry</label>
                  <input
                    name="industry"
                    value={form.industry}
                    onChange={handleChange}
                    className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="FinTech, SaaS, Healthcare..."
                  />
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600">First Name</label>
                  <input
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="Aarav"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Last Name</label>
                  <input
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="Sharma"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Phone</label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  placeholder="+91 9876543210"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Location</label>
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  placeholder="Bangalore, India"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-primary-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary-700 disabled:opacity-60 transition"
              >
                <Save size={15} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <CheckCircle size={15} /> Saved!
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Role badge */}
        <div className="bg-white rounded-2xl border p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Account Info</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Role:</span>
            <span className="text-xs bg-primary-100 text-primary-700 px-2.5 py-1 rounded-full font-medium">
              {isRecruiter ? 'Recruiter' : 'Job Seeker'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
