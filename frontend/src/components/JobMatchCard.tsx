'use client';

import { useState } from 'react';
import { ExternalLink, TrendingUp, Briefcase, MapPin, DollarSign, Star, CheckCircle2, XCircle, Info, X, Clock, Layers } from 'lucide-react';
import clsx from 'clsx';

interface MatchReason {
  title?: { score: number; candidateLastRole: string; jobTitle: string; summary: string };
  skills: { score: number; matched: string[]; missing: string[]; summary: string };
  experience: { score: number; candidateYears: number; requiredRange: string; summary: string };
  domain: { score: number; candidateDomains: string[]; jobDomain: string; summary: string };
  behavioral: { score: number; summary: string };
}

interface JobMatchCardProps {
  matchScore: number;
  skillsScore: number;
  experienceScore: number;
  domainScore: number;
  behavioralScore: number;
  matchReasons: MatchReason;
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

const ScoreBadge = ({ label, score }: { label: string; score: number }) => (
  <div className="flex flex-col items-center">
    <div
      className={clsx(
        'w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white',
        score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-400'
      )}
    >
      {score}%
    </div>
    <span className="text-xs text-gray-500 mt-1">{label}</span>
  </div>
);

export default function JobMatchCard({
  matchScore,
  skillsScore,
  experienceScore,
  domainScore,
  behavioralScore,
  matchReasons,
  status,
  highlights,
  job,
}: JobMatchCardProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 hover:shadow-md transition">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
          <p className="text-gray-500 text-sm flex items-center gap-1 mt-0.5">
            <Briefcase size={13} />
            {job.company}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowInfo((v) => !v)}
            className={clsx(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition',
              showInfo
                ? 'bg-primary-50 border-primary-300 text-primary-700'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            )}
          >
            {showInfo ? <X size={12} /> : <Info size={12} />}
            {showInfo ? 'Close' : 'Job Info'}
          </button>
          <div className="flex flex-col items-center">
            <div
              className={clsx(
                'text-2xl font-bold',
                matchScore >= 70 ? 'text-green-600' : matchScore >= 50 ? 'text-primary-600' : 'text-yellow-600'
              )}
            >
              {matchScore}%
            </div>
            <span className="text-xs text-gray-400">Match</span>
          </div>
        </div>
      </div>

