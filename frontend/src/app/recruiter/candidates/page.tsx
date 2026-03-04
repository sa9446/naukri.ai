'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import CandidateCard from '@/components/CandidateCard';
import { recruiterAPI } from '@/lib/api';
import { Filter, Plus, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';

interface CandidateResult {
  total: number;
  page: number;
  totalPages: number;
  candidates: {
    matchId: string;
    cvId: string;
    matchScore: number;
    skillsScore: number;
    experienceScore: number;
    domainScore: number;
    behavioralScore: number;
    matchReasons: {
      skills: { score: number; matched: string[]; missing: string[]; summary: string };
      experience: { score: number; candidateYears: number; requiredRange: string; summary: string };
      domain: { score: number; summary: string };
      behavioral: { score: number; summary: string };
    };
    status: string;
    candidate: {
      fullName?: string;
      email?: string;
      location?: string;
      skills: string[];
      experience: number;
      domainExpertise: string[];
      highlights?: string[];
      behavioralFit: { traits?: string[]; workStyle?: string };
    } | null;
  }[];
}

interface JobOption {
  id: string;
  title: string;
  company: string;
}

interface FilterForm {
  skills: string;
  minExperience: string;
  maxExperience: string;
  domain: string;
}

export default function CandidatesPage() {
  const searchParams = useSearchParams();
  const defaultJobId = searchParams.get('jobId') || '';

  const [selectedJob, setSelectedJob] = useState(defaultJobId);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [result, setResult] = useState<CandidateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateJob, setShowCreateJob] = useState(false);

  const { register, handleSubmit: handleFilterSubmit, getValues } = useForm<FilterForm>();

  const fetchCandidates = useCallback(async (jobId: string, filters?: Partial<FilterForm>) => {
    if (!jobId) return;
    setLoading(true);
    try {
      const params = {
        skills: filters?.skills || undefined,
        minExperience: filters?.minExperience ? parseFloat(filters.minExperience) : undefined,
        maxExperience: filters?.maxExperience ? parseFloat(filters.maxExperience) : undefined,
        domain: filters?.domain || undefined,
      };
      const res = await recruiterAPI.getCandidates(jobId, params);
      setResult(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    recruiterAPI.getMyJobs().then((res) => {
      setJobs(res.data);
      if (!selectedJob && res.data.length > 0) {
        setSelectedJob(res.data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedJob) fetchCandidates(selectedJob);
  }, [selectedJob, fetchCandidates]);

  const handleStatusChange = async (matchId: string, status: string) => {
    await recruiterAPI.updateMatchStatus(matchId, status);
    fetchCandidates(selectedJob, getValues());
  };

  const onFilterSubmit = (data: FilterForm) => fetchCandidates(selectedJob, data);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Candidate Rankings</h1>
          <div className="flex gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 border rounded-xl px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              <Filter size={14} /> Filters
            </button>
            <button
              onClick={() => setShowCreateJob(!showCreateJob)}
              className="flex items-center gap-2 bg-primary-600 text-white rounded-xl px-3 py-2 text-sm font-medium hover:bg-primary-700"
            >
              <Plus size={14} /> New Job
            </button>
          </div>
        </div>

        {/* Job selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Job Posting</label>
          <select
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
            className="w-full max-w-md border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
          >
            <option value="">— Select a job —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} @ {j.company}
              </option>
            ))}
          </select>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <form
            onSubmit={handleFilterSubmit(onFilterSubmit)}
            className="bg-white rounded-2xl border p-5 grid grid-cols-4 gap-4"
          >
            <div>
              <label className="text-xs font-medium text-gray-600">Skills (comma-sep)</label>
              <input
                {...register('skills')}
                className="w-full mt-1 border rounded-lg px-2 py-1.5 text-sm"
                placeholder="React, Node.js"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Min Experience (yrs)</label>
              <input
                {...register('minExperience')}
                type="number"
                className="w-full mt-1 border rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Max Experience (yrs)</label>
              <input
                {...register('maxExperience')}
                type="number"
                className="w-full mt-1 border rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Domain</label>
              <input
                {...register('domain')}
                className="w-full mt-1 border rounded-lg px-2 py-1.5 text-sm"
                placeholder="FinTech"
              />
            </div>
            <div className="col-span-4 flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 bg-primary-600 text-white rounded-xl px-4 py-2 text-sm font-medium"
              >
                <Search size={14} /> Apply Filters
              </button>
            </div>
          </form>
        )}

        {/* Results */}
        {!selectedJob ? (
          <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
            Select a job posting to view matched candidates.
          </div>
        ) : loading ? (
          <div className="text-center py-20 text-gray-400">Loading candidates...</div>
        ) : result ? (
          <>
            <p className="text-sm text-gray-500">
              {result.total} candidates ranked by fit score (80%+ matches only)
            </p>
            {result.candidates.length === 0 ? (
              <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
                No qualified candidates found for this job yet. Try uploading CVs first.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {result.candidates.map((c) => (
                  <CandidateCard key={c.matchId} {...c} onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
