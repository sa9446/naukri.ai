/**
 * CV EXTRACTION SERVICE
 * Converts uploaded PDF/DOCX files to raw text.
 * No AI reasoning here — pure file-to-text conversion.
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const logger = require('../config/logger');

class CVExtractionService {
  /**
   * Extract raw text from a CV file (PDF or DOCX).
   * @param {string} filePath - Absolute path to the uploaded file
   * @param {string} mimeType - MIME type of the file
   * @returns {Promise<string>} - Extracted raw text
   */
  async extractText(filePath, mimeType) {
    logger.debug(`Extracting text from: ${filePath} [${mimeType}]`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    try {
      if (mimeType === 'application/pdf') {
        return await this._extractFromPDF(filePath);
      }

      if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        return await this._extractFromDOCX(filePath);
      }

      throw new Error(`Unsupported file type: ${mimeType}`);
    } catch (err) {
      logger.error(`Text extraction failed for ${filePath}:`, err);
      throw err;
    }
  }

  /**
   * Extract text from a PDF file using pdf-parse.
   */
  async _extractFromPDF(filePath) {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const text = data.text
      .replace(/\s+/g, ' ')      // collapse whitespace
      .replace(/\n{3,}/g, '\n\n') // max 2 newlines
      .trim();

    if (!text || text.length < 50) {
      throw new Error('PDF appears to be empty or image-based (no extractable text)');
    }
    return text;
  }

  /**
   * Extract text from a DOCX file using mammoth.
   */
  async _extractFromDOCX(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });

    if (result.messages.length > 0) {
      logger.warn('DOCX extraction warnings:', result.messages);
    }

    const text = result.value
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text || text.length < 50) {
      throw new Error('DOCX appears to be empty');
    }
    return text;
  }

  /**
   * Delete a file from disk after processing.
   */
  cleanupFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Cleaned up: ${filePath}`);
      }
    } catch (err) {
      logger.warn(`Failed to cleanup file ${filePath}:`, err);
    }
  }
}

module.exports = new CVExtractionService();
