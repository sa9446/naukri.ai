'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import CVUpload from '@/components/CVUpload';
import { recruiterAPI } from '@/lib/api';
import { CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';

interface BatchResult {
  total: number;
  success: number;
  failed: number;
  results: {
    filename: string;
    status: 'success' | 'failed' | 'pending';
    candidateName?: string;
    skills?: string[];
    experience?: number;
    error?: string;
  }[];
}

interface JobPosting {
  id: string;
  title: string;
  company: string;
}

export default function UploadBatchPage() {
  const [loading, setLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [selectedJob, setSelectedJob] = useState('');

  useEffect(() => {
    recruiterAPI
      .getMyJobs()
      .then((res) => setJobs(res.data))
      .catch(console.error);
  }, []);

  const handleUpload = async (files: File[]) => {
    setLoading(true);
    setError('');
    setBatchResult(null);

    const formData = new FormData();
    files.forEach((f) => formData.append('cvs', f));
    if (selectedJob) formData.append('targetJobId', selectedJob);

    try {
      const res = await recruiterAPI.uploadBatch(formData);
      setBatchResult(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Batch upload failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batch CV Upload</h1>
          <p className="text-gray-500 text-sm mt-1">
            Upload up to 50 CVs at once. Each will be parsed and optionally matched to a job.
          </p>
        </div>

        {/* Job selector */}
        <div className="bg-white rounded-2xl border p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Match against a specific job (optional)
          </label>
          <select
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">— No specific job (parse only) —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} @ {j.company}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-2xl border p-6">
          <CVUpload multiple onUpload={handleUpload} loading={loading} />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {batchResult && (
          <div className="bg-white rounded-2xl border p-6 space-y-4">
            <div className="flex gap-4 text-sm">
              <div className="bg-green-50 text-green-700 px-3 py-2 rounded-xl font-medium">
                {batchResult.success} succeeded
              </div>
              <div className="bg-red-50 text-red-600 px-3 py-2 rounded-xl font-medium">
                {batchResult.failed} failed
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {batchResult.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between border rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    {r.status === 'success' ? (
                      <CheckCircle size={16} className="text-green-500 shrink-0" />
                    ) : (
                      <XCircle size={16} className="text-red-500 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-800">{r.filename}</p>
                      {r.candidateName && (
                        <p className="text-xs text-gray-400">
                          {r.candidateName} • {r.experience} yrs • {r.skills?.slice(0, 3).join(', ')}
                        </p>
                      )}
                      {r.error && <p className="text-xs text-red-500">{r.error}</p>}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      'text-xs px-2 py-0.5 rounded-full',
                      r.status === 'success'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    )}
                  >
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
