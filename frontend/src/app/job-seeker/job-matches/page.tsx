'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import JobMatchCard from '@/components/JobMatchCard';
import { jobSeekerAPI } from '@/lib/api';
import { RefreshCw } from 'lucide-react';

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

export default function JobMatchesPage() {
  const searchParams = useSearchParams();
  const cvId = searchParams.get('cvId') || '';

  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMatches = async () => {
    if (!cvId) return;
    setLoading(true);
    try {
      const res = await jobSeekerAPI.getMatches(cvId);
      setMatches(res.data.matches || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMatches(); }, [cvId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await jobSeekerAPI.triggerMatching(cvId);
      await fetchMatches();
    } finally {
      setRefreshing(false);
    }
  };

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
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-800 border border-primary-200 px-3 py-2 rounded-xl transition"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Re-run Matching
          </button>
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
