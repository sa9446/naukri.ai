const prisma = require('../config/database');
const logger = require('../config/logger');

/**
 * GET /api/auth/me — already handled in auth controller.
 * PUT /api/auth/profile — update job seeker or recruiter profile fields.
 */
const updateProfile = async (req, res) => {
  const { firstName, lastName, phone, location, companyName, industry } = req.body;

  try {
    if (req.user.role === 'JOB_SEEKER') {
      const profile = await prisma.jobSeekerProfile.update({
        where: { userId: req.user.id },
        data: {
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(phone !== undefined && { phone }),
          ...(location !== undefined && { location }),
        },
      });
      return res.json({ message: 'Profile updated', profile });
    }

    if (req.user.role === 'RECRUITER') {
      const profile = await prisma.recruiterProfile.update({
        where: { userId: req.user.id },
        data: {
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(companyName !== undefined && { companyName }),
          ...(industry !== undefined && { industry }),
        },
      });
      return res.json({ message: 'Profile updated', profile });
    }

    res.status(400).json({ error: 'Unknown role' });
  } catch (err) {
    logger.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

/**
 * DELETE /api/job-seeker/cv/:id — delete a CV and all related data.
 */
const deleteCV = async (req, res) => {
  const { cvId } = req.params;

  try {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user.id },
    });

    const cv = await prisma.cV.findFirst({
      where: { id: cvId, jobSeekerProfileId: profile.id },
    });
    if (!cv) return res.status(404).json({ error: 'CV not found' });

    await prisma.cV.delete({ where: { id: cvId } });
    res.json({ message: 'CV deleted successfully' });
  } catch (err) {
    logger.error('Delete CV error:', err);
    res.status(500).json({ error: 'Failed to delete CV' });
  }
};

module.exports = { updateProfile, deleteCV };
