/**
 * Clean text by removing extra whitespace and normalizing characters
 * @param {string} text - Raw text to clean
 * @returns {string} Cleaned text
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Normalize unicode characters
    .normalize('NFKC');
}

/**
 * Chunk text using sliding window approach
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Size of each chunk in characters (default: 1000)
 * @param {number} overlap - Overlap between chunks in characters (default: 200)
 * @returns {Array} Array of chunk objects with {chunkIndex, text, startChar, endChar}
 */
function chunkText(text, chunkSize = 1000, overlap = 200) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Clean the text first
  const cleanedText = cleanText(text);

  if (cleanedText.length === 0) {
    return [];
  }

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < cleanedText.length) {
    const end = Math.min(start + chunkSize, cleanedText.length);
    const chunkText = cleanedText.slice(start, end);

    chunks.push({
      chunkIndex: index,
      text: chunkText,
      startChar: start,
      endChar: end
    });

    // Move start position forward, accounting for overlap
    start += (chunkSize - overlap);
    index++;

    // Prevent infinite loop if overlap >= chunkSize
    if (overlap >= chunkSize) {
      start = end;
    }
  }

  return chunks;
}

module.exports = { cleanText, chunkText };
