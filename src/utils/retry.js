const logger = require('./logger');

/**
 * Retries an async function with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {Object} opts
 * @param {number} opts.retries - Max attempts (default 3)
 * @param {number} opts.baseDelayMs - Initial delay in ms (default 500)
 * @param {string} opts.label - Label for logging
 */
async function withRetry(fn, { retries = 3, baseDelayMs = 500, label = 'operation' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === retries;
      if (isLast) break;

      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn(`[retry] ${label} failed (attempt ${attempt}/${retries}), retrying in ${delay}ms`, {
        error: err.message,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

module.exports = { withRetry };
