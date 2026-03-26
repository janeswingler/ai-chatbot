const natural = require('natural');
const TfIdf = natural.TfIdf;
const Document = require('../models/Document');
const { cosineSimilarity } = require('../utils/vectorUtils');
const embeddingService = require('./embeddingService');

class TFIDFRetriever {
  constructor() {
    this.tfidf = null;
    this.chunkMap = [];  // Maps corpus index to {documentId, documentName, chunkIndex, chunkText}
    this.isIndexed = false;
  }

  /**
   * Build TF-IDF index from all processed documents
   */
  async buildIndex() {
    try {
      console.log('Building TF-IDF index...');

      // Fetch all completed documents
      const documents = await Document.find({ processingStatus: 'completed' });

      if (documents.length === 0) {
        console.log('No documents found to index');
        this.isIndexed = false;
        return;
      }

      this.tfidf = new TfIdf();
      this.chunkMap = [];

      // Add each chunk to TF-IDF corpus
      documents.forEach(doc => {
        if (doc.chunks && doc.chunks.length > 0) {
          doc.chunks.forEach(chunk => {
            this.tfidf.addDocument(chunk.text);
            this.chunkMap.push({
              documentId: doc._id,
              documentName: doc.filename,
              chunkIndex: chunk.chunkIndex,
              chunkText: chunk.text
            });
          });
        }
      });

      this.isIndexed = true;
      console.log(`TF-IDF index built with ${this.chunkMap.length} chunks from ${documents.length} documents`);
    } catch (error) {
      console.error('Error building TF-IDF index:', error);
      this.isIndexed = false;
      throw error;
    }
  }

  /**
   * Retrieve top-k chunks using TF-IDF
   * @param {string} query - Search query
   * @param {number} topK - Number of results to return (default: 3)
   * @param {number} minScore - Minimum TF-IDF score threshold (default: 0)
   * @returns {Array} Top-k matching chunks with scores
   */
  retrieve(query, topK = 3, minScore = 0) {
    if (!this.isIndexed || !this.tfidf) {
      console.warn('TF-IDF index not built. Returning empty results.');
      return [];
    }

    const scores = [];

    // Calculate TF-IDF similarity for query
    this.tfidf.tfidfs(query, (i, measure) => {
      if (measure >= minScore) {
        scores.push({ index: i, score: measure });
      }
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Return top-k results
    return scores.slice(0, topK).map(item => ({
      ...this.chunkMap[item.index],
      score: item.score,
      relevanceScore: item.score
    }));
  }
}

class SemanticRetriever {
  /**
   * Retrieve top-k chunks using semantic similarity (embeddings)
   * @param {string} query - Search query
   * @param {number} topK - Number of results to return (default: 3)
   * @param {number} minScore - Minimum similarity score threshold (default: 0.3)
   * @returns {Array} Top-k matching chunks with scores
   */
  async retrieve(query, topK = 3, minScore = 0.3) {
    try {
      // Generate query embedding
      console.log('Generating query embedding...');
      const queryEmbedding = await embeddingService.generateQueryEmbedding(query);

      // Fetch all documents with embeddings
      const documents = await Document.find({
        processingStatus: 'completed',
        'chunks.embedding': { $exists: true, $ne: [] }
      });

      if (documents.length === 0) {
        console.log('No documents with embeddings found');
        return [];
      }

      // Calculate cosine similarity for each chunk
      const similarities = [];

      documents.forEach(doc => {
        if (doc.chunks && doc.chunks.length > 0) {
          doc.chunks.forEach(chunk => {
            if (chunk.embedding && chunk.embedding.length > 0) {
              const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);

              if (similarity >= minScore) {
                similarities.push({
                  documentId: doc._id,
                  documentName: doc.filename,
                  chunkIndex: chunk.chunkIndex,
                  chunkText: chunk.text,
                  score: similarity,
                  relevanceScore: similarity
                });
              }
            }
          });
        }
      });

      // Sort by similarity descending
      similarities.sort((a, b) => b.score - a.score);

      // Return top-k results
      console.log(`Found ${similarities.length} chunks above threshold, returning top ${topK}`);
      return similarities.slice(0, topK);
    } catch (error) {
      console.error('Error in semantic retrieval:', error);
      throw error;
    }
  }
}

class RetrievalService {
  constructor() {
    this.tfidfRetriever = new TFIDFRetriever();
    this.semanticRetriever = new SemanticRetriever();
  }

  /**
   * Initialize the retrieval service by building TF-IDF index
   */
  async initialize() {
    await this.tfidfRetriever.buildIndex();
  }

  /**
   * Rebuild TF-IDF index (call after document changes)
   */
  async rebuildIndex() {
    await this.tfidfRetriever.buildIndex();
  }

  /**
   * Retrieve documents based on specified method
   * @param {string} query - Search query
   * @param {Object} options - Retrieval options {method, topK, minScore}
   * @returns {Array} Retrieved chunks with metadata
   */
  async retrieve(query, options = {}) {
    const {
      method = 'semantic',
      topK = 3,
      minScore = 0.3
    } = options;

    try {
      if (method === 'tfidf') {
        return this.tfidfRetriever.retrieve(query, topK, minScore);
      } else if (method === 'semantic') {
        return await this.semanticRetriever.retrieve(query, topK, minScore);
      } else {
        throw new Error(`Unknown retrieval method: ${method}`);
      }
    } catch (error) {
      console.error(`Error in ${method} retrieval:`, error);
      // Return empty array on error to prevent breaking the chat
      return [];
    }
  }
}

module.exports = new RetrievalService();
