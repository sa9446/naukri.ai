/**
 * JOB SCRAPER SERVICE
 *
 * Sources (verified working):
 *   1. LinkedIn  — guest public search API (returns Indian + global jobs)
 *   2. RemoteOK  — fully open JSON API, no key needed
 *
 * Auto-scheduling:
 *   - Runs on startup if jobs table is empty
 *   - Cron: every 6 hours across a set of default keywords
 */

const axios = require('axios');
const cheerio = require('cheerio');
const prisma = require('../config/database');
const logger = require('../config/logger');

const DELAY_MS = parseInt(process.env.SCRAPER_DELAY_MS || '1500', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Default keywords to seed the jobs DB (covers most tech roles)
const DEFAULT_KEYWORDS = [
  'React Developer', 'Node.js Developer', 'Python Developer',
  'Full Stack Developer', 'Data Engineer', 'DevOps Engineer',
  'Machine Learning Engineer', 'Backend Developer', 'Frontend Developer',
  'Software Engineer',
];

const LINKEDIN_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
};

class JobScraperService {
  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Scrape LinkedIn public job listings.
   * Uses the unauthenticated guest API — no login required.
   * Returns up to 25 jobs per page (offset 0, 25, 50 …).
   */
  async scrapeLinkedIn(keyword, location = 'India', maxPages = 2) {
    logger.info(`[LinkedIn] Scraping "${keyword}" in "${location}"`);
    let ingested = 0;

    for (let page = 0; page < maxPages; page++) {
      const start = page * 25;
      try {
        const url = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
        const resp = await axios.get(url, {
          params: { keywords: keyword, location, start },
          headers: LINKEDIN_HEADERS,
          timeout: 15000,
        });

        const jobs = this._parseLinkedInHTML(resp.data, keyword);
        logger.debug(`[LinkedIn] Page ${page + 1}: parsed ${jobs.length} jobs`);

        for (const job of jobs) {
          await this._upsertJob(job, 'LINKEDIN');
          ingested++;
        }

        if (jobs.length < 25) break; // last page
        await sleep(DELAY_MS);
      } catch (err) {
        logger.warn(`[LinkedIn] Error page ${page + 1}: ${err.response?.status || err.message}`);
        break;
      }
    }

    logger.info(`[LinkedIn] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape RemoteOK — fully open API, no auth.
   * Optionally filter by tag (maps to keyword).
   */
  async scrapeRemoteOK(keyword = '') {
    logger.info(`[RemoteOK] Scraping tag: "${keyword || 'all'}"`);
    let ingested = 0;

    try {
      const tag = keyword
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const url = tag ? `https://remoteok.com/api?tags=${encodeURIComponent(tag)}` : 'https://remoteok.com/api';

      const resp = await axios.get(url, {
        headers: { 'User-Agent': 'NaukriAI Job Aggregator', Accept: 'application/json' },
        timeout: 15000,
      });

      const jobs = resp.data.filter((j) => j.position && j.company);
      logger.debug(`[RemoteOK] Received ${jobs.length} jobs`);

      for (const job of jobs) {
        await this._upsertJob(this._normalizeRemoteOK(job), 'MANUAL');
        ingested++;
      }
    } catch (err) {
      logger.warn(`[RemoteOK] Error: ${err.message}`);
    }

    logger.info(`[RemoteOK] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape both sources for a keyword.
   * Called by POST /api/recruiter/scrape and by the cron job.
   */
  async scrapeAll(keyword, location = 'India') {
    const [li, ro] = await Promise.all([
      this.scrapeLinkedIn(keyword, location, 2),
      this.scrapeRemoteOK(keyword),
    ]);
    return li + ro;
  }

  /**
   * Seed the database with jobs for all default keywords.
   * Runs on startup if the jobs table is empty.
   */
  async seedIfEmpty() {
    const count = await prisma.jobPosting.count();
    if (count > 0) {
      logger.info(`[Scraper] ${count} jobs already in DB — skipping seed`);
      return;
    }

    logger.info('[Scraper] DB is empty — seeding jobs for default keywords…');
    for (const kw of DEFAULT_KEYWORDS) {
      await this.scrapeAll(kw, 'India');
      await sleep(DELAY_MS * 2);
    }
    const total = await prisma.jobPosting.count();
    logger.info(`[Scraper] Seed complete — ${total} jobs in DB`);
  }

  /**
   * Manually ingest a job posting (from recruiter form).
   */
  async ingestManualJob(jobData, recruiterProfileId = null) {
    return prisma.jobPosting.create({
      data: {
        recruiterProfileId,
        title: jobData.title,
        company: jobData.company,
        description: jobData.description,
        requiredSkills: jobData.requiredSkills || [],
        experienceMin: jobData.experienceMin || 0,
        experienceMax: jobData.experienceMax || 99,
        location: jobData.location,
        salary: jobData.salary,
        jobType: jobData.jobType,
        domain: jobData.domain,
        source: 'MANUAL',
      },
    });
  }

  // ─── Parsers ─────────────────────────────────────────────────────────────

  _parseLinkedInHTML(html, keyword) {
    const $ = cheerio.load(html);
    const jobs = [];

    $('li').each((_, el) => {
      try {
        const title = $(el).find('.base-search-card__title').text().trim();
        const company = $(el).find('.base-search-card__subtitle').text().trim();
        const location = $(el).find('.job-search-card__location').text().trim();
        const postedAt = $(el).find('time').attr('datetime');
        const sourceUrl = $(el).find('a.base-card__full-link').attr('href')?.split('?')[0];
        const sourceId = sourceUrl?.match(/view\/(\d+)/)?.[1]
          || sourceUrl?.match(/-(\d+)\/?$/)?.[1];

        if (!title || !company) return;

        jobs.push({
          title,
          company,
          description: `${title} at ${company}${location ? ` — ${location}` : ''}`,
          location: location || 'India',
          sourceId: sourceId || `li-${Date.now()}-${Math.random()}`,
          sourceUrl: sourceUrl || null,
          requiredSkills: this._extractSkillsFromText(`${title} ${keyword}`),
          experienceRange: this._guessExperienceFromTitle(title),
          domain: this._guessDomainFromTitle(title),
          postedAt: postedAt ? new Date(postedAt) : new Date(),
        });
      } catch {
        // skip malformed card
      }
    });

    return jobs;
  }

  _normalizeRemoteOK(job) {
    const tags = (job.tags || []).map((t) => this._capitalizeSkill(t));
    const salary = job.salary_min && job.salary_max
      ? `$${Math.round(job.salary_min / 1000)}k–$${Math.round(job.salary_max / 1000)}k`
      : job.salary || null;

    // Strip HTML from description
    const desc = job.description
      ? cheerio.load(job.description).text().replace(/\s+/g, ' ').trim().slice(0, 500)
      : `${job.position} at ${job.company}`;

    return {
      title: job.position,
      company: job.company,
      description: desc,
      location: job.location || 'Remote',
      sourceId: String(job.id || job.slug),
      sourceUrl: job.apply_url || job.url || null,
      requiredSkills: tags.slice(0, 12),
      experienceRange: this._guessExperienceFromTitle(job.position),
      domain: this._guessDomainFromTitle(job.position),
      salary,
      jobType: 'REMOTE',
      postedAt: job.date ? new Date(job.date) : new Date(),
    };
  }

  // ─── DB Write ─────────────────────────────────────────────────────────────

  async _upsertJob(jobData, source) {
    const { experienceRange, postedAt, ...rest } = jobData;
    try {
      await prisma.jobPosting.upsert({
        where: {
          source_sourceId: {
            source,
            sourceId: String(jobData.sourceId || `${source}-${Date.now()}-${Math.random()}`),
          },
        },
        update: { isActive: true },
        create: {
          ...rest,
          source,
          sourceId: String(jobData.sourceId),
          experienceMin: experienceRange?.min ?? 0,
          experienceMax: experienceRange?.max ?? 10,
          isActive: true,
          postedAt: postedAt || new Date(),
        },
      });
    } catch (err) {
      logger.debug(`[Scraper] Upsert skipped (${jobData.title}): ${err.message}`);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _extractSkillsFromText(text) {
    const SKILLS = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#', 'PHP', 'Ruby', 'Swift', 'Kotlin',
      'React', 'Vue', 'Angular', 'Next.js', 'Nuxt', 'Svelte',
      'Node.js', 'Express', 'NestJS', 'Django', 'FastAPI', 'Flask', 'Spring', 'Laravel', 'Rails',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Cassandra', 'DynamoDB',
      'GraphQL', 'REST', 'gRPC', 'WebSockets',
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'CI/CD',
      'Machine Learning', 'Deep Learning', 'NLP', 'PyTorch', 'TensorFlow', 'Scikit-learn',
      'Data Science', 'Spark', 'Kafka', 'Airflow', 'dbt', 'SQL', 'Tableau', 'Power BI',
      'React Native', 'Flutter', 'iOS', 'Android',
      'Microservices', 'System Design', 'DevOps', 'Agile', 'Scrum', 'TDD',
    ];
    const lower = text.toLowerCase();
    return SKILLS.filter((s) => lower.includes(s.toLowerCase()));
  }

  _capitalizeSkill(tag) {
    const MAP = {
      javascript: 'JavaScript', typescript: 'TypeScript', nodejs: 'Node.js',
      'node.js': 'Node.js', python: 'Python', react: 'React', vue: 'Vue',
      angular: 'Angular', golang: 'Go', 'c++': 'C++', aws: 'AWS',
      gcp: 'GCP', css: 'CSS', html: 'HTML', sql: 'SQL', api: 'REST',
      devops: 'DevOps', kubernetes: 'Kubernetes', docker: 'Docker',
      postgresql: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB',
      redis: 'Redis', graphql: 'GraphQL',
    };
    return MAP[tag.toLowerCase()] || tag.charAt(0).toUpperCase() + tag.slice(1);
  }

  _guessExperienceFromTitle(title) {
    const t = title.toLowerCase();
    if (t.includes('junior') || t.includes('entry') || t.includes('fresher') || t.includes('intern')) return { min: 0, max: 2 };
    if (t.includes('senior') || t.includes('sr.') || t.includes('lead') || t.includes('principal')) return { min: 5, max: 12 };
    if (t.includes('staff') || t.includes('architect') || t.includes('vp') || t.includes('director')) return { min: 8, max: 20 };
    if (t.includes('manager')) return { min: 4, max: 10 };
    return { min: 2, max: 6 }; // mid-level default
  }

  _guessDomainFromTitle(title) {
    const t = title.toLowerCase();
    if (t.match(/data|analytics|bi|warehouse|etl|spark/)) return 'Data Engineering';
    if (t.match(/ml|machine learning|ai|nlp|deep learning/)) return 'AI/ML';
    if (t.match(/devops|cloud|infra|platform|sre|reliability/)) return 'Cloud/DevOps';
    if (t.match(/mobile|ios|android|flutter|react native/)) return 'Mobile';
    if (t.match(/frontend|front-end|ui|ux/)) return 'Frontend';
    if (t.match(/backend|back-end|api|microservice/)) return 'Backend';
    if (t.match(/security|cyber|penetration/)) return 'Security';
    if (t.match(/blockchain|web3|solidity/)) return 'Blockchain';
    return 'SaaS';
  }
}

module.exports = new JobScraperService();
