const prisma = require('../config/database');
const recruiterAnalytics = require('../services/recruiterAnalytics.service');
const jobScraper = require('../services/jobScraper.service');
const logger = require('../config/logger');

/**
 * Upload multiple CVs in batch for evaluation.
 */
const uploadBatchCVs = async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  try {
    const profile = await prisma.recruiterProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!profile) return res.status(404).json({ error: 'Recruiter profile not found' });

    const { targetJobId } = req.body;

    const result = await recruiterAnalytics.processBatch(req.files, profile.id, targetJobId);
    res.status(201).json(result);
  } catch (err) {
    logger.error('Batch CV upload error:', err);
    res.status(500).json({ error: err.message || 'Batch processing failed' });
  }
};

/**
 * Create a job posting manually.
 */
const createJobPosting = async (req, res) => {
  try {
    const profile = await prisma.recruiterProfile.findUnique({
      where: { userId: req.user.id },
    });

    const job = await jobScraper.ingestManualJob(req.body, profile.id);
    res.status(201).json(job);
  } catch (err) {
    logger.error('Create job error:', err);
    res.status(500).json({ error: 'Failed to create job posting' });
  }
};

/**
 * Get all job postings for this recruiter.
 */
const getMyJobPostings = async (req, res) => {
  try {
    const profile = await prisma.recruiterProfile.findUnique({
      where: { userId: req.user.id },
    });

    const jobs = await prisma.jobPosting.findMany({
      where: { recruiterProfileId: profile.id },
      include: { _count: { select: { jobMatches: true } } },
      orderBy: { postedAt: 'desc' },
    });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch job postings' });
  }
};

/**
 * Get ranked candidates for a job with optional filters.
 */
const getCandidatesForJob = async (req, res) => {
  const { jobId } = req.params;
  const { skills, minExperience, maxExperience, domain, page = 1, limit = 20 } = req.query;

  try {
    const filters = {
      skills: skills ? skills.split(',').map((s) => s.trim()) : [],
      minExperience: minExperience ? parseFloat(minExperience) : null,
      maxExperience: maxExperience ? parseFloat(maxExperience) : null,
      domain: domain || null,
    };

    const result = await recruiterAnalytics.getCandidatesForJob(
      jobId,
      filters,
      parseInt(page),
      parseInt(limit)
    );

    res.json(result);
  } catch (err) {
    logger.error('Get candidates error:', err);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
};

/**
 * Get recruiter dashboard statistics.
 */
const getDashboardStats = async (req, res) => {
  try {
    const profile = await prisma.recruiterProfile.findUnique({
      where: { userId: req.user.id },
    });
    const stats = await recruiterAnalytics.getRecruiterDashboardStats(profile.id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

/**
 * Get skill distribution for a job.
 */
const getSkillDistribution = async (req, res) => {
  const { jobId } = req.params;
  try {
    const distribution = await recruiterAnalytics.getSkillDistribution(jobId);
    res.json(distribution);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get skill distribution' });
  }
};

/**
 * Trigger job scraping from Naukri or LinkedIn.
 */
const triggerJobScrape = async (req, res) => {
  const { keyword = 'Software Engineer', location = 'India', platform } = req.body;

  // Respond immediately — scraping runs in background
  res.json({ message: `Scraping "${keyword}" in background…`, keyword, location });

  try {
    let count = 0;
    if (platform === 'linkedin') {
      count = await jobScraper.scrapeLinkedIn(keyword, location, 2);
    } else if (platform === 'remoteok') {
      count = await jobScraper.scrapeRemoteOK(keyword);
    } else {
      // Default: both sources
      count = await jobScraper.scrapeAll(keyword, location);
    }
    logger.info(`[Scrape] Completed "${keyword}": ${count} jobs ingested`);
  } catch (err) {
    logger.error('Scrape trigger error:', err);
  }
};

/**
 * Update candidate match status (shortlist / reject).
 */
const updateMatchStatus = async (req, res) => {
  const { matchId } = req.params;
  const { status } = req.body;

  const validStatuses = ['PENDING', 'REVIEWED', 'SHORTLISTED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const updated = await prisma.jobMatch.update({
      where: { id: matchId },
      data: { status },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
};

module.exports = {
  uploadBatchCVs,
  createJobPosting,
  getMyJobPostings,
  getCandidatesForJob,
  getDashboardStats,
  getSkillDistribution,
  triggerJobScrape,
  updateMatchStatus,
};
