class ConfidenceCalculator {
  /**
   * Calculate confidence metrics for RAG response
   * @param {Object} params - Parameters {retrievedDocs, retrievalMethod, responseLogprobs}
   * @returns {Object} Confidence metrics
   */
  calculate({ retrievedDocs, retrievalMethod, responseLogprobs = null }) {
    if (!retrievedDocs || retrievedDocs.length === 0) {
      return {
        overallConfidence: 0,
        retrievalConfidence: 0,
        responseConfidence: null,
        retrievalMethod: retrievalMethod || 'none'
      };
    }

    // Calculate retrieval confidence
    const retrievalConfidence = this.calculateRetrievalConfidence(retrievedDocs);

    // Calculate response confidence (if logprobs available)
    const responseConfidence = responseLogprobs
      ? this.calculateResponseConfidence(responseLogprobs)
      : null;

    // Overall confidence (weighted combination)
    const overallConfidence = responseConfidence !== null
      ? (retrievalConfidence * 0.6 + responseConfidence * 0.4)
      : retrievalConfidence;

    return {
      overallConfidence: Math.min(Math.max(overallConfidence, 0), 1),
      retrievalConfidence: Math.min(Math.max(retrievalConfidence, 0), 1),
      responseConfidence,
      retrievalMethod: retrievalMethod || 'unknown'
    };
  }

  /**
   * Calculate confidence based on retrieval scores
   * @param {Array} docs - Retrieved documents with scores
   * @returns {number} Retrieval confidence (0-1)
   */
  calculateRetrievalConfidence(docs) {
    if (docs.length === 0) return 0;

    const scores = docs.map(d => d.relevanceScore || d.score || 0);

    // Factor 1: Top score magnitude (50% weight)
    const topScore = scores[0] || 0;

    // Factor 2: Score gap between 1st and 2nd (30% weight)
    // Larger gap indicates clearer winner
    const gap = docs.length > 1
      ? (scores[0] - scores[1])
      : 0;

    // Factor 3: Average score of top-3 (20% weight)
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    // Weighted combination
    const confidence = (
      topScore * 0.5 +
      gap * 0.3 +
      avgScore * 0.2
    );

    return confidence;
  }

  /**
   * Calculate confidence from OpenAI response logprobs
   * @param {Array} logprobs - Log probabilities from OpenAI
   * @returns {number} Response confidence (0-1)
   */
  calculateResponseConfidence(logprobs) {
    if (!logprobs || logprobs.length === 0) return null;

    // Calculate average log probability
    const avgLogprob = logprobs.reduce((sum, lp) => sum + lp.logprob, 0) / logprobs.length;

    // Convert log probability to confidence (0-1)
    // logprobs are negative, so exp() gives us probability
    const confidence = Math.exp(avgLogprob);

    return confidence;
  }
}

module.exports = new ConfidenceCalculator();
