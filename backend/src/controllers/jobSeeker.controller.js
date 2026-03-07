const prisma = require('../config/database');
const cvExtraction = require('../services/cvExtraction.service');
const aiInference = require('../services/aiInference.service');
const jobMatching = require('../services/jobMatching.service');
const jobScraper = require('../services/jobScraper.service');
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

    // Step 3: Fast rule-based parse (~1-2s) — return to user immediately
    const parsed = await aiInference.parseCVToStructured(rawText, 'rules');
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

    // Return to user immediately
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

    // Step 4: LLM enrichment + job matching in background (non-blocking)
    setImmediate(async () => {
      try {
        const rich = await aiInference.parseCVToStructured(rawText, 'hybrid');
        await prisma.candidateAnalysis.update({
          where: { cvId: cv.id },
          data: {
            fullName: rich.fullName || parsed.fullName,
            email: rich.email || parsed.email,
            phone: rich.phone || parsed.phone,
            location: rich.location || parsed.location,
            summary: rich.summary || parsed.summary,
            skills: rich.skills?.length ? rich.skills : parsed.skills,
            experience: rich.totalExperienceYears || parsed.totalExperienceYears || 0,
            experienceJson: rich.experience?.length ? rich.experience : parsed.experience,
            education: rich.education?.length ? rich.education : parsed.education,
            certifications: rich.certifications || parsed.certifications,
            languages: rich.languages || parsed.languages,
            domainExpertise: rich.domainExpertise?.length ? rich.domainExpertise : parsed.domainExpertise,
            highlights: rich.highlights?.length ? rich.highlights : parsed.highlights,
            behavioralFit: rich.behavioralFit || parsed.behavioralFit,
          },
        });
        logger.info(`CV ${cv.id} LLM enrichment complete`);
      } catch (err) {
        logger.warn(`CV ${cv.id} LLM enrichment failed (rules data kept): ${err.message}`);
      }
      // Scrape jobs based on candidate's last job title, then run matching
      const finalAnalysis = await prisma.candidateAnalysis.findUnique({ where: { cvId: cv.id } });
      const lastRole = finalAnalysis?.experienceJson?.[0]?.role;
      const location = finalAnalysis?.location || 'India';
      if (lastRole) {
        logger.info(`CV ${cv.id}: scraping jobs for last role "${lastRole}"`);
        await jobScraper.scrapeFromSearch(lastRole, location).catch((err) =>
          logger.warn(`CV ${cv.id} job scrape failed: ${err.message}`)
        );
      }
      jobMatching.matchCVToJobs(cv.id).catch((err) =>
        logger.error(`Background matching failed for CV ${cv.id}:`, err)
      );
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
            domain: true,
            description: true,
            experienceMin: true,
            experienceMax: true,
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
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
};

/**
 * Update the parsed CV analysis (user corrections after AI parsing).
 * Allows editing: name, skills, experience, summary, location, education, etc.
 * Re-runs job matching after save.
 */
const updateCVAnalysis = async (req, res) => {
  const { cvId } = req.params;
  const {
    fullName, email, phone, location, summary,
    skills, experience, experienceJson, education,
    certifications, languages, domainExpertise,
  } = req.body;

  try {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user.id },
    });
    const cv = await prisma.cV.findFirst({
      where: { id: cvId, jobSeekerProfileId: profile.id },
      include: { candidateAnalysis: true },
    });
    if (!cv) return res.status(404).json({ error: 'CV not found' });
    if (!cv.candidateAnalysis) return res.status(404).json({ error: 'CV analysis not found' });

    // Build update payload — only include fields that were sent
    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;
    if (summary !== undefined) updateData.summary = summary;
    if (skills !== undefined) updateData.skills = Array.isArray(skills) ? skills : [skills];
    if (experience !== undefined) updateData.experience = parseFloat(experience) || 0;
    if (experienceJson !== undefined) updateData.experienceJson = experienceJson;
    if (education !== undefined) updateData.education = education;
    if (certifications !== undefined) updateData.certifications = Array.isArray(certifications) ? certifications : [];
    if (languages !== undefined) updateData.languages = Array.isArray(languages) ? languages : [];
    if (domainExpertise !== undefined) updateData.domainExpertise = Array.isArray(domainExpertise) ? domainExpertise : [];

    const updated = await prisma.candidateAnalysis.update({
      where: { cvId },
      data: updateData,
    });

    // Re-run job matching in background with updated profile
    jobMatching.matchCVToJobs(cvId).catch((err) =>
      logger.error(`Re-matching after edit failed for CV ${cvId}:`, err)
    );

    res.json({ message: 'CV profile updated. Job matching re-running in background.', analysis: updated });
  } catch (err) {
    logger.error('Update CV analysis error:', err);
    res.status(500).json({ error: err.message || 'Update failed' });
  }
};

module.exports = { uploadCV, getMyCVs, getJobMatches, triggerMatching, updateCVAnalysis };
