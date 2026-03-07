/**
 * JOB SCRAPER SERVICE
 *
 * Sources:
 *   1. NaukriGulf — Gulf's largest job board (Puppeteer)
 *   2. Indeed     — Global job board (axios + cheerio)
 *   3. Halian     — IT staffing / recruitment firm (Puppeteer)
 *   4. Discovered — UAE talent platform (axios + cheerio)
 *   5. ADNOC      — Abu Dhabi National Oil Company careers (Puppeteer)
 *   6. LinkedIn   — guest public search API (fallback)
 *   7. RemoteOK   — open JSON API (fallback)
 *   8. Naukri     — Indian job board (Puppeteer)
 *
 * All scraped jobs expire after 10 days (cleaned by daily cron in app.js).
 */

const axios = require('axios');
const cheerio = require('cheerio');
const prisma = require('../config/database');
const logger = require('../config/logger');

const concurrentMap = async (arr, concurrency, fn) => {
  const results = [];
  for (let i = 0; i < arr.length; i += concurrency) {
    const batch = arr.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
};

const DELAY_MS = parseInt(process.env.SCRAPER_DELAY_MS || '1500', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

const DEFAULT_KEYWORDS = [
  'Software Engineer', 'Full Stack Developer', 'Data Engineer', 'DevOps Engineer',
  'Business Analyst', 'Project Manager', 'IT Consultant', 'Service Delivery Manager',
  'Finance Manager', 'SAP Consultant', 'Oracle Consultant', 'Cloud Architect',
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
};

class JobScraperService {
  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * User-triggered search scrape across all 5 primary sources.
   * All results stored with expiresAt = now + 10 days.
   */
  async scrapeFromSearch(keyword, location = 'UAE') {
    logger.info(`[Search] User-triggered scrape: "${keyword}" in "${location}"`);
    const results = await Promise.allSettled([
      this.scrapeNaukriGulf(keyword, location),
      this.scrapeIndeed(keyword, location),
      this.scrapeHalian(keyword),
      this.scrapeDiscovered(keyword),
      this.scrapeADNOC(keyword),
    ]);
    const total = results.reduce((sum, r) => sum + (r.value || 0), 0);
    logger.info(`[Search] Done — ${total} jobs saved across all sources`);
    return total;
  }

  // ─── Primary Sources ──────────────────────────────────────────────────────

  /**
   * Scrape NaukriGulf.com — Gulf's largest job board.
   * URL: https://www.naukrigulf.com/{keyword}-jobs-in-{location}
   */
  async scrapeNaukriGulf(keyword, location = 'UAE') {
    logger.info(`[NaukriGulf] Scraping "${keyword}" in "${location}"`);
    let puppeteer;
    try {
      puppeteer = require('puppeteer-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      puppeteer.use(StealthPlugin());
    } catch {
      logger.warn('[NaukriGulf] Puppeteer not available');
      return 0;
    }

    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const url = `https://www.naukrigulf.com/${slug(keyword)}-jobs-in-${slug(location)}`;
    let browser;
    let ingested = 0;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        timeout: 30000,
      });
      const page = await browser.newPage();
      await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('.ng-job-listing, .job-listing, [class*="job-tuple"]', { timeout: 10000 }).catch(() => {});

      const jobs = await page.evaluate(() => {
        const cards = document.querySelectorAll('.ng-job-listing, .job-listing, article[class*="job"], li[class*="job"]');
        return Array.from(cards).slice(0, 30).map(el => {
          const title = el.querySelector('a[class*="title"], .jobtitle, h2, [class*="designation"]')?.textContent?.trim();
          const company = el.querySelector('[class*="company"], [class*="employer"], .comp-name')?.textContent?.trim();
          const loc = el.querySelector('[class*="location"], [class*="city"]')?.textContent?.trim();
          const salary = el.querySelector('[class*="salary"], [class*="stipend"]')?.textContent?.trim();
          const exp = el.querySelector('[class*="exp"], [class*="experience"]')?.textContent?.trim();
          const desc = el.querySelector('[class*="desc"], [class*="snippet"]')?.textContent?.trim();
          const href = el.querySelector('a[href]')?.href;
          return { title, company, loc, salary, exp, desc, href };
        }).filter(j => j.title && j.company);
      });

      logger.debug(`[NaukriGulf] Found ${jobs.length} job cards`);
      for (const job of jobs) {
        const sourceId = job.href?.match(/(\d+)(?:\?|$)/)?.[1]
          || `naukrigulf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await this._upsertJob({
          title: job.title,
          company: job.company,
          description: (job.desc || `${job.title} at ${job.company}`).slice(0, 1000),
          location: job.loc || location,
          salary: job.salary || null,
          sourceId,
          sourceUrl: job.href || url,
          requiredSkills: this._extractSkillsFromText(`${job.title} ${keyword} ${job.desc || ''}`),
          experienceRange: this._parseExperienceText(job.exp) || this._guessExperienceFromTitle(job.title),
          domain: this._guessDomainFromTitle(job.title),
          postedAt: new Date(),
        }, 'NAUKRIGULF');
        ingested++;
      }
    } catch (err) {
      logger.warn(`[NaukriGulf] Scrape failed: ${err.message}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    logger.info(`[NaukriGulf] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape Indeed.com job listings via axios + cheerio.
   */
  async scrapeIndeed(keyword, location = 'UAE') {
    logger.info(`[Indeed] Scraping "${keyword}" in "${location}"`);
    let ingested = 0;
    try {
      const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}&sort=date`;
      const resp = await axios.get(url, {
        headers: {
          ...BROWSER_HEADERS,
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.indeed.com/',
        },
        timeout: 20000,
      });
      const $ = cheerio.load(resp.data);

      const jobs = [];
      // Indeed card selectors (various versions)
      $('[data-jk], .job_seen_beacon, .tapItem').each((_, el) => {
        const jk = $(el).attr('data-jk') || $(el).find('[data-jk]').attr('data-jk');
        const title = $(el).find('[class*="jobTitle"] span, h2.jobTitle span').first().text().trim()
          || $(el).find('h2').first().text().trim();
        const company = $(el).find('[data-testid="company-name"], .companyName').first().text().trim();
        const loc = $(el).find('[data-testid="text-location"], .companyLocation').first().text().trim();
        const salary = $(el).find('[class*="salary-snippet"], [class*="salaryText"]').first().text().trim();
        const snippet = $(el).find('[class*="job-snippet"], .job-snippet').first().text().trim();
        if (!title || !company) return;
        jobs.push({
          title, company, loc, salary, snippet,
          sourceId: jk || `indeed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sourceUrl: jk ? `https://www.indeed.com/viewjob?jk=${jk}` : null,
        });
      });

      logger.debug(`[Indeed] Found ${jobs.length} job cards`);
      for (const job of jobs) {
        await this._upsertJob({
          title: job.title,
          company: job.company,
          description: (job.snippet || `${job.title} at ${job.company}`).slice(0, 1000),
          location: job.loc || location,
          salary: job.salary || null,
          sourceId: job.sourceId,
          sourceUrl: job.sourceUrl,
          requiredSkills: this._extractSkillsFromText(`${job.title} ${keyword} ${job.snippet || ''}`),
          experienceRange: this._guessExperienceFromTitle(job.title),
          domain: this._guessDomainFromTitle(job.title),
          postedAt: new Date(),
        }, 'INDEED');
        ingested++;
      }
    } catch (err) {
      logger.warn(`[Indeed] Scrape failed: ${err.message}`);
    }
    logger.info(`[Indeed] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape Halian.com — IT & professional staffing firm.
   * URL: https://www.halian.com/jobs/
   */
  async scrapeHalian(keyword) {
    logger.info(`[Halian] Scraping "${keyword}"`);
    let puppeteer;
    try {
      puppeteer = require('puppeteer-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      puppeteer.use(StealthPlugin());
    } catch {
      logger.warn('[Halian] Puppeteer not available');
      return 0;
    }

    const url = `https://www.halian.com/jobs/?search=${encodeURIComponent(keyword)}`;
    let browser;
    let ingested = 0;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        timeout: 30000,
      });
      const page = await browser.newPage();
      await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('.job-listing, .vacancy, [class*="job"], article', { timeout: 10000 }).catch(() => {});

      const jobs = await page.evaluate(() => {
        const cards = document.querySelectorAll('.job-listing, .job-item, .vacancy-item, article[class*="job"], .jobs-list li');
        return Array.from(cards).slice(0, 25).map(el => {
          const title = el.querySelector('h2, h3, h4, [class*="title"], a')?.textContent?.trim();
          const company = 'Halian';
          const loc = el.querySelector('[class*="location"], [class*="city"]')?.textContent?.trim();
          const salary = el.querySelector('[class*="salary"]')?.textContent?.trim();
          const desc = el.querySelector('[class*="desc"], [class*="summary"], p')?.textContent?.trim();
          const href = el.querySelector('a[href]')?.href;
          return { title, company, loc, salary, desc, href };
        }).filter(j => j.title);
      });

      logger.debug(`[Halian] Found ${jobs.length} job cards`);
      for (const job of jobs) {
        const sourceId = job.href?.match(/[?&]id=(\d+)/)?.[1]
          || job.href?.split('/').filter(Boolean).pop()
          || `halian-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await this._upsertJob({
          title: job.title,
          company: job.company,
          description: (job.desc || `${job.title} — Halian Recruitment`).slice(0, 1000),
          location: job.loc || 'UAE',
          salary: job.salary || null,
          sourceId: String(sourceId),
          sourceUrl: job.href || url,
          requiredSkills: this._extractSkillsFromText(`${job.title} ${keyword} ${job.desc || ''}`),
          experienceRange: this._guessExperienceFromTitle(job.title),
          domain: this._guessDomainFromTitle(job.title),
          postedAt: new Date(),
        }, 'HALIAN');
        ingested++;
      }
    } catch (err) {
      logger.warn(`[Halian] Scrape failed: ${err.message}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    logger.info(`[Halian] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape Discovered.careers — UAE talent platform.
   * URL: https://discovered.careers/jobs
   */
  async scrapeDiscovered(keyword) {
    logger.info(`[Discovered] Scraping "${keyword}"`);
    let ingested = 0;
    try {
      const url = `https://discovered.careers/jobs?search=${encodeURIComponent(keyword)}`;
      const resp = await axios.get(url, {
        headers: { ...BROWSER_HEADERS, 'Referer': 'https://discovered.careers/' },
        timeout: 20000,
      });
      const $ = cheerio.load(resp.data);

      const jobs = [];
      $('[class*="job-card"], [class*="vacancy"], article, .job-item').each((_, el) => {
        const title = $(el).find('h2, h3, [class*="title"], a').first().text().trim();
        const company = $(el).find('[class*="company"], [class*="employer"]').first().text().trim() || 'Discovered';
        const loc = $(el).find('[class*="location"]').first().text().trim();
        const desc = $(el).find('[class*="desc"], p').first().text().trim();
        const href = $(el).find('a[href]').first().attr('href');
        if (!title) return;
        const fullUrl = href?.startsWith('http') ? href : href ? `https://discovered.careers${href}` : null;
        jobs.push({
          title, company, loc, desc,
          sourceId: fullUrl || `discovered-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sourceUrl: fullUrl,
        });
      });

      logger.debug(`[Discovered] Found ${jobs.length} job cards`);
      for (const job of jobs) {
        await this._upsertJob({
          title: job.title,
          company: job.company,
          description: (job.desc || `${job.title} at ${job.company}`).slice(0, 1000),
          location: job.loc || 'UAE',
          salary: null,
          sourceId: job.sourceId,
          sourceUrl: job.sourceUrl,
          requiredSkills: this._extractSkillsFromText(`${job.title} ${keyword} ${job.desc || ''}`),
          experienceRange: this._guessExperienceFromTitle(job.title),
          domain: this._guessDomainFromTitle(job.title),
          postedAt: new Date(),
        }, 'DISCOVERED');
        ingested++;
      }
    } catch (err) {
      logger.warn(`[Discovered] Scrape failed: ${err.message}`);
    }
    logger.info(`[Discovered] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape ADNOC Careers — Abu Dhabi National Oil Company.
   * URL: https://careers.adnoc.ae/
   */
  async scrapeADNOC(keyword) {
    logger.info(`[ADNOC] Scraping "${keyword}"`);
    let puppeteer;
    try {
      puppeteer = require('puppeteer-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      puppeteer.use(StealthPlugin());
    } catch {
      logger.warn('[ADNOC] Puppeteer not available');
      return 0;
    }

    let browser;
    let ingested = 0;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        timeout: 30000,
      });
      const page = await browser.newPage();
      await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
      await page.goto('https://careers.adnoc.ae/', { waitUntil: 'networkidle2', timeout: 30000 });

      // Try search if available
      try {
        const searchBox = await page.$('input[type="search"], input[placeholder*="search" i], input[name*="search" i]');
        if (searchBox) {
          await searchBox.type(keyword);
          await page.keyboard.press('Enter');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        }
      } catch { /* no search box, proceed with all listings */ }

      await page.waitForSelector('[class*="job"], [class*="vacancy"], [class*="career"], article', { timeout: 10000 }).catch(() => {});

      const jobs = await page.evaluate((kw) => {
        const cards = document.querySelectorAll('[class*="job-card"], [class*="vacancy-card"], [class*="career-card"], article, .job-listing li, [class*="job-item"]');
        return Array.from(cards).slice(0, 30).map(el => {
          const title = el.querySelector('h2, h3, h4, [class*="title"], [class*="position"]')?.textContent?.trim();
          const loc = el.querySelector('[class*="location"], [class*="city"]')?.textContent?.trim();
          const dept = el.querySelector('[class*="department"], [class*="category"]')?.textContent?.trim();
          const deadline = el.querySelector('[class*="deadline"], [class*="date"], time')?.textContent?.trim();
          const href = el.querySelector('a[href]')?.href;
          if (!title) return null;
          return { title, company: 'ADNOC', loc, dept, deadline, href };
        }).filter(Boolean);
      }, keyword);

      logger.debug(`[ADNOC] Found ${jobs.length} job cards`);
      for (const job of jobs) {
        const sourceId = job.href?.match(/[?&](?:id|jobId)=([^&]+)/)?.[1]
          || job.href?.split('/').filter(Boolean).pop()
          || `adnoc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await this._upsertJob({
          title: job.title,
          company: 'ADNOC',
          description: `${job.title}${job.dept ? ` — ${job.dept}` : ''} at ADNOC (Abu Dhabi National Oil Company)`.slice(0, 1000),
          location: job.loc || 'Abu Dhabi, UAE',
          salary: null,
          sourceId: String(sourceId),
          sourceUrl: job.href || 'https://careers.adnoc.ae/',
          requiredSkills: this._extractSkillsFromText(`${job.title} ${keyword} ${job.dept || ''}`),
          experienceRange: this._guessExperienceFromTitle(job.title),
          domain: this._guessDomainFromTitle(job.title),
          jobType: 'FULL_TIME',
          postedAt: new Date(),
        }, 'ADNOC');
        ingested++;
      }
    } catch (err) {
      logger.warn(`[ADNOC] Scrape failed: ${err.message}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    logger.info(`[ADNOC] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  // ─── Legacy / Fallback Sources ────────────────────────────────────────────

  /**
   * Scrape Naukri.com using Puppeteer (JS-rendered site).
   * Falls back to remoteok if puppeteer unavailable.
   */
  async scrapeNaukri(keyword, location = 'India') {
    logger.info(`[Naukri] Scraping "${keyword}" in "${location}" via Puppeteer`);
    let puppeteer;
    try {
      puppeteer = require('puppeteer-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      puppeteer.use(StealthPlugin());
    } catch {
      logger.warn('[Naukri] Puppeteer not available, skipping Naukri');
      return 0;
    }

    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const url = `https://www.naukri.com/${slug(keyword)}-jobs-in-${slug(location)}`;
    let browser;
    let ingested = 0;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        timeout: 30000,
      });
      const page = await browser.newPage();
      await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('article[class*="jobTuple"], .cust-job-tuple', { timeout: 10000 }).catch(() => {});

      const jobs = await page.evaluate(() => {
        const cards = document.querySelectorAll('article[class*="jobTuple"], .cust-job-tuple, .job-tuple');
        return Array.from(cards).slice(0, 25).map(el => {
          const title = el.querySelector('a.title, .jobtitle, h2.title, [class*="title"] a')?.textContent?.trim();
          const company = el.querySelector('a.subTitle, .comp-name, [class*="comp-name"]')?.textContent?.trim();
          const loc = el.querySelector('.locWdth, .location, [class*="location"]')?.textContent?.trim();
          const salary = el.querySelector('.salary, [class*="salary"]')?.textContent?.trim();
          const href = el.querySelector('a[href*="naukri.com"]')?.href;
          const exp = el.querySelector('[class*="exp"]')?.textContent?.trim();
          const desc = el.querySelector('[class*="desc"], [class*="job-desc"]')?.textContent?.trim();
          return { title, company, loc, salary, href, exp, desc };
        }).filter(j => j.title && j.company);
      });

      logger.debug(`[Naukri] Found ${jobs.length} job cards`);
      for (const job of jobs) {
        const sourceId = job.href?.match(/(\d+)(?:\?|$)/)?.[1]
          || `naukri-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await this._upsertJob({
          title: job.title,
          company: job.company,
          description: (job.desc || `${job.title} at ${job.company}`).slice(0, 1000),
          location: job.loc || location,
          salary: job.salary || null,
          sourceId,
          sourceUrl: job.href || url,
          requiredSkills: this._extractSkillsFromText(`${job.title} ${keyword} ${job.desc || ''}`),
          experienceRange: this._parseExperienceText(job.exp) || this._guessExperienceFromTitle(job.title),
          domain: this._guessDomainFromTitle(job.title),
          postedAt: new Date(),
        }, 'NAUKRI');
        ingested++;
      }
    } catch (err) {
      logger.warn(`[Naukri] Puppeteer scrape failed: ${err.message}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    logger.info(`[Naukri] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape job listings discovered via Bing search.
   * Searches Bing, extracts job listing URLs from results, scrapes each page.
   */
  async scrapeViaBing(keyword, location = 'India') {
    logger.info(`[Bing] Searching "${keyword}" jobs in "${location}"`);
    const query = encodeURIComponent(`${keyword} jobs ${location} -site:linkedin.com`);
    const urls = [];

    try {
      const resp = await axios.get(`https://www.bing.com/search?q=${query}&count=20`, {
        headers: { ...BROWSER_HEADERS, 'Accept-Language': 'en-IN,en;q=0.9' },
        timeout: 15000,
      });
      const $ = cheerio.load(resp.data);

      // Extract result URLs from Bing's .b_algo blocks
      $('.b_algo h2 a, #b_results .b_algo a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && !href.includes('bing.com')) {
          urls.push(href);
        }
      });
      logger.debug(`[Bing] Found ${urls.length} result URLs`);
    } catch (err) {
      logger.warn(`[Bing] Search failed: ${err.message}`);
      return 0;
    }

    // Filter to known job sites
    const jobSiteUrls = urls.filter((u) =>
      /indeed|naukri|glassdoor|shine|monster|timesjobs|foundit/i.test(u)
    ).slice(0, 10);

    let ingested = 0;
    await concurrentMap(jobSiteUrls, 2, async (url) => {
      try {
        const resp = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 15000 });
        const $ = cheerio.load(resp.data);

        // Generic job page extraction
        const title = $('h1').first().text().trim()
          || $('[class*="title"]').first().text().trim()
          || keyword;
        const company = $('[class*="company"], [class*="employer"]').first().text().trim() || 'Unknown';
        const description = $('[class*="description"], [class*="desc"], main').first().text()
          .replace(/\s+/g, ' ').trim().slice(0, 1000)
          || `${title} at ${company}`;

        if (!title || title.length < 5) return;

        const job = {
          title: title.slice(0, 200),
          company: company.slice(0, 200),
          description,
          location,
          sourceId: url,
          sourceUrl: url,
          requiredSkills: this._extractSkillsFromText(`${title} ${description} ${keyword}`),
          experienceRange: this._guessExperienceFromTitle(title),
          domain: this._guessDomainFromTitle(title),
          postedAt: new Date(),
        };

        // Determine source from URL
        const source = /naukri/i.test(url) ? 'NAUKRI'
          : /indeed/i.test(url) ? 'INDEED'
          : 'SCRAPED';

        await this._upsertJob(job, source);
        ingested++;
        await sleep(800);
      } catch { /* skip failed URLs */ }
    });

    logger.info(`[Bing] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape LinkedIn public job listings.
   */
  async scrapeLinkedIn(keyword, location = 'India', maxPages = 2) {
    logger.info(`[LinkedIn] Scraping "${keyword}" in "${location}"`);
    const allJobs = [];

    for (let page = 0; page < maxPages; page++) {
      const start = page * 25;
      try {
        const resp = await axios.get(
          'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search',
          {
            params: { keywords: keyword, location, start },
            headers: BROWSER_HEADERS,
            timeout: 15000,
          }
        );
        const jobs = this._parseLinkedInCards(resp.data, keyword);
        logger.debug(`[LinkedIn] Page ${page + 1}: ${jobs.length} cards`);
        allJobs.push(...jobs);
        if (jobs.length < 25) break;
        await sleep(DELAY_MS);
      } catch (err) {
        logger.warn(`[LinkedIn] Page ${page + 1} error: ${err.response?.status || err.message}`);
        break;
      }
    }

    if (allJobs.length === 0) return 0;

    await concurrentMap(allJobs, 3, async (job) => {
      if (!job.sourceUrl) return;
      try {
        const resp = await axios.get(job.sourceUrl, { headers: BROWSER_HEADERS, timeout: 12000 });
        const enriched = this._parseLinkedInDetail(resp.data);
        if (enriched.description) job.description = enriched.description;
        if (enriched.skills.length > 0) job.requiredSkills = enriched.skills;
        if (enriched.jobType) job.jobType = enriched.jobType;
      } catch { /* keep card data */ }
      await sleep(800);
    });

    let ingested = 0;
    for (const job of allJobs) {
      await this._upsertJob(job, 'LINKEDIN');
      ingested++;
    }

    logger.info(`[LinkedIn] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape RemoteOK open API.
   */
  async scrapeRemoteOK(keyword = '') {
    logger.info(`[RemoteOK] Scraping tag: "${keyword || 'all'}"`);
    let ingested = 0;
    try {
      const tag = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const url = tag ? `https://remoteok.com/api?tags=${encodeURIComponent(tag)}` : 'https://remoteok.com/api';
      const resp = await axios.get(url, {
        headers: { 'User-Agent': 'NaukriAI Job Aggregator', Accept: 'application/json' },
        timeout: 15000,
      });
      const jobs = resp.data.filter((j) => j.position && j.company);
      for (const job of jobs) {
        await this._upsertJob(this._normalizeRemoteOK(job), 'INDEED');
        ingested++;
      }
    } catch (err) {
      logger.warn(`[RemoteOK] Error: ${err.message}`);
    }
    logger.info(`[RemoteOK] Done — ${ingested} jobs ingested`);
    return ingested;
  }

  /**
   * Scrape all sources for a keyword (used by cron).
   */
  async scrapeAll(keyword, location = 'UAE') {
    const results = await Promise.allSettled([
      this.scrapeNaukriGulf(keyword, location),
      this.scrapeIndeed(keyword, location),
      this.scrapeHalian(keyword),
      this.scrapeDiscovered(keyword),
      this.scrapeADNOC(keyword),
    ]);
    return results.reduce((sum, r) => sum + (r.value || 0), 0);
  }

  /**
   * Seed the DB on first startup.
   */
  async seedIfEmpty() {
    const count = await prisma.jobPosting.count();
    if (count > 0) {
      logger.info(`[Scraper] ${count} jobs in DB — skipping seed`);
      return;
    }
    logger.info('[Scraper] Seeding jobs for default keywords…');
    for (const kw of DEFAULT_KEYWORDS) {
      await this.scrapeAll(kw, 'India');
      await sleep(DELAY_MS * 2);
    }
    logger.info(`[Scraper] Seed complete — ${await prisma.jobPosting.count()} jobs`);
  }

  /**
   * Delete all job postings past their expiresAt date.
   * Called daily by cron in app.js.
   */
  async deleteExpiredJobs() {
    const result = await prisma.jobPosting.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        source: { not: 'MANUAL' }, // never auto-delete manually posted jobs
      },
    });
    if (result.count > 0) {
      logger.info(`[Cron] Deleted ${result.count} expired job listings`);
    }
    return result.count;
  }

  /**
   * Manually ingest a recruiter-created job.
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
        // MANUAL jobs have no expiry
      },
    });
  }

  // ─── Parsers ─────────────────────────────────────────────────────────────

  _parseLinkedInCards(html, keyword) {
    const $ = cheerio.load(html);
    const jobs = [];
    $('li').each((_, el) => {
      try {
        const title = $(el).find('.base-search-card__title').text().trim();
        const company = $(el).find('.base-search-card__subtitle').text().trim();
        const location = $(el).find('.job-search-card__location').text().trim();
        const postedAt = $(el).find('time').attr('datetime');
        const sourceUrl = $(el).find('a.base-card__full-link').attr('href')?.split('?')[0];
        const sourceId = sourceUrl?.match(/view\/(\d+)/)?.[1] || sourceUrl?.match(/-(\d+)\/?$/)?.[1];
        if (!title || !company) return;
        jobs.push({
          title, company,
          description: `${title} at ${company}${location ? ` — ${location}` : ''}`,
          location: location || 'India',
          sourceId: sourceId || `li-${Date.now()}-${Math.random()}`,
          sourceUrl: sourceUrl || null,
          requiredSkills: this._extractSkillsFromText(`${title} ${keyword}`),
          experienceRange: this._guessExperienceFromTitle(title),
          domain: this._guessDomainFromTitle(title),
          postedAt: postedAt ? new Date(postedAt) : new Date(),
        });
      } catch { /* skip */ }
    });
    return jobs;
  }

  _parseLinkedInDetail(html) {
    const $ = cheerio.load(html);
    const descEl = $('.show-more-less-html__markup, .description__text').first();
    const description = descEl.text().replace(/\s+/g, ' ').trim().slice(0, 2000) || '';
    const criteriaItems = {};
    $('.description__job-criteria-item').each((_, el) => {
      const label = $(el).find('.description__job-criteria-subheader').text().trim().toLowerCase();
      const value = $(el).find('.description__job-criteria-text').text().trim();
      criteriaItems[label] = value;
    });
    const jobType = criteriaItems['employment type']
      ? this._normalizeJobType(criteriaItems['employment type']) : null;
    return { description, skills: description ? this._extractSkillsFromText(description) : [], jobType };
  }

  _normalizeRemoteOK(job) {
    const salary = job.salary_min && job.salary_max
      ? `$${Math.round(job.salary_min / 1000)}k–$${Math.round(job.salary_max / 1000)}k`
      : job.salary || null;
    const desc = job.description
      ? cheerio.load(job.description).text().replace(/\s+/g, ' ').trim().slice(0, 500)
      : `${job.position} at ${job.company}`;
    const skillText = `${job.position} ${desc} ${(job.tags || []).join(' ')}`;
    return {
      title: job.position, company: job.company, description: desc,
      location: job.location || 'Remote',
      sourceId: String(job.id || job.slug),
      sourceUrl: job.apply_url || job.url || null,
      requiredSkills: this._extractSkillsFromText(skillText).slice(0, 12),
      experienceRange: this._guessExperienceFromTitle(job.position),
      domain: this._guessDomainFromTitle(job.position),
      salary, jobType: 'REMOTE',
      postedAt: job.date ? new Date(job.date) : new Date(),
    };
  }

  // ─── DB Write ─────────────────────────────────────────────────────────────

  async _upsertJob(jobData, source) {
    const { experienceRange, postedAt, ...rest } = jobData;
    const expiresAt = new Date(Date.now() + TEN_DAYS_MS);
    try {
      await prisma.jobPosting.upsert({
        where: {
          source_sourceId: {
            source,
            sourceId: String(jobData.sourceId || `${source}-${Date.now()}-${Math.random()}`),
          },
        },
        update: { isActive: true, expiresAt },
        create: {
          ...rest,
          source,
          sourceId: String(jobData.sourceId),
          experienceMin: experienceRange?.min ?? 0,
          experienceMax: experienceRange?.max ?? 10,
          isActive: true,
          postedAt: postedAt || new Date(),
          expiresAt,
        },
      });
    } catch (err) {
      logger.debug(`[Scraper] Upsert skipped (${jobData.title}): ${err.message}`);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _extractSkillsFromText(text) {
    const SKILLS = [
      // Programming
      'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#', 'PHP', 'Ruby', 'Swift', 'Kotlin',
      // Frontend
      'React', 'Vue', 'Angular', 'Next.js', 'Nuxt', 'Svelte',
      // Backend
      'Node.js', 'Express', 'NestJS', 'Django', 'FastAPI', 'Flask', 'Spring', 'Laravel', 'Rails',
      // Databases
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Cassandra', 'DynamoDB', 'Oracle', 'SQL Server',
      // APIs
      'GraphQL', 'REST', 'gRPC', 'WebSockets',
      // Cloud & DevOps
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'CI/CD', 'Jenkins',
      // AI/ML
      'Machine Learning', 'Deep Learning', 'NLP', 'PyTorch', 'TensorFlow', 'Scikit-learn',
      // Data
      'Data Science', 'Spark', 'Kafka', 'Airflow', 'dbt', 'SQL', 'Tableau', 'Power BI', 'Excel',
      // Mobile
      'React Native', 'Flutter', 'iOS', 'Android',
      // Enterprise
      'SAP', 'SAP S/4HANA', 'SAP FICO', 'SAP MM', 'SAP SD', 'SAP HCM', 'SAP BW',
      'Oracle ERP', 'Oracle Fusion', 'Salesforce', 'ServiceNow', 'Workday', 'Dynamics 365',
      // Soft/Process
      'Microservices', 'System Design', 'DevOps', 'Agile', 'Scrum', 'TDD', 'ITIL', 'PMP',
      'Linux', 'Git', 'Bash', 'Nginx', 'RabbitMQ', 'Celery',
      'Pandas', 'NumPy', 'Jupyter', 'OpenCV', 'LangChain', 'LLM',
      // Business
      'Project Management', 'Business Analysis', 'Change Management', 'Stakeholder Management',
      'Financial Modeling', 'Risk Management', 'Procurement', 'Supply Chain',
    ];
    const lower = text.toLowerCase();
    return [...new Set(SKILLS.filter((s) => lower.includes(s.toLowerCase())))];
  }

  _parseExperienceText(text) {
    if (!text) return null;
    const match = text.match(/(\d+)\s*[-–to]+\s*(\d+)/);
    if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
    const single = text.match(/(\d+)\+?\s*(?:yr|year)/i);
    if (single) return { min: parseInt(single[1]), max: parseInt(single[1]) + 3 };
    return null;
  }

  _guessExperienceFromTitle(title) {
    const t = title.toLowerCase();
    if (t.match(/junior|entry|fresher|intern/)) return { min: 0, max: 2 };
    if (t.match(/senior|sr\.|lead|principal/)) return { min: 5, max: 12 };
    if (t.match(/staff|architect|vp|director/)) return { min: 8, max: 20 };
    if (t.match(/manager/)) return { min: 4, max: 10 };
    return { min: 2, max: 6 };
  }

  _normalizeJobType(text) {
    const t = text.toLowerCase();
    if (t.includes('full')) return 'FULL_TIME';
    if (t.includes('part')) return 'PART_TIME';
    if (t.includes('contract')) return 'CONTRACT';
    if (t.includes('intern')) return 'INTERNSHIP';
    if (t.includes('remote')) return 'REMOTE';
    return null;
  }

  _guessDomainFromTitle(title) {
    const t = title.toLowerCase();
    if (t.match(/oil|gas|petroleum|refin|upstream|downstream|reservoir|drilling|well|subsea|pipeline/)) return 'Oil & Gas';
    if (t.match(/consult|advisory|management consult|strategy|delivery|service delivery/)) return 'Consulting';
    if (t.match(/finance|financial|accounting|audit|treasury|risk|compliance|banking|credit|investment|analyst/)) return 'Finance';
    if (t.match(/hr|human resource|talent|recruit|people|payroll|compensation/)) return 'Human Resources';
    if (t.match(/supply chain|logistics|procurement|warehouse|inventory|operations/)) return 'Operations';
    if (t.match(/civil|construction|structural|architecture|mechanical|electrical|maintenance|facilities/)) return 'Engineering';
    if (t.match(/sales|business development|account manager|commercial|marketing/)) return 'Sales & Marketing';
    if (t.match(/data|analytics|bi|warehouse|etl|spark|tableau|power bi/)) return 'Data Engineering';
    if (t.match(/ml|machine learning|ai|nlp|deep learning/)) return 'AI/ML';
    if (t.match(/devops|cloud|infra|platform|sre|kubernetes|docker/)) return 'Cloud/DevOps';
    if (t.match(/mobile|ios|android|flutter/)) return 'Mobile';
    if (t.match(/frontend|front-end|ui|ux/)) return 'Frontend';
    if (t.match(/backend|back-end|api|microservice/)) return 'Backend';
    if (t.match(/security|cyber|soc|penetration/)) return 'Security';
    if (t.match(/project manager|pmo|scrum master|agile coach/)) return 'Project Management';
    return 'Technology';
  }
}

module.exports = new JobScraperService();
