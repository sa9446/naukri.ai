const router = require('express').Router();
const { body } = require('express-validator');
const { register, login, me } = require('../controllers/auth.controller');
const { updateProfile } = require('../controllers/profile.controller');
const { authenticate } = require('../middleware/auth');

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['JOB_SEEKER', 'RECRUITER']).withMessage('Role must be JOB_SEEKER or RECRUITER'),
  ],
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  login
);

router.get('/me', authenticate, me);
router.put('/profile', authenticate, updateProfile);

module.exports = router;
