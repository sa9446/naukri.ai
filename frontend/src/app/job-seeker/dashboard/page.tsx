'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { jobSeekerAPI } from '@/lib/api';
import { FileText, TrendingUp, Upload, ChevronRight } from 'lucide-react';

interface CV {
  id: string;
  originalName: string;
  uploadedAt: string;
  candidateAnalysis: {
    fullName: string;
    skills: string[];
    experience: number;
    domainExpertise: string[];
  } | null;
  _count: { jobMatches: number };
}

export default function JobSeekerDashboard() {
  const [cvs, setCvs] = useState<CV[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    jobSeekerAPI
      .getMyCVs()
      .then((res) => setCvs(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalMatches = cvs.reduce((sum, cv) => sum + (cv._count?.jobMatches || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Your CV processing and job matches at a glance</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'CVs Uploaded', value: cvs.length, icon: <FileText size={20} className="text-primary-500" /> },
            { label: 'Job Matches', value: totalMatches, icon: <TrendingUp size={20} className="text-green-500" /> },
            { label: 'Min Match Score', value: '80%', icon: <TrendingUp size={20} className="text-purple-500" /> },
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

        {/* Quick Action */}
        <Link
          href="/job-seeker/upload-cv"
          className="flex items-center justify-between bg-primary-600 text-white rounded-2xl px-6 py-4 hover:bg-primary-700 transition"
        >
          <div className="flex items-center gap-3">
            <Upload size={20} />
            <span className="font-medium">Upload a new CV</span>
          </div>
          <ChevronRight size={18} />
        </Link>

        {/* CV list */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">My CVs</h2>
          {loading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : cvs.length === 0 ? (
            <div className="bg-white rounded-2xl border p-8 text-center text-gray-400">
              No CVs yet. Upload your first CV to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {cvs.map((cv) => (
                <div key={cv.id} className="bg-white rounded-2xl border p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <FileText size={20} className="text-primary-400" />
                    <div>
                      <p className="font-medium text-gray-800">{cv.originalName}</p>
                      <p className="text-xs text-gray-400">
                        {cv.candidateAnalysis?.fullName || 'Parsing...'} •{' '}
                        {cv.candidateAnalysis?.experience || '?'} yrs exp •{' '}
                        Uploaded {new Date(cv.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/job-seeker/job-matches?cvId=${cv.id}`}
                    className="text-sm text-primary-600 font-medium hover:underline flex items-center gap-1"
                  >
                    {cv._count.jobMatches} matches <ChevronRight size={14} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
