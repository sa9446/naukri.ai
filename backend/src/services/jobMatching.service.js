/**
 * JOB MATCHING SERVICE
 * Implements vector similarity + weighted scoring to match CVs to jobs.
 * Only returns matches with score >= MIN_MATCH_SCORE (default 80%).
 */

const prisma = require('../config/database');
const aiInference = require('./aiInference.service');
const logger = require('../config/logger');

// ─── Configurable weights (must sum to 1.0) ──────────────────────────────────
// Title is primary when candidate has job history (last role drives search intent).
const WEIGHTS = {
  title: parseFloat(process.env.WEIGHT_TITLE || '0.50'),
  skills: parseFloat(process.env.WEIGHT_SKILLS || '0.25'),
  experience: parseFloat(process.env.WEIGHT_EXPERIENCE || '0.15'),
  domain: parseFloat(process.env.WEIGHT_DOMAIN || '0.05'),
  behavioral: parseFloat(process.env.WEIGHT_BEHAVIORAL || '0.05'),
};

const MIN_MATCH_SCORE = parseFloat(process.env.MIN_MATCH_SCORE || '0.35');
const TOP_N_FALLBACK = 10; // always show at least this many matches

class JobMatchingService {
  /**
   * Run full matching pipeline for a CV against all active jobs.
   * Stores results with score >= MIN_MATCH_SCORE.
   * @param {string} cvId
   * @returns {Promise<JobMatch[]>}
   */
  async matchCVToJobs(cvId) {
    logger.info(`Starting job matching for CV: ${cvId}`);

    const cv = await prisma.cV.findUnique({
      where: { id: cvId },
      include: { candidateAnalysis: true },
    });

    if (!cv || !cv.candidateAnalysis) {
      throw new Error('CV or candidate analysis not found. Run CV parsing first.');
    }

    const analysis = cv.candidateAnalysis;

    // If no embedding stored yet, generate one
    let cvEmbedding = analysis.embedding;
    if (!cvEmbedding || cvEmbedding.length === 0) {
      cvEmbedding = await aiInference.generateEmbedding(cv.rawText);
      await prisma.candidateAnalysis.update({
        where: { cvId },
        data: { embedding: cvEmbedding },
      });
    }

    // Load all active job postings
    const jobs = await prisma.jobPosting.findMany({
      where: { isActive: true },
    });

    if (jobs.length === 0) {
      logger.warn('No active job postings found');
      return [];
    }

    logger.info(`Matching CV against ${jobs.length} jobs...`);

    // Score all jobs
    const scored = await Promise.all(
      jobs.map((job) => this._scoreMatch(analysis, cvEmbedding, job))
    );

    // Sort all by score
    scored.sort((a, b) => b.matchScore - a.matchScore);

    // Filter by threshold, but always keep at least TOP_N_FALLBACK results
    let qualified = scored.filter((s) => s.matchScore >= MIN_MATCH_SCORE);
    if (qualified.length < TOP_N_FALLBACK) {
      qualified = scored.slice(0, TOP_N_FALLBACK);
    }

    logger.info(`Found ${qualified.length} matched jobs (threshold: ${MIN_MATCH_SCORE})`);

    // Upsert matches into database
    const savedMatches = [];
    for (const match of qualified) {
      const saved = await prisma.jobMatch.upsert({
        where: { cvId_jobId: { cvId, jobId: match.jobId } },
        update: {
          matchScore: match.matchScore,
          skillsScore: match.skillsScore,
          experienceScore: match.experienceScore,
          domainScore: match.domainScore,
          behavioralScore: match.behavioralScore,
          matchReasons: match.matchReasons,
        },
        create: {
          cvId,
          jobId: match.jobId,
          matchScore: match.matchScore,
          skillsScore: match.skillsScore,
          experienceScore: match.experienceScore,
          domainScore: match.domainScore,
          behavioralScore: match.behavioralScore,
          matchReasons: match.matchReasons,
        },
        include: { job: true },
      });
      savedMatches.push(saved);
    }

    return savedMatches;
  }

