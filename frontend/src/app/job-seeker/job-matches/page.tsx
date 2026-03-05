'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import JobMatchCard from '@/components/JobMatchCard';
import { jobSeekerAPI } from '@/lib/api';
import { RefreshCw, FileText, ChevronRight } from 'lucide-react';

interface JobMatch {
  matchId: string;
  matchScore: number;
  skillsScore: number;
  experienceScore: number;
  domainScore: number;
  behavioralScore: number;
  matchReasons: {
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
              Only showing matches with <strong>80%+</strong> compatibility score
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

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading matches...</div>
        ) : matches.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
            <p className="font-medium">No matches found yet.</p>
            <p className="text-sm mt-1">Click "Re-run Matching" or wait for the background job to complete.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {matches.map((m) => (
              <JobMatchCard key={m.matchId} {...m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
