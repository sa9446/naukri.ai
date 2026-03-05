'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { recruiterAPI } from '@/lib/api';
import { Briefcase, Users, TrendingUp, ChevronRight, Plus, Search, Loader2, CheckCircle } from 'lucide-react';

interface DashboardStats {
  totalJobs: number;
  activeJobs: number;
  totalCandidatesMatched: number;
  jobsOverview: {
    id: string;
    title: string;
    matchedCandidates: number;
    topScore: number | null;
    isActive: boolean;
    postedAt: string;
  }[];
}

export default function RecruiterDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrapeKeyword, setScrapeKeyword] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState('');

  useEffect(() => {
    recruiterAPI
      .getDashboard()
      .then((res) => setStats(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeKeyword.trim()) return;
    setScraping(true);
    setScrapeMsg('');
    try {
      const res = await recruiterAPI.triggerScrape({ keyword: scrapeKeyword.trim(), location: 'India' });
      setScrapeMsg(res.data.message || 'Scraping started in background…');
      setScrapeKeyword('');
    } catch {
      setScrapeMsg('Scrape request failed.');
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recruiter Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Overview of your jobs and matched candidates</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/recruiter/upload-cvs"
              className="flex items-center gap-2 bg-white border rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              <Plus size={15} /> Upload CVs
            </Link>
            <Link
              href="/recruiter/candidates"
              className="flex items-center gap-2 bg-primary-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary-700"
            >
              <Users size={15} /> View Candidates
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : stats ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Jobs', value: stats.totalJobs, icon: <Briefcase size={20} className="text-primary-500" /> },
                { label: 'Active Jobs', value: stats.activeJobs, icon: <TrendingUp size={20} className="text-green-500" /> },
                { label: 'Candidates Matched', value: stats.totalCandidatesMatched, icon: <Users size={20} className="text-purple-500" /> },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-2xl border p-5 flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
                    {s.icon}
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                    <div className="text-sm text-gray-500">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Scrape Jobs */}
            <div className="bg-white rounded-2xl border p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-1">Scrape Live Jobs</h2>
              <p className="text-xs text-gray-400 mb-4">
                Pull real job listings from LinkedIn & RemoteOK into the platform.
                Runs in background — results appear in Browse Jobs within a minute.
              </p>
              <form onSubmit={handleScrape} className="flex gap-3">
                <div className="flex-1 relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={scrapeKeyword}
                    onChange={(e) => setScrapeKeyword(e.target.value)}
                    placeholder="e.g. React Developer, Data Engineer, DevOps"
                    className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={scraping || !scrapeKeyword.trim()}
                  className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 transition"
                >
                  {scraping ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  {scraping ? 'Starting…' : 'Scrape'}
                </button>
              </form>
              {scrapeMsg && (
                <p className="flex items-center gap-1.5 text-sm text-green-600 mt-3">
                  <CheckCircle size={14} /> {scrapeMsg}
                </p>
              )}
            </div>

            {/* Jobs Overview */}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Job Postings</h2>
              {stats.jobsOverview.length === 0 ? (
                <div className="bg-white rounded-2xl border p-8 text-center text-gray-400">
                  No job postings yet. Create one from the Candidates page.
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.jobsOverview.map((job) => (
                    <div key={job.id} className="bg-white rounded-2xl border p-5 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-800">{job.title}</p>
                        <p className="text-xs text-gray-400">
                          {job.matchedCandidates} candidates matched •{' '}
                          {job.topScore ? `Top: ${job.topScore}%` : 'No matches yet'} •{' '}
                          Posted {new Date(job.postedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            job.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {job.isActive ? 'Active' : 'Closed'}
                        </span>
                        <Link
                          href={`/recruiter/candidates?jobId=${job.id}`}
                          className="text-sm text-primary-600 font-medium hover:underline flex items-center gap-1"
                        >
                          View <ChevronRight size={14} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
