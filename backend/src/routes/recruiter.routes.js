const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const {
  uploadBatchCVs,
  createJobPosting,
  getMyJobPostings,
  getCandidatesForJob,
  getDashboardStats,
  getSkillDistribution,
  triggerJobScrape,
  updateMatchStatus,
} = require('../controllers/recruiter.controller');

// All routes require RECRUITER role
router.use(authenticate, requireRole('RECRUITER'));

// POST /api/recruiter/cv/batch  — upload multiple CVs
router.post('/cv/batch', uploadMultiple, uploadBatchCVs);

// POST /api/recruiter/jobs  — create job posting
router.post('/jobs', createJobPosting);

// GET /api/recruiter/jobs  — list my job postings
router.get('/jobs', getMyJobPostings);

// GET /api/recruiter/jobs/:jobId/candidates?skills=&minExperience=&maxExperience=&domain=
router.get('/jobs/:jobId/candidates', getCandidatesForJob);

// GET /api/recruiter/jobs/:jobId/skills
router.get('/jobs/:jobId/skills', getSkillDistribution);

// GET /api/recruiter/dashboard
router.get('/dashboard', getDashboardStats);

// POST /api/recruiter/scrape
router.post('/scrape', triggerJobScrape);

// PATCH /api/recruiter/matches/:matchId/status
router.patch('/matches/:matchId/status', updateMatchStatus);

module.exports = router;
