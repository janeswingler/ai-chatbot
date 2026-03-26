const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const { cleanText, chunkText } = require('../utils/textUtils');

class DocumentProcessor {
  /**
   * Process a document file (PDF or TXT)
   * @param {Object} file - Multer file object
   * @param {number} chunkSize - Size of text chunks (default: 1000)
   * @param {number} chunkOverlap - Overlap between chunks (default: 200)
   * @returns {Object} Processed document with text and chunks
   */
  async processDocument(file, chunkSize = 1000, chunkOverlap = 200) {
    try {
      // Extract text based on file type
      let rawText;
      if (file.mimetype === 'application/pdf') {
        rawText = await this.extractPdfText(file.path);
      } else if (file.mimetype === 'text/plain') {
        rawText = await this.extractTxtText(file.path);
      } else {
        throw new Error(`Unsupported file type: ${file.mimetype}`);
      }

      // Clean the extracted text
      const fullText = cleanText(rawText);

      if (!fullText || fullText.length === 0) {
        throw new Error('No text content found in document');
      }

      // Chunk the text
      const chunks = chunkText(fullText, chunkSize, chunkOverlap);

      return {
        fullText,
        chunks,
        fileSize: file.size,
        totalChunks: chunks.length,
        chunkSize,
        chunkOverlap
      };
    } catch (error) {
      console.error('Error processing document:', error);
      throw error;
    }
  }

  /**
   * Extract text from PDF file
   * @param {string} filePath - Path to PDF file
   * @returns {string} Extracted text
   */
  async extractPdfText(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text;
    } catch (error) {
      console.error('Error extracting PDF text:', error);
      throw new Error('Failed to parse PDF file');
    }
  }

  /**
   * Extract text from TXT file
   * @param {string} filePath - Path to TXT file
   * @returns {string} File content
   */
  async extractTxtText(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Error reading TXT file:', error);
      throw new Error('Failed to read TXT file');
    }
  }
}

module.exports = new DocumentProcessor();
