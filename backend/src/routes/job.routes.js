const router = require('express').Router();
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');

// GET /api/jobs — public list of active jobs (with pagination + filters)
router.get('/', async (req, res) => {
  const {
    keyword,
    location,
    skills,
    minExp,
    maxExp,
    source,
    page = 1,
    limit = 20,
  } = req.query;

  const where = { isActive: true };

  if (keyword) {
    where.OR = [
      { title: { contains: keyword, mode: 'insensitive' } },
      { description: { contains: keyword, mode: 'insensitive' } },
      { company: { contains: keyword, mode: 'insensitive' } },
    ];
  }
  if (location) where.location = { contains: location, mode: 'insensitive' };
  if (source) where.source = source.toUpperCase();
  if (minExp) where.experienceMin = { lte: parseFloat(minExp) };
  if (maxExp) where.experienceMax = { gte: parseFloat(maxExp) };
  if (skills) {
    where.requiredSkills = {
      hasSome: skills.split(',').map((s) => s.trim()),
    };
  }

  try {
    const [jobs, total] = await Promise.all([
      prisma.jobPosting.findMany({
        where,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: { postedAt: 'desc' },
        select: {
          id: true,
          title: true,
          company: true,
          location: true,
          salary: true,
          jobType: true,
          requiredSkills: true,
          experienceMin: true,
          experienceMax: true,
          source: true,
          sourceUrl: true,
          postedAt: true,
        },
      }),
      prisma.jobPosting.count({ where }),
    ]);

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      jobs,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /api/jobs/:id — single job detail
router.get('/:id', authenticate, async (req, res) => {
  try {
    const job = await prisma.jobPosting.findUnique({
      where: { id: req.params.id },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

module.exports = router;
