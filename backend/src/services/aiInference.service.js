/**
 * AI INFERENCE SERVICE — LOCAL ENGINE BRIDGE
 * Routes all AI calls to the self-hosted Python AI engine (port 8000).
 * NO cloud API keys required. No OpenAI. Fully offline after setup.
 *
 * The AI engine runs locally at http://localhost:8000
 * and uses Ollama + Mistral 7B for LLM inference
 * and sentence-transformers for embeddings.
 */

const axios = require('axios');
const logger = require('../config/logger');

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal-service-key-change-in-production';

const aiEngine = axios.create({
  baseURL: AI_ENGINE_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-key': INTERNAL_API_KEY,
  },
  timeout: 600000, // 10 minutes (Mistral 7B on CPU can take 5-8 min)
});

// Retry logic for AI engine calls
const withRetry = async (fn, maxRetries = 2) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = 1000 * (attempt + 1);
      logger.warn(`AI engine call failed, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
};

class AIInferenceService {
  /**
   * Parse CV raw text into structured JSON.
   * Calls local AI engine → Ollama (Mistral 7B) + rule-based fallback.
   * @param {string} rawText - Raw text extracted from CV file
   * @returns {Promise<Object>} - Structured CV data
   */
  async parseCVToStructured(rawText, mode = 'hybrid') {
    logger.debug(`Sending CV to local AI engine for parsing [mode=${mode}]...`);

    try {
      const response = await withRetry(() =>
        aiEngine.post('/parse-cv', { rawText, mode })
      );

      const { data } = response.data;
      if (!data) throw new Error('AI engine returned empty data');

      logger.debug(`CV parsed [mode=${data.inferenceMode}, confidence=${data.confidence}]`);

      // Normalize field names for Prisma compatibility
      return {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        location: data.location,
        summary: data.summary,
        skills: data.skills || [],
        totalExperienceYears: data.totalExperienceYears || 0,
        experience: data.experience || [],
        education: data.education || [],
        certifications: data.certifications || [],
        languages: data.languages || [],
        domainExpertise: data.domainExpertise || [],
        behavioralFit: data.behavioralFit || {},
        traitScores: data.traitScores || {},
        highlights: data.highlights || [],
        _inferenceMode: data.inferenceMode,
        _confidence: data.confidence,
      };
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        logger.error(
          'AI Engine is not running! Start it with:\n' +
          '  cd ai-engine && python main.py\n' +
          'Also ensure Ollama is running:\n' +
          '  ollama serve'
        );
        throw new Error(
          'AI Engine offline. Run: cd ai-engine && python main.py'
        );
      }
      logger.error('AI engine CV parsing error:', err.message);
      throw err;
    }
  }

  /**
   * Generate vector embedding for semantic matching.
   * Uses local sentence-transformers (BAAI/bge-small-en-v1.5).
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - Embedding vector
   */
  async generateEmbedding(text) {
    logger.debug('Generating embedding via local AI engine...');

    try {
      const response = await withRetry(() =>
        aiEngine.post('/embed', { text, truncate: true })
      );
      return response.data.embedding;
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        logger.warn('AI Engine offline — embedding unavailable, scoring will use fallback');
        return null; // Scoring engine handles null embeddings gracefully
      }
      throw err;
    }
  }

  /**
   * Generate embeddings for multiple texts efficiently.
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async generateEmbeddingsBatch(texts) {
    logger.debug(`Generating ${texts.length} embeddings...`);
    // Call embed for each — the Python service batches internally
    const results = await Promise.allSettled(
      texts.map((t) => this.generateEmbedding(t))
    );
    return results.map((r) => (r.status === 'fulfilled' ? r.value : null));
  }

  /**
   * Score a single candidate-job match using local scoring engine.
   * @param {Object} candidate - Parsed candidate data
   * @param {Object} job - Job posting data
   * @returns {Promise<Object>} - Score breakdown
   */
  async scoreCandidateJobMatch(candidate, job) {
    try {
      const response = await withRetry(() =>
        aiEngine.post('/score-match', { candidate, job })
      );
      return response.data;
    } catch (err) {
      logger.error('Score match error:', err.message);
      throw err;
    }
  }

  /**
   * Rank multiple candidates for a job.
   * @param {Object[]} candidates
   * @param {Object} job
   * @param {number} minScore
   * @returns {Promise<Object[]>}
   */
  async rankCandidates(candidates, job, minScore = 0.80) {
    try {
      const response = await withRetry(() =>
        aiEngine.post('/rank-candidates', { candidates, job, minScore })
      );
      return response.data.results || [];
    } catch (err) {
      logger.error('Rank candidates error:', err.message);
      throw err;
    }
  }

  /**
   * @deprecated Use parseCVToStructured which includes trait inference.
   * Left for backward compatibility — trait scores are now part of ParsedCV.
   */
  async evaluateBehavioralFit(candidateData, jobData) {
    logger.warn('evaluateBehavioralFit is deprecated. Use parseCVToStructured.');
    return {
      fitScore: candidateData.traitScores?.leadership || 0.5,
      fitReason: 'Computed from local trait inference',
      redFlags: [],
      strengths: candidateData.behavioralFit?.traits || [],
    };
  }

  /**
   * @deprecated Match explanations are now embedded in score breakdown.
   */
  async explainMatches(candidateData, topJobs) {
    logger.warn('explainMatches is deprecated. Match reasons are in matchReasons field.');
    return topJobs.map((j, i) => ({
      jobIndex: i + 1,
      explanation: 'Match computed locally.',
      keyMatchingSkills: [],
      gap: null,
    }));
  }

  /**
   * Check if the AI engine is healthy and which models are loaded.
   */
  async checkHealth() {
    try {
      const response = await aiEngine.get('/health', { timeout: 5000 });
      return response.data;
    } catch {
      return {
        status: 'offline',
        ollamaAvailable: false,
        modelLoaded: false,
      };
    }
  }
}

module.exports = new AIInferenceService();
