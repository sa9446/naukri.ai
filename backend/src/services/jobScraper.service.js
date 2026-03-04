/**
 * JOB SCRAPER SERVICE
 * Scrapes job listings from Naukri and LinkedIn.
 *
 * LEGAL NOTE: Web scraping must comply with each platform's Terms of Service.
 * This code is for educational/authorized use only. For production use, prefer
 * official APIs (LinkedIn Jobs API, Naukri Partner API) or authorized data feeds.
 *
 * Rate limiting and respectful crawling delays are implemented.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const prisma = require('../config/database');
const logger = require('../config/logger');

const DELAY_MS = parseInt(process.env.SCRAPER_DELAY_MS || '2000', 10);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Common browser-like headers to avoid bot detection
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  Connection: 'keep-alive',
};

class JobScraperService {
  /**
   * Scrape jobs from Naukri.com public search results.
   * Uses cheerio for HTML parsing.
   * @param {string} keyword - Job title or skill to search
   * @param {string} [location] - City or region
   * @param {number} [maxPages=2]
   * @returns {Promise<number>} - Number of jobs ingested
   */
  async scrapeNaukri(keyword, location = '', maxPages = 2) {
    logger.info(`Scraping Naukri for: "${keyword}" in "${location}"`);
    let ingested = 0;

    for (let page = 1; page <= maxPages; page++) {
      try {
        const url = this._buildNaukriURL(keyword, location, page);
        logger.debug(`Fetching Naukri page ${page}: ${url}`);

        const response = await axios.get(url, {
          headers: HEADERS,
          timeout: 15000,
        });

        const jobs = this._parseNaukriHTML(response.data, keyword);
        logger.debug(`Parsed ${jobs.length} jobs from Naukri page ${page}`);

        for (const job of jobs) {
          await this._upsertJob(job, 'NAUKRI');
          ingested++;
        }

        await sleep(DELAY_MS);
      } catch (err) {
        logger.error(`Naukri scrape error (page ${page}):`, err.message);
        break;
      }
    }

    logger.info(`Naukri scrape complete. Ingested ${ingested} jobs.`);
    return ingested;
  }

  /**
   * Scrape jobs from LinkedIn public job search.
   * @param {string} keyword
   * @param {string} [location]
   * @param {number} [maxPages=2]
   * @returns {Promise<number>}
   */
  async scrapeLinkedIn(keyword, location = '', maxPages = 2) {
    logger.info(`Scraping LinkedIn for: "${keyword}" in "${location}"`);
    let ingested = 0;

    for (let start = 0; start < maxPages * 25; start += 25) {
      try {
        const url = this._buildLinkedInURL(keyword, location, start);
        logger.debug(`Fetching LinkedIn offset ${start}: ${url}`);

        const response = await axios.get(url, {
          headers: HEADERS,
          timeout: 15000,
        });

        const jobs = this._parseLinkedInHTML(response.data);
        logger.debug(`Parsed ${jobs.length} jobs from LinkedIn`);

        for (const job of jobs) {
          await this._upsertJob(job, 'LINKEDIN');
          ingested++;
        }

        await sleep(DELAY_MS);
      } catch (err) {
        logger.error(`LinkedIn scrape error (offset ${start}):`, err.message);
        break;
      }
    }

    logger.info(`LinkedIn scrape complete. Ingested ${ingested} jobs.`);
    return ingested;
  }

  /**
   * Manually ingest a job posting (from API input or form submission).
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

  // ─── HTML Parsers ──────────────────────────────────────────────────────────

  _parseNaukriHTML(html, keyword) {
    const $ = cheerio.load(html);
    const jobs = [];

    // Naukri job card selectors (may change with site updates)
    $('article.jobTuple, .cust-job-tuple, [data-job-id]').each((_, el) => {
      try {
        const title = $(el).find('.title, .desig, [class*="title"]').first().text().trim();
        const company = $(el).find('.companyInfo strong, .comp-name, [class*="company"]').first().text().trim();
        const location = $(el).find('.location, .loc, [class*="location"]').first().text().trim();
        const experience = $(el).find('.experience, .exp, [class*="exp"]').first().text().trim();
        const salary = $(el).find('.salary, .sal, [class*="salary"]').first().text().trim();
        const description = $(el).find('.job-description, .desc, [class*="desc"]').first().text().trim();
        const sourceId = $(el).attr('data-job-id') || $(el).attr('id');
        const linkEl = $(el).find('a[href*="/job-listings"]').first();
        const sourceUrl = linkEl.attr('href')
          ? `https://www.naukri.com${linkEl.attr('href')}`
          : null;

        if (title && company) {
          jobs.push({
            title,
            company,
            description: description || `${title} at ${company}`,
            location,
            salary,
            sourceId,
            sourceUrl,
            requiredSkills: this._extractSkillsFromText(`${title} ${description}`),
            experienceRange: this._parseExperienceString(experience),
            domain: keyword,
          });
        }
      } catch (e) {
        // Skip malformed entries
      }
    });

    return jobs;
  }

  _parseLinkedInHTML(html) {
    const $ = cheerio.load(html);
    const jobs = [];

    // LinkedIn public job search selectors
    $('li.jobs-search__results-list > div, .base-card').each((_, el) => {
      try {
        const title = $(el).find('.base-search-card__title, .job-result-card__title').text().trim();
        const company = $(el)
          .find('.base-search-card__subtitle, .job-result-card__subtitle')
          .text()
          .trim();
        const location = $(el)
          .find('.job-search-card__location, .job-result-card__location')
          .text()
          .trim();
        const sourceUrl = $(el).find('a.base-card__full-link, a.result-card__full-card-link').attr('href');
        const sourceId = sourceUrl ? sourceUrl.match(/view\/(\d+)/)?.[1] : null;

        if (title && company) {
          jobs.push({
            title,
            company,
            description: `${title} at ${company} - ${location}`,
            location,
            sourceId,
            sourceUrl,
            requiredSkills: this._extractSkillsFromText(title),
            experienceRange: { min: 0, max: 10 },
            domain: null,
          });
        }
      } catch (e) {
        // Skip
      }
    });

    return jobs;
  }

  // ─── URL Builders ──────────────────────────────────────────────────────────

  _buildNaukriURL(keyword, location, page) {
    const k = encodeURIComponent(keyword);
    const l = location ? encodeURIComponent(location) : '';
    const slug = [keyword.toLowerCase().replace(/\s+/g, '-'), l, page > 1 ? page : '']
      .filter(Boolean)
      .join('-');
    return `https://www.naukri.com/${slug}-jobs${l ? `-in-${l}` : ''}?k=${k}&l=${l}&pg=${page}`;
  }

  _buildLinkedInURL(keyword, location, start) {
    const params = new URLSearchParams({
      keywords: keyword,
      location,
      start: start.toString(),
      f_TPR: 'r86400', // posted in last 24h
    });
    return `https://www.linkedin.com/jobs/search/?${params}`;
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  async _upsertJob(jobData, source) {
    const { experienceRange, ...rest } = jobData;
    try {
      await prisma.jobPosting.upsert({
        where: {
          source_sourceId: {
            source,
            sourceId: jobData.sourceId || `${source}-${Date.now()}-${Math.random()}`,
          },
        },
        update: {
          isActive: true,
        },
        create: {
          ...rest,
          source,
          experienceMin: experienceRange?.min || 0,
          experienceMax: experienceRange?.max || 10,
          isActive: true,
        },
      });
    } catch (err) {
      logger.warn(`Job upsert failed (${jobData.title}):`, err.message);
    }
  }

  _extractSkillsFromText(text) {
    const commonSkills = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Ruby',
      'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Next.js', 'Django', 'FastAPI', 'Spring',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'GraphQL', 'REST', 'gRPC',
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Git',
      'Machine Learning', 'AI', 'NLP', 'Data Science', 'SQL', 'Tableau', 'Power BI',
      'Agile', 'Scrum', 'DevOps', 'Microservices', 'TDD', 'System Design',
    ];

    const textLower = text.toLowerCase();
    return commonSkills.filter((skill) => textLower.includes(skill.toLowerCase()));
  }

  _parseExperienceString(expStr) {
    if (!expStr) return { min: 0, max: 10 };
    const nums = expStr.match(/\d+/g)?.map(Number) || [];
    if (nums.length >= 2) return { min: nums[0], max: nums[1] };
    if (nums.length === 1) return { min: nums[0], max: nums[0] + 3 };
    return { min: 0, max: 10 };
  }
}

module.exports = new JobScraperService();
