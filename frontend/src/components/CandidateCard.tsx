'use client';

import clsx from 'clsx';
import { User, Briefcase, Globe, Brain, Trophy } from 'lucide-react';

interface CandidateCardProps {
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
  onStatusChange?: (matchId: string, status: string) => void;
}

export default function CandidateCard({
  matchId,
  matchScore,
  skillsScore,
  experienceScore,
  domainScore,
  behavioralScore,
  matchReasons,
  status,
  candidate,
  onStatusChange,
}: CandidateCardProps) {
  const scoreColor = (s: number) =>
    s >= 80 ? 'text-green-600' : s >= 60 ? 'text-yellow-600' : 'text-red-500';

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4 hover:shadow-md transition">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
            <User size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{candidate?.fullName || 'Anonymous'}</h3>
            <p className="text-xs text-gray-400">{candidate?.email}</p>
          </div>
        </div>
        <div className="text-right">
          <div className={clsx('text-2xl font-bold', scoreColor(matchScore))}>{matchScore}%</div>
          <div className="text-xs text-gray-400">Overall</div>
        </div>
      </div>

      {/* Score grid */}
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        {[
          { icon: <Brain size={14} />, label: 'Skills', score: skillsScore },
          { icon: <Briefcase size={14} />, label: 'Exp', score: experienceScore },
          { icon: <Globe size={14} />, label: 'Domain', score: domainScore },
          { icon: <User size={14} />, label: 'Behavior', score: behavioralScore },
        ].map((item) => (
          <div key={item.label} className="bg-gray-50 rounded-xl py-2">
            <div className={clsx('font-bold', scoreColor(item.score))}>{item.score}%</div>
            <div className="text-xs text-gray-400 flex items-center justify-center gap-0.5 mt-0.5">
              {item.icon} {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* Skills */}
      <div className="flex flex-wrap gap-1.5">
        {[...new Set(candidate?.skills ?? [])].slice(0, 8).map((s, i) => (
          <span
            key={`skill-${s}-${i}`}
            className={clsx(
              'px-2 py-0.5 rounded-full text-xs font-medium border',
              matchReasons.skills.matched?.includes(s.toLowerCase())
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            )}
          >
            {s}
          </span>
        ))}
      </div>

      {/* Experience & Domain */}
      <div className="text-sm text-gray-600 space-y-1">
        <p>{matchReasons.experience?.summary}</p>
        <p className="text-xs text-gray-400">{matchReasons.domain?.summary}</p>
      </div>

      {/* Key Achievements */}
      {candidate?.highlights && candidate.highlights.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <Trophy size={13} className="text-amber-500" />
            Key Achievements — Ask about these
          </div>
          <ul className="space-y-1">
            {candidate.highlights.slice(0, 4).map((h, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                <Trophy size={11} className="text-amber-400 mt-0.5 shrink-0" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Behavioral traits */}
      {candidate?.behavioralFit?.traits && candidate.behavioralFit.traits.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidate.behavioralFit.traits.slice(0, 4).map((t) => (
            <span key={t} className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full text-xs">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Status Actions */}
      {onStatusChange && (
        <div className="flex gap-2 pt-2 border-t">
          <button
            onClick={() => onStatusChange(matchId, 'SHORTLISTED')}
            className={clsx(
              'flex-1 py-1.5 rounded-lg text-sm font-medium transition',
              status === 'SHORTLISTED'
                ? 'bg-green-600 text-white'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            )}
          >
            Shortlist
          </button>
          <button
            onClick={() => onStatusChange(matchId, 'REVIEWED')}
            className={clsx(
              'flex-1 py-1.5 rounded-lg text-sm font-medium transition',
              status === 'REVIEWED'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            )}
          >
            Mark Reviewed
          </button>
          <button
            onClick={() => onStatusChange(matchId, 'REJECTED')}
            className={clsx(
              'flex-1 py-1.5 rounded-lg text-sm font-medium transition',
              status === 'REJECTED'
                ? 'bg-red-500 text-white'
                : 'bg-red-50 text-red-600 hover:bg-red-100'
            )}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
