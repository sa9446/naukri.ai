const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const {
  uploadCV,
  getMyCVs,
  getJobMatches,
  triggerMatching,
  updateCVAnalysis,
} = require('../controllers/jobSeeker.controller');
const { deleteCV } = require('../controllers/profile.controller');

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

// PUT /api/job-seeker/cv/:cvId/analysis — user edits their parsed CV profile
router.put('/cv/:cvId/analysis', updateCVAnalysis);

// DELETE /api/job-seeker/cv/:cvId
router.delete('/cv/:cvId', deleteCV);

module.exports = router;