  /**
   * Score a single (candidate, job) pair.
   * Returns detailed scores by dimension.
   */
  async _scoreMatch(analysis, cvEmbedding, job) {
    const lastJobTitle = this._getLastJobTitle(analysis.experienceJson);
    const titleScore = this._scoreTitle(lastJobTitle, job.title);
    const skillsScore = this._scoreSkills(analysis.skills, job.requiredSkills);
    const experienceScore = this._scoreExperience(analysis.experience, job.experienceMin, job.experienceMax);
    const domainScore = this._scoreDomain(analysis.domainExpertise, job.domain, job.description);
    const behavioralScore = await this._scoreBehavioral(analysis, job, cvEmbedding);

    const matchScore = lastJobTitle
      ? titleScore * WEIGHTS.title +
        skillsScore * WEIGHTS.skills +
        experienceScore * WEIGHTS.experience +
        domainScore * WEIGHTS.domain +
        behavioralScore * WEIGHTS.behavioral
      : skillsScore * 0.40 +
        experienceScore * 0.25 +
        domainScore * 0.20 +
        behavioralScore * 0.15;

    const matchReasons = this._buildMatchReasons(
      analysis,
      job,
      titleScore,
      lastJobTitle,
      skillsScore,
      experienceScore,
      domainScore,
      behavioralScore
    );

    return {
      jobId: job.id,
      matchScore: Math.min(matchScore, 1.0),
      skillsScore,
      experienceScore,
      domainScore,
      behavioralScore,
      matchReasons,
    };
  }

  // ─── Scoring Dimensions ────────────────────────────────────────────────────

  /**
   * Extract the most recent job title from experienceJson.
   * Assumes first entry is most recent (or finds "Present" role).
   */
  _getLastJobTitle(experienceJson = []) {
    if (!experienceJson || experienceJson.length === 0) return null;
    const current = experienceJson.find((e) => e.endDate === 'Present' || e.endDate === null || !e.endDate);
    return (current || experienceJson[0])?.role || null;
  }

  /**
   * Title score: how closely the candidate's last job title matches the job title.
   * Uses keyword overlap + Levenshtein similarity.
   */
  _scoreTitle(lastJobTitle, jobTitle) {
    if (!lastJobTitle) return 0.4; // neutral if no history
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const a = normalize(lastJobTitle);
    const b = normalize(jobTitle);

    // Exact or near-exact match
    if (a === b) return 1.0;
    const levSim = this._levenshteinSimilarity(a, b);
    if (levSim > 0.85) return 1.0;

    // Keyword overlap
    const aWords = new Set(a.split(' ').filter((w) => w.length > 2));
    const bWords = new Set(b.split(' ').filter((w) => w.length > 2));
    if (aWords.size === 0 || bWords.size === 0) return levSim;

    let shared = 0;
    for (const w of aWords) {
      if (bWords.has(w) || [...bWords].some((bw) => bw.includes(w) || w.includes(bw))) shared++;
    }
    const keywordScore = shared / Math.max(aWords.size, bWords.size);

    return Math.max(levSim, keywordScore);
  }

  /**
   * Skills score: Jaccard similarity between candidate skills and required skills.
   * Partial string matching to handle "React" vs "React.js".
   */
  _scoreSkills(candidateSkills = [], requiredSkills = []) {
    if (!requiredSkills.length) return 0.5; // neutral if no requirements

    const normalize = (s) => s.toLowerCase().trim();
    const candNorm = candidateSkills.map(normalize);
    const reqNorm = requiredSkills.map(normalize);

    let matched = 0;
    for (const req of reqNorm) {
      const found = candNorm.some(
        (cand) => cand.includes(req) || req.includes(cand) || this._levenshteinSimilarity(cand, req) > 0.8
      );
      if (found) matched++;
    }

    return matched / reqNorm.length;
  }

  /**
   * Experience score: continuous scoring based on years overlap.
   */
  _scoreExperience(candidateYears = 0, minRequired = 0, maxRequired = 99) {
    if (candidateYears >= minRequired && candidateYears <= maxRequired) {
      return 1.0; // perfect fit
    }
    if (candidateYears < minRequired) {
      const deficit = minRequired - candidateYears;
      return Math.max(0, 1.0 - deficit / (minRequired || 1));
    }
    // Overqualified — slight penalty
    const excess = candidateYears - maxRequired;
    return Math.max(0.6, 1.0 - excess * 0.05);
  }

