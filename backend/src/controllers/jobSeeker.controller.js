const prisma = require('../config/database');
const cvExtraction = require('../services/cvExtraction.service');
const aiInference = require('../services/aiInference.service');
const jobMatching = require('../services/jobMatching.service');
const logger = require('../config/logger');

/**
 * Upload and process a CV:
 * 1. Extract raw text from file
 * 2. Send to LLM for structured parsing
 * 3. Store in DB
 * 4. Run job matching
 */
const uploadCV = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!profile) return res.status(404).json({ error: 'Job seeker profile not found' });

    // Step 1: Extract text from file
    const rawText = await cvExtraction.extractText(req.file.path, req.file.mimetype);

    // Step 2: Store CV record
    const cv = await prisma.cV.create({
      data: {
        jobSeekerProfileId: profile.id,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        rawText,
      },
    });

    // Step 3: AI parsing via external API call
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

    // Cleanup uploaded file
    cvExtraction.cleanupFile(req.file.path);

    // Step 4: Run job matching asynchronously (don't block response)
    jobMatching.matchCVToJobs(cv.id).catch((err) =>
      logger.error(`Background matching failed for CV ${cv.id}:`, err)
    );

    res.status(201).json({
      message: 'CV uploaded and processing started',
      cvId: cv.id,
      parsedProfile: {
        fullName: parsed.fullName,
        skills: parsed.skills,
        experience: parsed.totalExperienceYears,
        domainExpertise: parsed.domainExpertise,
        highlights: parsed.highlights || [],
      },
    });
  } catch (err) {
    logger.error('CV upload error:', err);
    cvExtraction.cleanupFile(req.file?.path);
    res.status(500).json({ error: err.message || 'CV processing failed' });
  }
};

/**
 * Get all CVs for the current job seeker.
 */
const getMyCVs = async (req, res) => {
  try {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user.id },
    });

    const cvs = await prisma.cV.findMany({
      where: { jobSeekerProfileId: profile.id },
      include: {
        candidateAnalysis: {
          select: {
            fullName: true,
            skills: true,
            experience: true,
            domainExpertise: true,
            highlights: true,
          },
        },
        _count: { select: { jobMatches: true } },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json(cvs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch CVs' });
  }
};

/**
 * Get job matches for a CV (only >= 80% matches).
 */
const getJobMatches = async (req, res) => {
  const { cvId } = req.params;

  try {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user.id },
    });

    // Verify ownership
    const cv = await prisma.cV.findFirst({
      where: { id: cvId, jobSeekerProfileId: profile.id },
    });
    if (!cv) return res.status(404).json({ error: 'CV not found' });

    const matches = await prisma.jobMatch.findMany({
      where: { cvId },
      orderBy: { matchScore: 'desc' },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            company: true,
            location: true,
            salary: true,
            jobType: true,
            requiredSkills: true,
            source: true,
            sourceUrl: true,
            postedAt: true,
          },
        },
        cv: {
          select: {
            candidateAnalysis: { select: { highlights: true } },
          },
        },
      },
    });

    const formatted = matches.map((m) => ({
      matchId: m.id,
      matchScore: Math.round(m.matchScore * 100),
      skillsScore: Math.round(m.skillsScore * 100),
      experienceScore: Math.round(m.experienceScore * 100),
      domainScore: Math.round(m.domainScore * 100),
      behavioralScore: Math.round(m.behavioralScore * 100),
      matchReasons: m.matchReasons,
      status: m.status,
      highlights: m.cv?.candidateAnalysis?.highlights || [],
      job: m.job,
    }));

    res.json({ cvId, total: formatted.length, matches: formatted });
  } catch (err) {
    logger.error('Get job matches error:', err);
    res.status(500).json({ error: 'Failed to fetch job matches' });
  }
};

/**
 * Trigger a fresh match run for a CV.
 */
const triggerMatching = async (req, res) => {
  const { cvId } = req.params;

  try {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user.id },
    });
    const cv = await prisma.cV.findFirst({
      where: { id: cvId, jobSeekerProfileId: profile.id },
    });
    if (!cv) return res.status(404).json({ error: 'CV not found' });

    const matches = await jobMatching.matchCVToJobs(cvId);
    res.json({ message: `Matching complete. Found ${matches.length} matches.`, count: matches.length });
  } catch (err) {
    logger.error('Trigger matching error:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { uploadCV, getMyCVs, getJobMatches, triggerMatching };
