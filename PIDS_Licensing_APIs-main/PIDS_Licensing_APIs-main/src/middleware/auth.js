const jwt = require('jsonwebtoken');
const { blacklistToken, isTokenBlacklisted } = require('../Supporters/tokenBlacklist.js');

/**
 * Middleware to verify JWT token
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']; // lowercase!
  const token = authHeader; 

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      code: 401
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is blacklisted
    if (isTokenBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        message: 'Token has been invalidated',
        code: 401
      });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        code: 401
      });
    }
    
    return res.status(403).json({
      success: false,
      message: 'Invalid token',
      code: 403
    });
  }
};

/**
 * Middleware to check if user has admin role
 */
// const requireAdmin = (req, res, next) => {
//   if (!req.user || req.user.role !== 'admin') {
//     return res.status(403).json({
//       success: false,
//       message: 'Admin access required',
//       code: 403
//     });
//   }
//   next();
// };

module.exports = {
  authenticateToken,
  //requireAdmin
};