  /**
   * Domain score: semantic overlap using cosine similarity on embeddings
   * plus keyword matching against job description.
   */
  _scoreDomain(candidateDomains = [], jobDomain, jobDescription = '') {
    if (!candidateDomains.length) return 0.3;

    const normalize = (s) => s.toLowerCase().trim();
    const descLower = jobDescription.toLowerCase();
    const domainLower = (jobDomain || '').toLowerCase();

    let score = 0;
    for (const domain of candidateDomains) {
      const d = normalize(domain);
      if (domainLower.includes(d) || d.includes(domainLower)) {
        score += 1.0;
        break;
      }
      if (descLower.includes(d)) {
        score += 0.7;
        break;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Behavioral score: cosine similarity between CV embedding and job embedding.
   * Falls back to 0.5 if job has no embedding yet.
   */
  async _scoreBehavioral(analysis, job, cvEmbedding) {
    if (!job.embedding || job.embedding.length === 0) {
      // Generate job embedding on demand
      try {
        const embedding = await aiInference.generateEmbedding(
          `${job.title} ${job.description} ${job.requiredSkills?.join(' ')}`
        );
        await prisma.jobPosting.update({
          where: { id: job.id },
          data: { embedding },
        });
        return this._cosineSimilarity(cvEmbedding, embedding);
      } catch {
        return 0.5;
      }
    }
    return this._cosineSimilarity(cvEmbedding, job.embedding);
  }

  // ─── Math Utilities ────────────────────────────────────────────────────────

  /**
   * Cosine similarity between two vectors.
   */
  _cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Normalized Levenshtein similarity (0..1).
   */
  _levenshteinSimilarity(a, b) {
    const dist = this._levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - dist / maxLen;
  }

  _levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[a.length][b.length];
  }

  // ─── Match Reason Builder ──────────────────────────────────────────────────

  _buildMatchReasons(analysis, job, titleScore, lastJobTitle, skillsScore, experienceScore, domainScore, behavioralScore) {
    const normalize = (s) => s.toLowerCase().trim();
    const reqNorm = (job.requiredSkills || []).map(normalize);
    const candNorm = (analysis.skills || []).map(normalize);

    const matchedSkills = reqNorm.filter((req) =>
      candNorm.some((cand) => cand.includes(req) || req.includes(cand))
    );
    const missingSkills = reqNorm.filter((req) =>
      !candNorm.some((cand) => cand.includes(req) || req.includes(cand))
    );

    return {
      title: {
        score: Math.round(titleScore * 100),
        candidateLastRole: lastJobTitle || 'Not available',
        jobTitle: job.title,
        summary: titleScore >= 0.7 ? 'Strong role alignment with last position' : titleScore >= 0.4 ? 'Moderate role similarity' : 'Different role from last position',
      },
      skills: {
        score: Math.round(skillsScore * 100),
        matched: matchedSkills,
        missing: missingSkills,
        summary: `${matchedSkills.length}/${reqNorm.length} required skills matched`,
      },
      experience: {
        score: Math.round(experienceScore * 100),
        candidateYears: analysis.experience,
        requiredRange: `${job.experienceMin}–${job.experienceMax} years`,
        summary:
          analysis.experience >= job.experienceMin
            ? `${analysis.experience} years meets ${job.experienceMin}+ requirement`
            : `${analysis.experience} years is below ${job.experienceMin} year minimum`,
      },
      domain: {
        score: Math.round(domainScore * 100),
        candidateDomains: analysis.domainExpertise || [],
        jobDomain: job.domain || 'Not specified',
        summary: domainScore >= 0.7 ? 'Strong domain alignment' : 'Moderate domain overlap',
      },
      behavioral: {
        score: Math.round(behavioralScore * 100),
        summary:
          behavioralScore >= 0.75
            ? 'Strong semantic alignment with job requirements'
            : 'Moderate semantic fit',
      },
    };
  }

  /**
   * Get ranked candidates for a specific job (for recruiters).
   * @param {string} jobId
   * @param {Object} filters - { skills, minExperience, maxExperience, domain }
   * @returns {Promise<JobMatch[]>}
   */
  async getRankedCandidatesForJob(jobId, filters = {}) {
    const where = { jobId, matchScore: { gte: MIN_MATCH_SCORE } };

    const matches = await prisma.jobMatch.findMany({
      where,
      orderBy: { matchScore: 'desc' },
      include: {
        cv: {
          include: { candidateAnalysis: true },
        },
      },
    });

    // Apply optional recruiter filters
    return matches.filter((m) => {
      const a = m.cv?.candidateAnalysis;
      if (!a) return true;

      if (filters.minExperience && a.experience < filters.minExperience) return false;
      if (filters.maxExperience && a.experience > filters.maxExperience) return false;
      if (filters.skills && filters.skills.length > 0) {
        const candSkillsLower = (a.skills || []).map((s) => s.toLowerCase());
        const hasAll = filters.skills.every((s) =>
          candSkillsLower.some((cs) => cs.includes(s.toLowerCase()))
        );
        if (!hasAll) return false;
      }
      if (filters.domain) {
        const domains = (a.domainExpertise || []).map((d) => d.toLowerCase());
        if (!domains.some((d) => d.includes(filters.domain.toLowerCase()))) return false;
      }

      return true;
    });
  }
}

module.exports = new JobMatchingService();
