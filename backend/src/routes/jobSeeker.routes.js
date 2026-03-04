const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const {
  uploadCV,
  getMyCVs,
  getJobMatches,
  triggerMatching,
} = require('../controllers/jobSeeker.controller');

// All routes require JOB_SEEKER role
router.use(authenticate, requireRole('JOB_SEEKER'));

// POST /api/job-seeker/cv/upload
router.post('/cv/upload', uploadSingle, uploadCV);

// GET /api/job-seeker/cv
router.get('/cv', getMyCVs);

// GET /api/job-seeker/cv/:cvId/matches
router.get('/cv/:cvId/matches', getJobMatches);

// POST /api/job-seeker/cv/:cvId/match
router.post('/cv/:cvId/match', triggerMatching);

module.exports = router;
