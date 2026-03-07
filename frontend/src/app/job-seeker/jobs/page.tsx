'use client';

import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { jobsAPI } from '@/lib/api';
import { Briefcase, MapPin, DollarSign, ExternalLink, Search, RefreshCw, Zap, Clock } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  company: string;
  location?: string;
  salary?: string;
  jobType?: string;
  requiredSkills: string[];
  source: string;
  sourceUrl?: string;
  postedAt: string;
  expiresAt?: string;
}

interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  totalPages: number;
  message?: string;
}

export default function BrowseJobsPage() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState('');
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jobsAPI.list({ keyword: keyword || undefined, location: location || undefined, page, limit: 20 });
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [keyword, location, page]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Live scrape: triggers backend to search Naukri + RemoteOK, then reloads
  const handleLiveScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    setScraping(true);
    setScrapeMsg('');
    setPage(1);

    try {
      const res = await jobsAPI.search(keyword.trim(), location.trim() || 'India');
      setScrapeMsg(res.data.message || 'Scraping complete. Showing latest results.');
      // Load the updated results
      await fetchJobs();
    } catch {
      setScrapeMsg('Scrape triggered. Refreshing results...');
      await fetchJobs();
    } finally {
      setScraping(false);
      // Auto-clear banner after 6s
      setTimeout(() => setScrapeMsg(''), 6000);
    }
  };

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchJobs();
  };

  const daysUntilExpiry = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
    return days;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Browse Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data ? `${data.total} active jobs` : 'Loading jobs...'}
          </p>
        </div>

        {/* Live scrape form */}
        <form onSubmit={handleLiveScrape} className="bg-white border rounded-2xl p-4 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Live Job Search (scrapes Naukri + RemoteOK)</p>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Zap size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. Python Developer, React Engineer"
                className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="w-44 relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location"
                className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              type="submit"
              disabled={scraping || !keyword.trim()}
              className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scraping ? (
                <><RefreshCw size={14} className="animate-spin" /> Scraping...</>
              ) : (
                <><Zap size={14} /> Search & Scrape</>
              )}
            </button>
            <button
              type="button"
              onClick={handleFilter}
              className="flex items-center gap-2 border px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              <Search size={14} /> Filter
            </button>
          </div>
          {scrapeMsg && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Zap size={12} className="shrink-0" />
              {scrapeMsg}
            </div>
          )}
        </form>

        {/* Results */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading jobs...</div>
        ) : !data || data.jobs.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
            <p className="font-medium">No jobs found.</p>
            <p className="text-sm mt-1">Try a different keyword or use Search &amp; Scrape to find live jobs.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {data.jobs.map((job) => {
                const expDays = daysUntilExpiry(job.expiresAt);
                return (
                  <div key={job.id} className="bg-white rounded-2xl border p-5 hover:shadow-sm transition">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 text-base">{job.title}</h3>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                          <Briefcase size={13} /> {job.company}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                          {job.location && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} /> {job.location}
                            </span>
                          )}
                          {job.salary && (
                            <span className="flex items-center gap-1">
                              <DollarSign size={11} /> {job.salary}
                            </span>
                          )}
                          {job.jobType && (
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full">{job.jobType}</span>
                          )}
                          <span className="bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full font-medium">
                            {job.source}
                          </span>
                          {expDays !== null && expDays <= 5 && (
                            <span className="flex items-center gap-1 text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                              <Clock size={10} /> Expires in {expDays}d
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {[...new Set(job.requiredSkills)].slice(0, 6).map((s, i) => (
                            <span key={`${s}-${i}`} className="bg-gray-50 border text-gray-600 px-2 py-0.5 rounded-full text-xs">
                              {s}
                            </span>
                          ))}
                          {[...new Set(job.requiredSkills)].length > 6 && (
                            <span className="text-xs text-gray-400">
                              +{[...new Set(job.requiredSkills)].length - 6} more
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-xs text-gray-400">
                          {new Date(job.postedAt).toLocaleDateString()}
                        </span>
                        {job.sourceUrl && (
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary-600 hover:underline font-medium"
                          >
                            Apply <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-500">
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  disabled={page === data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
