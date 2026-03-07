require('dotenv').config();

// ─── Startup Validation ────────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[FATAL] Missing required env vars: ${missing.join(', ')}`);
  console.error('Copy backend/.env.example to backend/.env and fill in values.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const logger = require('./config/logger');

const cron = require('node-cron');
const authRoutes = require('./routes/auth.routes');
const jobSeekerRoutes = require('./routes/jobSeeker.routes');
const recruiterRoutes = require('./routes/recruiter.routes');
const jobRoutes = require('./routes/job.routes');
const jobScraper = require('./services/jobScraper.service');

const app = express();

// ─── Security & Middleware ─────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
}));

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/job-seeker', jobSeekerRoutes);
app.use('/api/recruiter', recruiterRoutes);
app.use('/api/jobs', jobRoutes);

// ─── Health Check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large. Max ${process.env.MAX_FILE_SIZE_MB}MB allowed.` });
  }

  if (err.message && err.message.includes('Only PDF and DOCX')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);

  // Seed jobs on first startup if DB is empty
  jobScraper.seedIfEmpty().catch((err) =>
    logger.error('Startup job seed failed:', err)
  );

  // Refresh jobs every 6 hours — rotate through keyword batches
  const CRON_KEYWORDS = [
    ['React Developer', 'Node.js Developer', 'Python Developer'],
    ['Full Stack Developer', 'Data Engineer', 'DevOps Engineer'],
    ['Machine Learning Engineer', 'Backend Developer', 'Frontend Developer'],
  ];
  let cronBatch = 0;
  cron.schedule('0 */6 * * *', async () => {
    const batch = CRON_KEYWORDS[cronBatch % CRON_KEYWORDS.length];
    cronBatch++;
    logger.info(`[Cron] Refreshing jobs — batch: ${batch.join(', ')}`);
    for (const kw of batch) {
      try {
        await jobScraper.scrapeAll(kw, 'India');
      } catch (err) {
        logger.error(`[Cron] scrapeAll failed for "${kw}":`, err.message);
      }
    }
  });
  logger.info('[Cron] Job refresh scheduled every 6 hours');

  // Delete expired scraped jobs daily at 2am
  cron.schedule('0 2 * * *', async () => {
    try {
      await jobScraper.deleteExpiredJobs();
    } catch (err) {
      logger.error('[Cron] Expired job cleanup failed:', err.message);
    }
  });
  logger.info('[Cron] Expired job cleanup scheduled daily at 2am');
});

module.exports = app;
