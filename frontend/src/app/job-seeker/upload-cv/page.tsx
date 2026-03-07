'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import CVUpload from '@/components/CVUpload';
import { jobSeekerAPI } from '@/lib/api';
import { CheckCircle, Star, Pencil, Plus, X, Save, Loader2 } from 'lucide-react';

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

interface EditableProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string[];
  experience: number;
  domainExpertise: string[];
}

export default function UploadCVPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<EditableProfile | null>(null);
  const [newSkill, setNewSkill] = useState('');

  const handleUpload = async (files: File[]) => {
    setLoading(true);
    setError('');
    setResult(null);
    setSaved(false);

    const formData = new FormData();
    formData.append('cv', files[0]);

    try {
      const res = await jobSeekerAPI.uploadCV(formData);
      const data: UploadResult = res.data;
      setResult(data);
      // Pre-populate editable form with parsed values
      setProfile({
        fullName: data.parsedProfile.fullName || '',
        email: '',
        phone: '',
        location: '',
        summary: '',
        skills: data.parsedProfile.skills || [],
        experience: data.parsedProfile.experience || 0,
        domainExpertise: data.parsedProfile.domainExpertise || [],
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result || !profile) return;
    setSaving(true);
    try {
      await jobSeekerAPI.updateCVAnalysis(result.cvId, {
        fullName: profile.fullName || undefined,
        email: profile.email || undefined,
        phone: profile.phone || undefined,
        location: profile.location || undefined,
        summary: profile.summary || undefined,
        skills: profile.skills,
        experience: profile.experience,
        domainExpertise: profile.domainExpertise,
      });
      setSaved(true);
      setEditing(false);
    } catch {
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const addSkill = () => {
    if (!newSkill.trim() || !profile) return;
    if (!profile.skills.includes(newSkill.trim())) {
      setProfile({ ...profile, skills: [...profile.skills, newSkill.trim()] });
    }
    setNewSkill('');
  };

  const removeSkill = (skill: string) => {
    if (!profile) return;
    setProfile({ ...profile, skills: profile.skills.filter((s) => s !== skill) });
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

        {!result && (
          <div className="bg-white rounded-2xl border p-6">
            <CVUpload onUpload={handleUpload} loading={loading} />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {result && profile && (
          <>
            {/* Success banner */}
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                <CheckCircle size={17} />
                CV Parsed Successfully
              </div>
              <button
                onClick={() => { setResult(null); setProfile(null); setSaved(false); setEditing(false); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Upload another
              </button>
            </div>

            {/* Editable profile card */}
            <div className="bg-white rounded-2xl border p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Parsed Profile</h2>
                <div className="flex items-center gap-2">
                  {saved && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle size={12} /> Saved
                    </span>
                  )}
                  {editing ? (
                    <>
                      <button
                        onClick={() => setEditing(false)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Save Changes
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 text-xs text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-50 transition"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  )}
                </div>
              </div>

              {editing ? (
                <div className="space-y-4">
                  {/* Name */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Full Name</label>
                      <input
                        value={profile.fullName}
                        onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Email</label>
                      <input
                        value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Phone</label>
                      <input
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Location</label>
                      <input
                        value={profile.location}
                        onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  {/* Experience */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Total Experience (years)</label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      step={0.5}
                      value={profile.experience}
                      onChange={(e) => setProfile({ ...profile, experience: parseFloat(e.target.value) || 0 })}
                      className="w-32 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* Summary */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Summary</label>
                    <textarea
                      value={profile.summary}
                      onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
                      rows={3}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    />
                  </div>

                  {/* Skills */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Skills</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {profile.skills.map((s) => (
                        <span key={s} className="flex items-center gap-1 bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 rounded-full text-xs">
                          {s}
                          <button onClick={() => removeSkill(s)} className="hover:text-red-500">
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                        placeholder="Add skill..."
                        className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <button
                        onClick={addSkill}
                        className="flex items-center gap-1 border px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                      >
                        <Plus size={13} /> Add
                      </button>
                    </div>
                  </div>

                  {/* Domain expertise */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Domain Expertise (comma-separated)</label>
                    <input
                      value={profile.domainExpertise.join(', ')}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          domainExpertise: e.target.value.split(',').map((d) => d.trim()).filter(Boolean),
                        })
                      }
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              ) : (
                /* Read-only view */
                <div className="text-sm space-y-2 text-gray-700">
                  <p><strong>Name:</strong> {profile.fullName || <span className="text-gray-400">Not detected</span>}</p>
                  <p><strong>Experience:</strong> {profile.experience} years</p>
                  {profile.location && <p><strong>Location:</strong> {profile.location}</p>}
                  <p><strong>Domains:</strong> {profile.domainExpertise.join(', ') || <span className="text-gray-400">N/A</span>}</p>
                  <div>
                    <strong>Skills:</strong>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {[...new Set(profile.skills)].slice(0, 16).map((s, i) => (
                        <span key={`skill-${s}-${i}`} className="bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 rounded-full text-xs">
                          {s}
                        </span>
                      ))}
                      {profile.skills.length > 16 && (
                        <span className="text-xs text-gray-400">+{profile.skills.length - 16} more</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 pt-1">
                    {saved
                      ? 'Profile updated. Job matching is re-running with your corrections.'
                      : 'Click Edit to correct any mistakes the AI made.'}
                  </p>
                </div>
              )}
            </div>

            {/* Highlights */}
            {result.parsedProfile.highlights && result.parsedProfile.highlights.length > 0 && (
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
          </>
        )}
      </div>
    </div>
  );
}
