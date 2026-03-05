'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import CandidateCard from '@/components/CandidateCard';
import { recruiterAPI } from '@/lib/api';
import { Filter, Plus, Search, X } from 'lucide-react';
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

interface CreateJobForm {
  title: string;
  company: string;
  description: string;
  requiredSkills: string;
  experienceMin: string;
  experienceMax: string;
  location: string;
  salary: string;
  jobType: string;
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
  const { register: registerJob, handleSubmit: handleJobSubmit, reset: resetJobForm } = useForm<CreateJobForm>();
  const [creating, setCreating] = useState(false);

  const onCreateJob = async (data: CreateJobForm) => {
    setCreating(true);
    try {
      await recruiterAPI.createJob({
        title: data.title,
        company: data.company,
        description: data.description,
        requiredSkills: data.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean),
        experienceMin: data.experienceMin ? parseFloat(data.experienceMin) : undefined,
        experienceMax: data.experienceMax ? parseFloat(data.experienceMax) : undefined,
        location: data.location || undefined,
        salary: data.salary || undefined,
        jobType: data.jobType || undefined,
        domain: data.domain || undefined,
      });
      const res = await recruiterAPI.getMyJobs();
      setJobs(res.data);
      resetJobForm();
      setShowCreateJob(false);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

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

        {/* Create Job Form */}
        {showCreateJob && (
          <form
            onSubmit={handleJobSubmit(onCreateJob)}
            className="bg-white rounded-2xl border p-6 space-y-4"
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-gray-800">Create Job Posting</h2>
              <button
                type="button"
                onClick={() => setShowCreateJob(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Job Title *</label>
                <input
                  {...registerJob('title', { required: true })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  placeholder="e.g. Senior Frontend Engineer"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Company *</label>
                <input
                  {...registerJob('company', { required: true })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600">Description *</label>
                <textarea
                  {...registerJob('description', { required: true })}
                  rows={3}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                  placeholder="Describe the role, responsibilities, and requirements..."
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600">Required Skills * (comma-separated)</label>
                <input
                  {...registerJob('requiredSkills', { required: true })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  placeholder="React, TypeScript, Node.js, PostgreSQL"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Min Experience (yrs)</label>
                <input
                  {...registerJob('experienceMin')}
                  type="number"
                  min="0"
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Max Experience (yrs)</label>
                <input
                  {...registerJob('experienceMax')}
                  type="number"
                  min="0"
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Location</label>
                <input
                  {...registerJob('location')}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  placeholder="Bangalore, Remote"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Salary</label>
                <input
                  {...registerJob('salary')}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  placeholder="20-30 LPA"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Job Type</label>
                <select
                  {...registerJob('jobType')}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="">— Any —</option>
                  <option value="FULL_TIME">Full-time</option>
                  <option value="PART_TIME">Part-time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERNSHIP">Internship</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Domain</label>
                <input
                  {...registerJob('domain')}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  placeholder="FinTech, EdTech, SaaS..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateJob(false)}
                className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 bg-primary-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-60"
              >
                {creating ? 'Creating...' : <><Plus size={14} /> Create Job</>}
              </button>
            </div>
          </form>
        )}

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
