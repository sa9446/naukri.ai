'use client';

import { ExternalLink, TrendingUp, Briefcase, MapPin, DollarSign, Star } from 'lucide-react';
import clsx from 'clsx';

interface MatchReason {
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
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 hover:shadow-md transition">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
          <p className="text-gray-500 text-sm flex items-center gap-1 mt-0.5">
            <Briefcase size={13} />
            {job.company}
          </p>
        </div>
        <div className="flex flex-col items-center">
          <div
            className={clsx(
              'text-2xl font-bold',
              matchScore >= 90 ? 'text-green-600' : matchScore >= 80 ? 'text-primary-600' : 'text-yellow-600'
            )}
          >
            {matchScore}%
          </div>
          <span className="text-xs text-gray-400">Match</span>
        </div>
      </div>

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

      {/* Matched skills */}
      {matchReasons?.skills?.matched?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {matchReasons.skills.matched.map((s, i) => (
            <span
              key={`matched-${s}-${i}`}
              className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full text-xs font-medium"
            >
              {s}
            </span>
          ))}
          {matchReasons.skills.missing?.map((s, i) => (
            <span
              key={`missing-${s}-${i}`}
              className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full text-xs"
            >
              {s} (missing)
            </span>
          ))}
        </div>
      )}

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
