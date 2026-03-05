'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import CVUpload from '@/components/CVUpload';
import { jobSeekerAPI } from '@/lib/api';
import { CheckCircle, Star } from 'lucide-react';

interface UploadResult {
  cvId: string;
  parsedProfile: {
    fullName: string;
    skills: string[];
    experience: number;
    domainExpertise: string[];
    highlights: string[];
  };
}

export default function UploadCVPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

  const handleUpload = async (files: File[]) => {
    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('cv', files[0]);

    try {
      const res = await jobSeekerAPI.uploadCV(formData);
      setResult(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upload Your CV</h1>
          <p className="text-gray-500 text-sm mt-1">
            Your CV will be parsed by AI and matched against active jobs automatically.
          </p>
        </div>

        <div className="bg-white rounded-2xl border p-6">
          <CVUpload onUpload={handleUpload} loading={loading} />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-green-700 font-semibold">
              <CheckCircle size={18} />
              CV Parsed Successfully
            </div>
            <div className="text-sm space-y-1 text-gray-700">
              <p><strong>Name:</strong> {result.parsedProfile.fullName || 'Not detected'}</p>
              <p><strong>Experience:</strong> {result.parsedProfile.experience} years</p>
              <p><strong>Domains:</strong> {result.parsedProfile.domainExpertise?.join(', ') || 'N/A'}</p>
              <div>
                <strong>Skills detected:</strong>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {[...new Set(result.parsedProfile.skills ?? [])].slice(0, 12).map((s, i) => (
                    <span key={`skill-${s}-${i}`} className="bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 rounded-full text-xs">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Job matching is running in the background. Check your dashboard for results.
            </p>
          </div>
        )}

        {result && result.parsedProfile.highlights && result.parsedProfile.highlights.length > 0 && (
          <div className="bg-white rounded-2xl border p-6 space-y-3">
            <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm">
              <Star size={16} className="fill-amber-400 text-amber-400" />
              Key Highlights
            </div>
            <ul className="space-y-2">
              {result.parsedProfile.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <Star size={13} className="fill-amber-300 text-amber-300 mt-0.5 shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400">
              These are your strongest talking points — mention them in interviews and cover letters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
