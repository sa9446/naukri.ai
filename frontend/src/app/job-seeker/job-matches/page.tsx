'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import JobMatchCard from '@/components/JobMatchCard';
import { jobSeekerAPI } from '@/lib/api';
import { RefreshCw, FileText, ChevronRight, SlidersHorizontal, X } from 'lucide-react';

interface JobMatch {
  matchId: string;
  matchScore: number;
  skillsScore: number;
  experienceScore: number;
  domainScore: number;
  behavioralScore: number;
  matchReasons: {
    title?: { score: number; candidateLastRole: string; jobTitle: string; summary: string };
    skills: { score: number; matched: string[]; missing: string[]; summary: string };
    experience: { score: number; candidateYears: number; requiredRange: string; summary: string };
    domain: { score: number; candidateDomains: string[]; jobDomain: string; summary: string };
    behavioral: { score: number; summary: string };
  };
  status: string;
  highlights?: string[];
  job: {
    id: string;
    title: string;
    company: string;
    location?: string;
    salary?: string;
    jobType?: string;
    requiredSkills: string[];
    domain?: string;
    description?: string;
    experienceMin?: number;
    experienceMax?: number;
    source: string;
    sourceUrl?: string;
    postedAt: string;
  };
}

interface CV {
  id: string;
  originalName: string;
  uploadedAt: string;
  _count: { jobMatches: number };
}

export default function JobMatchesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const cvId = searchParams.get('cvId') || '';

  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cvs, setCvs] = useState<CV[]>([]);
  const [cvsLoading, setCvsLoading] = useState(false);

  // Filters
  const [filterDomain, setFilterDomain] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSkill, setFilterSkill] = useState('');

  // Derived filter options from loaded matches
  const domains = useMemo(() => [...new Set(matches.map(m => m.job.domain).filter(Boolean))].sort() as string[], [matches]);
  const locations = useMemo(() => [...new Set(matches.map(m => m.job.location).filter(Boolean))].sort() as string[], [matches]);
  const skills = useMemo(() => {
    const all = matches.flatMap(m => m.job.requiredSkills || []);
    return [...new Set(all)].sort();
  }, [matches]);

  const filtered = useMemo(() => matches.filter(m => {
    if (filterDomain && m.job.domain !== filterDomain) return false;
    if (filterLocation && m.job.location !== filterLocation) return false;
    if (filterSkill && !(m.job.requiredSkills || []).some(s => s.toLowerCase() === filterSkill.toLowerCase())) return false;
    return true;
  }), [matches, filterDomain, filterLocation, filterSkill]);

  const hasFilters = filterDomain || filterLocation || filterSkill;

  // If no cvId, fetch the list of CVs so the user can pick one
  useEffect(() => {
    if (cvId) return;
    setCvsLoading(true);
    jobSeekerAPI
      .getMyCVs()
      .then((res) => setCvs(res.data))
      .catch(console.error)
      .finally(() => { setCvsLoading(false); setLoading(false); });
  }, [cvId]);

  const fetchMatches = async (id = cvId) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await jobSeekerAPI.getMatches(id);
      setMatches(res.data.matches || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cvId) fetchMatches();
  }, [cvId]);

  const handleRefresh = async () => {
    if (!cvId) return;
    setRefreshing(true);
    try {
      await jobSeekerAPI.triggerMatching(cvId);
      await fetchMatches();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      console.error('Refresh matching failed:', e.response?.data?.error || err);
    } finally {
      setRefreshing(false);
    }
  };

  // No cvId — show CV picker
  if (!cvId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job Matches</h1>
            <p className="text-sm text-gray-500 mt-1">Select a CV to view its matches</p>
          </div>
          {cvsLoading ? (
            <p className="text-gray-400 text-sm">Loading your CVs...</p>
          ) : cvs.length === 0 ? (
            <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
              <p className="font-medium">No CVs uploaded yet.</p>
              <p className="text-sm mt-1">Upload a CV first to see job matches.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cvs.map((cv) => (
                <button
                  key={cv.id}
                  onClick={() => router.push(`/job-seeker/job-matches?cvId=${cv.id}`)}
                  className="w-full bg-white rounded-2xl border p-5 flex items-center justify-between hover:border-primary-300 hover:shadow-sm transition text-left"
                >
                  <div className="flex items-center gap-4">
                    <FileText size={20} className="text-primary-400" />
                    <div>
                      <p className="font-medium text-gray-800">{cv.originalName}</p>
                      <p className="text-xs text-gray-400">
                        {cv._count.jobMatches} matches • Uploaded {new Date(cv.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job Matches</h1>
            <p className="text-sm text-gray-500 mt-1">
              Top matches ranked by role alignment
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/job-seeker/job-matches')}
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              ← All CVs
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-800 border border-primary-200 px-3 py-2 rounded-xl transition"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Re-run Matching
            </button>
          </div>
        </div>

        {/* Filters */}
        {!loading && matches.length > 0 && (
          <div className="bg-white border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <SlidersHorizontal size={13} /> Filter Matches
              </p>
              {hasFilters && (
                <button
                  onClick={() => { setFilterDomain(''); setFilterLocation(''); setFilterSkill(''); }}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                >
                  <X size={11} /> Clear all
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Domain</label>
                <select
                  value={filterDomain}
                  onChange={e => setFilterDomain(e.target.value)}
                  className="w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">All domains</option>
                  {domains.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Location</label>
                <select
                  value={filterLocation}
                  onChange={e => setFilterLocation(e.target.value)}
                  className="w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">All locations</option>
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Required Skill</label>
                <select
                  value={filterSkill}
                  onChange={e => setFilterSkill(e.target.value)}
                  className="w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">All skills</option>
                  {skills.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {hasFilters && (
              <p className="text-xs text-gray-400">{filtered.length} of {matches.length} matches shown</p>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading matches...</div>
        ) : matches.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
            <p className="font-medium">No matches found yet.</p>
            <p className="text-sm mt-1">Click "Re-run Matching" or wait for the background job to complete.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border p-10 text-center text-gray-400">
            <p className="font-medium">No matches for these filters.</p>
            <button onClick={() => { setFilterDomain(''); setFilterLocation(''); setFilterSkill(''); }} className="text-sm text-primary-600 mt-2 hover:underline">Clear filters</button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((m) => (
              <JobMatchCard key={m.matchId} {...m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