      {/* Info drawer */}
      {showInfo && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 text-sm">
          {/* Row 1: Domain, Experience, Job Type, Source */}
          <div className="grid grid-cols-2 gap-3">
            {job.domain && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                  <Layers size={11} /> Domain
                </p>
                <p className="text-gray-700 font-medium">{job.domain}</p>
              </div>
            )}
            {(job.experienceMin !== undefined || job.experienceMax !== undefined) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                  <Clock size={11} /> Experience Required
                </p>
                <p className="text-gray-700 font-medium">
                  {job.experienceMin ?? 0}–{job.experienceMax ?? '?'} years
                </p>
              </div>
            )}
            {job.salary && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                  <DollarSign size={11} /> Salary
                </p>
                <p className="text-gray-700 font-medium">{job.salary}</p>
              </div>
            )}
            {job.jobType && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                  <Briefcase size={11} /> Job Type
                </p>
                <p className="text-gray-700 font-medium">{job.jobType}</p>
              </div>
            )}
          </div>

          {/* Source + Posted */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full font-medium">{job.source}</span>
            <span>Posted {new Date(job.postedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>

          {/* Required Skills */}
          {job.requiredSkills?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Required Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.requiredSkills.map((s, i) => {
                  const have = matchReasons?.skills?.matched?.some(
                    (m) => m.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(m.toLowerCase())
                  );
                  return have ? (
                    <span key={i} className="flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full text-xs font-medium">
                      <CheckCircle2 size={10} /> {s}
                    </span>
                  ) : (
                    <span key={i} className="flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full text-xs">
                      <XCircle size={10} /> {s}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Score breakdown */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Match Breakdown</p>
            <div className="grid grid-cols-2 gap-1.5">
              {matchReasons?.title && (
                <div className="flex items-center justify-between bg-white border rounded-lg px-2.5 py-1.5">
                  <span className="text-xs text-gray-500">Title Fit</span>
                  <span className={clsx('text-xs font-bold', matchReasons.title.score >= 70 ? 'text-green-600' : matchReasons.title.score >= 50 ? 'text-yellow-600' : 'text-red-500')}>{matchReasons.title.score}%</span>
                </div>
              )}
              <div className="flex items-center justify-between bg-white border rounded-lg px-2.5 py-1.5">
                <span className="text-xs text-gray-500">Skills</span>
                <span className={clsx('text-xs font-bold', matchReasons?.skills?.score >= 70 ? 'text-green-600' : matchReasons?.skills?.score >= 50 ? 'text-yellow-600' : 'text-red-500')}>{matchReasons?.skills?.score ?? skillsScore}%</span>
              </div>
              <div className="flex items-center justify-between bg-white border rounded-lg px-2.5 py-1.5">
                <span className="text-xs text-gray-500">Experience</span>
                <span className={clsx('text-xs font-bold', matchReasons?.experience?.score >= 70 ? 'text-green-600' : matchReasons?.experience?.score >= 50 ? 'text-yellow-600' : 'text-red-500')}>{matchReasons?.experience?.score ?? experienceScore}%</span>
              </div>
              <div className="flex items-center justify-between bg-white border rounded-lg px-2.5 py-1.5">
                <span className="text-xs text-gray-500">Domain</span>
                <span className={clsx('text-xs font-bold', matchReasons?.domain?.score >= 70 ? 'text-green-600' : matchReasons?.domain?.score >= 50 ? 'text-yellow-600' : 'text-red-500')}>{matchReasons?.domain?.score ?? domainScore}%</span>
              </div>
            </div>
          </div>

          {/* Behavioral Fit */}
          {matchReasons?.behavioral && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Behavioral Fit</p>
              <div className="flex items-center gap-2">
                <div className={clsx(
                  'text-xs font-bold px-2 py-0.5 rounded-full',
                  matchReasons.behavioral.score >= 70 ? 'bg-green-100 text-green-700' : matchReasons.behavioral.score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
                )}>
                  {matchReasons.behavioral.score}%
                </div>
                <p className="text-gray-600 text-xs">{matchReasons.behavioral.summary}</p>
              </div>
            </div>
          )}

          {/* About the Role */}
          {job.description && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">About the Role</p>
              <p className="text-gray-600 text-xs leading-relaxed line-clamp-4">{job.description}</p>
            </div>
          )}

          {/* Apply button inside drawer */}
          {job.sourceUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium py-2 rounded-lg transition"
            >
              Apply Now <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}

      {/* Meta */}
      <div className="flex flex-wrap gap-3 text-sm text-gray-500">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin size={13} /> {job.location}
          </span>
        )}
        {job.salary && (
          <span className="flex items-center gap-1">
            <DollarSign size={13} /> {job.salary}
          </span>
        )}
        {job.jobType && (
          <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs">{job.jobType}</span>
        )}
        <span className="bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full text-xs font-medium">
          {job.source}
        </span>
      </div>

      {/* Score breakdown */}
      <div className="flex justify-around border-t pt-4">
        <ScoreBadge label="Skills" score={skillsScore} />
        <ScoreBadge label="Experience" score={experienceScore} />
        <ScoreBadge label="Domain" score={domainScore} />
        <ScoreBadge label="Behavioral" score={behavioralScore} />
      </div>

      {/* Match Reasons */}
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <TrendingUp size={14} className="text-primary-500 mt-0.5 shrink-0" />
          <span className="text-gray-600">{matchReasons?.skills?.summary}</span>
        </div>
        <div className="flex items-start gap-2">
          <TrendingUp size={14} className="text-primary-500 mt-0.5 shrink-0" />
          <span className="text-gray-600">{matchReasons?.experience?.summary}</span>
        </div>
        <div className="flex items-start gap-2">
          <TrendingUp size={14} className="text-primary-500 mt-0.5 shrink-0" />
          <span className="text-gray-600">{matchReasons?.behavioral?.summary}</span>
        </div>
      </div>


      {/* Your highlights to mention */}
      {highlights && highlights.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <Star size={12} className="fill-amber-400 text-amber-400" />
            Mention these when applying
          </div>
          <ul className="space-y-1">
            {highlights.slice(0, 3).map((h, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <Star size={10} className="fill-amber-300 text-amber-300 mt-0.5 shrink-0" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-xs text-gray-400">
          {new Date(job.postedAt).toLocaleDateString()}
        </span>
        <div className="flex gap-2">
          <span
            className={clsx(
              'text-xs px-2 py-1 rounded-full font-medium',
              status === 'SHORTLISTED'
                ? 'bg-green-100 text-green-700'
                : status === 'REJECTED'
                ? 'bg-red-100 text-red-600'
                : 'bg-gray-100 text-gray-500'
            )}
          >
            {status}
          </span>
          {job.sourceUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs flex items-center gap-1 text-primary-600 hover:underline"
            >
              Apply <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
