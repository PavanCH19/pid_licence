// In-memory token blacklist (in production, use Redis or database)
const tokenBlacklist = new Set();

/**
 * Add token to blacklist
 */
function blacklistToken(token) {
  tokenBlacklist.add(token);
  console.log(`Token blacklisted: ${token.substring(0, 20)}...`);
}

/**
 * Check if token is blacklisted
 */
function isTokenBlacklisted(token) {
  const isBlacklisted = tokenBlacklist.has(token);
  if (isBlacklisted) {
    console.log(`Token is blacklisted: ${token.substring(0, 20)}...`);
  }
  return isBlacklisted;
}

/**
 * Get blacklisted tokens (for debugging)
 */
function getBlacklistedTokens() {
  return Array.from(tokenBlacklist);
}

/**
 * Clear blacklist (for testing)
 */
function clearBlacklist() {
  tokenBlacklist.clear();
  console.log('Token blacklist cleared');
}

module.exports = {
  blacklistToken,
  isTokenBlacklisted,
  getBlacklistedTokens,
  clearBlacklist
};
