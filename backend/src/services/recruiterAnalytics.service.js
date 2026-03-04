/**
 * RECRUITER ANALYTICS SERVICE
 * Batch CV processing, candidate ranking, and analytics aggregation.
 */

const prisma = require('../config/database');
const cvExtraction = require('./cvExtraction.service');
const aiInference = require('./aiInference.service');
const jobMatching = require('./jobMatching.service');
const logger = require('../config/logger');
const pLimit = require('p-limit');

class RecruiterAnalyticsService {
  /**
   * Process a batch of uploaded CVs for a recruiter.
   * Returns a pipeline result with processing status per file.
   * @param {Express.Multer.File[]} files - Uploaded files
   * @param {string} recruiterProfileId
   * @param {string} [targetJobId] - Optional: match against a specific job
   * @returns {Promise<Object>} - Batch processing results
   */
  async processBatch(files, recruiterProfileId, targetJobId = null) {
    logger.info(`Processing batch of ${files.length} CVs for recruiter ${recruiterProfileId}`);

    const limit = pLimit(3); // max 3 concurrent OpenAI calls
    const results = [];

    const tasks = files.map((file) =>
      limit(async () => {
        const result = { filename: file.originalname, status: 'pending', cvId: null, error: null };
        try {
          // 1. Extract raw text
          const rawText = await cvExtraction.extractText(file.path, file.mimetype);

          // 2. Create a temporary CV record (not linked to a job seeker profile)
          const cv = await prisma.cV.create({
            data: {
              jobSeekerProfileId: await this._getOrCreateAnonymousProfile(recruiterProfileId),
              filename: file.filename,
              originalName: file.originalname,
              mimeType: file.mimetype,
              fileSize: file.size,
              rawText,
            },
          });

          // 3. Parse CV via AI
          const parsed = await aiInference.parseCVToStructured(rawText);
          const embedding = await aiInference.generateEmbedding(rawText);

          await prisma.candidateAnalysis.create({
            data: {
              cvId: cv.id,
              fullName: parsed.fullName,
              email: parsed.email,
              phone: parsed.phone,
              location: parsed.location,
              summary: parsed.summary,
              skills: parsed.skills || [],
              experience: parsed.totalExperienceYears || 0,
              experienceJson: parsed.experience || [],
              education: parsed.education || [],
              certifications: parsed.certifications || [],
              languages: parsed.languages || [],
              domainExpertise: parsed.domainExpertise || [],
              highlights: parsed.highlights || [],
              behavioralFit: parsed.behavioralFit || {},
              embedding,
            },
          });

          // 4. Match against specific job if provided
          if (targetJobId) {
            await jobMatching.matchCVToJobs(cv.id);
          }

          result.cvId = cv.id;
          result.status = 'success';
          result.candidateName = parsed.fullName || 'Unknown';
          result.skills = parsed.skills || [];
          result.experience = parsed.totalExperienceYears || 0;

          // Cleanup uploaded file
          cvExtraction.cleanupFile(file.path);
        } catch (err) {
          logger.error(`Batch processing failed for ${file.originalname}:`, err);
          result.status = 'failed';
          result.error = err.message;
          cvExtraction.cleanupFile(file.path);
        }
        return result;
      })
    );

    const batchResults = await Promise.all(tasks);

    const summary = {
      total: files.length,
      success: batchResults.filter((r) => r.status === 'success').length,
      failed: batchResults.filter((r) => r.status === 'failed').length,
      results: batchResults,
    };

    logger.info(`Batch complete: ${summary.success}/${summary.total} succeeded`);
    return summary;
  }

  /**
   * Get all candidates with their rankings for a specific job.
   * Supports filtering and sorting.
   */
  async getCandidatesForJob(jobId, filters = {}, page = 1, limit = 20) {
    const matches = await jobMatching.getRankedCandidatesForJob(jobId, filters);
    const total = matches.length;
    const paginated = matches.slice((page - 1) * limit, page * limit);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      candidates: paginated.map((m) => this._formatCandidate(m)),
    };
  }

  /**
   * Get analytics summary for a recruiter's jobs.
   */
  async getRecruiterDashboardStats(recruiterProfileId) {
    const jobs = await prisma.jobPosting.findMany({
      where: { recruiterProfileId },
      include: {
        _count: { select: { jobMatches: true } },
        jobMatches: {
          orderBy: { matchScore: 'desc' },
          take: 1,
          select: { matchScore: true },
        },
      },
    });

    const totalCandidates = jobs.reduce((sum, j) => sum + j._count.jobMatches, 0);

    return {
      totalJobs: jobs.length,
      activeJobs: jobs.filter((j) => j.isActive).length,
      totalCandidatesMatched: totalCandidates,
      jobsOverview: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        matchedCandidates: j._count.jobMatches,
        topScore: j.jobMatches[0]?.matchScore
          ? Math.round(j.jobMatches[0].matchScore * 100)
          : null,
        isActive: j.isActive,
        postedAt: j.postedAt,
      })),
    };
  }

  /**
   * Get skill distribution across all candidates matched to a job.
   */
  async getSkillDistribution(jobId) {
    const matches = await prisma.jobMatch.findMany({
      where: { jobId },
      include: { cv: { include: { candidateAnalysis: true } } },
    });

    const skillCount = {};
    for (const m of matches) {
      for (const skill of m.cv?.candidateAnalysis?.skills || []) {
        skillCount[skill] = (skillCount[skill] || 0) + 1;
      }
    }

    return Object.entries(skillCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([skill, count]) => ({ skill, count }));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _formatCandidate(match) {
    const a = match.cv?.candidateAnalysis;
    return {
      matchId: match.id,
      cvId: match.cvId,
      matchScore: Math.round(match.matchScore * 100),
      skillsScore: Math.round(match.skillsScore * 100),
      experienceScore: Math.round(match.experienceScore * 100),
      domainScore: Math.round(match.domainScore * 100),
      behavioralScore: Math.round(match.behavioralScore * 100),
      matchReasons: match.matchReasons,
      status: match.status,
      candidate: a
        ? {
            fullName: a.fullName,
            email: a.email,
            location: a.location,
            skills: a.skills,
            experience: a.experience,
            domainExpertise: a.domainExpertise,
            highlights: a.highlights || [],
            behavioralFit: a.behavioralFit,
          }
        : null,
    };
  }

  async _getOrCreateAnonymousProfile(recruiterProfileId) {
    // For batch uploads by recruiters, CVs are stored under an anonymous job seeker
    const existing = await prisma.user.findFirst({
      where: { email: `recruiter-batch-${recruiterProfileId}@internal.naukri` },
      include: { jobSeekerProfile: true },
    });

    if (existing?.jobSeekerProfile) return existing.jobSeekerProfile.id;

    const user = await prisma.user.create({
      data: {
        email: `recruiter-batch-${recruiterProfileId}@internal.naukri`,
        password: 'batch-internal',
        role: 'JOB_SEEKER',
        jobSeekerProfile: { create: {} },
      },
      include: { jobSeekerProfile: true },
    });

    return user.jobSeekerProfile.id;
  }
}

module.exports = new RecruiterAnalyticsService();
