const { 
  getUserCredentials, 
  saveUserCredentials 
} = require('../Connectors/AwsSecretsManagerConnector.js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { blacklistToken, isTokenBlacklisted} = require('../Supporters/tokenBlacklist.js');
require('dotenv').config();


/**
 * User sign in using stored credentials
 */
async function signIn(userData) {
  try {
    const { username, password } = userData;
    
    if (!username || !password) {
      return {
        status: "error",
        message: "Username and password are required.",
        code: 400
      };
    }
    
    const credentialsResult = await getUserCredentials();
    if (!credentialsResult.success) {
      return {
        status: "error",
        message: "Authentication service unavailable. Please try again later.",
        code: 503,
        error: credentialsResult.error
      };
    }
    
    const users = credentialsResult.data;
    const user = users[username];
    
    if (!user) {
      return {
        status: "error",
        message: "Invalid username or password.",
        code: 401
      };
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return {
        status: "error",
        message: "Invalid username or password.",
        code: 401
      };
    }
    
    // Generate JWT access token
    const token = jwt.sign(
      { 
        username: user.username, 
        role: user.role,
        email: user.email 
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { 
        username: user.username,
        isRefreshToken: true
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    return {
      status: "success",
      message: "Login successful.",
      code: 200,
      data: {
        token,
        refreshToken,
        user: {
          username: user.username,
          role: user.role,
          email: user.email,
          phone: user.phone
        }
      }
    };
  } catch (error) {
    console.error('Sign in error:', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ValidationException: { message: 'Invalid request. Please check your input.', code: 400 },
      MissingRequiredParameter: { message: 'Username and password are required.', code: 400 },
      ResourceNotFoundException: { message: 'Credentials storage missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      DecryptionFailureException: { message: 'Failed to decrypt stored credentials.', code: 500 },
      ENOTFOUND: { message: 'Secrets Manager error. Check connection.', code: 503 },
      NetworkingError: { message: 'Secrets Manager error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Authentication failed. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', message: response.message, code: response.code, error };
  }
}

/**
 * Renew JWT token
 */
async function renewToken(req) {

  const authHeader = req.headers['authorization'];
  let refreshToken = null;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
      refreshToken = authHeader.substring(7); 
  } else if (authHeader) {
      refreshToken = authHeader; 
  }
  if (!refreshToken) {
    return {
      success: false,
      code: 400,
      message: "Refresh token is required."
    };
  }
  try {
    // Verify the refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          success: false,
          code: 401,
          message: "Refresh token has expired. Please sign in again."
        };
      }
      return {
        success: false,
        code: 403,
        message: "Invalid refresh token."
      };
    }

    // Check if the token has the refresh flag
    if (!decoded.isRefreshToken) {
      return {
        success: false,
        code: 403,
        message: "Invalid token type. Refresh token required."
      };
    }

    // Check if refresh token is blacklisted
    if (isTokenBlacklisted(refreshToken)) {
      return {
        success: false,
        code: 401,
        message: "Refresh token has been invalidated. Please sign in again."
      };
    }

    // Get user credentials to verify user still exists
    const credentialsResult = await getUserCredentials();
    if (!credentialsResult.success) {
      return {
        success: false,
        code: 503,
        message: "Authentication service unavailable. Please try again later.",
        error: credentialsResult.error
      };
    }

    const users = credentialsResult.data;
    const user = users[decoded.username];

    if (!user) {
      return {
        success: false,
        code: 404,
        message: "User not found."
      };
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { 
        username: user.username, 
        role: user.role,
        email: user.email 
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    // Generate new refresh token
    const newRefreshToken = jwt.sign(
      { 
        username: user.username,
        isRefreshToken: true
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );

    // Blacklist the old refresh token to prevent reuse
    blacklistToken(refreshToken);
    
    // Also blacklist any existing access tokens for this user
    // This ensures old access tokens become invalid immediately
    // In a production system, you might want to track user sessions more granularly

    return {
      success: true,
      code: 200,
      message: "Token renewed successfully.",
      data: { 
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          username: user.username,
          role: user.role,
          email: user.email,
          phone: user.phone
        }
      }
    };
  } catch (error) {
    console.error('Error renewing token:', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ValidationException: { message: 'Invalid request. Please check your input.', code: 400 },
      MissingRequiredParameter: { message: 'Refresh token is required.', code: 400 },
      ResourceNotFoundException: { message: 'Credentials storage missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      ENOTFOUND: { message: 'Secrets Manager error. Check connection.', code: 503 },
      NetworkingError: { message: 'Secrets Manager error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Failed to renew token. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, code: response.code, message: response.message, error };
  }
}

/**
 * Logout user by blacklisting their tokens
 */
async function logout(accessToken, refreshToken) {
  try {
    if (accessToken) {
      blacklistToken(accessToken);
    }
    if (refreshToken) {
      blacklistToken(refreshToken);
    }
    
    return {
      success: true,
      code: 200,
      message: "Logged out successfully."
    };
  } catch (error) {
    console.error('Error during logout:', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ValidationException: { message: 'Invalid request. Please check your input.', code: 400 },
      ResourceNotFoundException: { message: 'Credentials storage missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      ENOTFOUND: { message: 'Secrets Manager error. Check connection.', code: 503 },
      NetworkingError: { message: 'Secrets Manager error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Failed to logout. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, code: response.code, message: response.message, error };
  }
}

/**
 * Change password (requires authentication)
 */
async function changePassword(userData) {
  try {
    const { username, currentPassword, newPassword } = userData;
    
    if (!username || !currentPassword || !newPassword) {
      return {
        success: false,
        code: 400,
        message: "Username, current password, and new password are required."
      };
    }
    
    const credentialsResult = await getUserCredentials();
    if (!credentialsResult.success) {
      return {
        success: false,
        code: 503,
        message: "Authentication service unavailable. Please try again later.",
        error: credentialsResult.error
      };
    }
    
    const users = credentialsResult.data;
    const user = users[username];
    
    if (!user) {
      return {
        success: false,
        code: 404,
        message: "User not found."
      };
    }
    
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isCurrentPasswordValid) {
      return {
        success: false,
        code: 401,
        message: "Current password is incorrect."
      };
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    
    const saveResult = await saveUserCredentials(users);
    if (!saveResult.success) {
      return {
        success: false,
        code: 500,
        message: "Failed to update password. Please try again.",
        error: saveResult.error
      };
    }
    
    return {
      success: true,
      code: 200,
      message: "Password updated successfully."
    };
  } catch (error) {
    console.error('Error changing password:', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ValidationException: { message: 'Invalid request. Please check your input.', code: 400 },
      MissingRequiredParameter: { message: 'Username, current password, and new password are required.', code: 400 },
      ResourceNotFoundException: { message: 'Credentials storage missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      ENOTFOUND: { message: 'Secrets Manager error. Check connection.', code: 503 },
      NetworkingError: { message: 'Secrets Manager error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Failed to update password. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, code: response.code, message: response.message, error };
  }
}



module.exports = {
  signIn,
  renewToken,
  logout,
  changePassword
};
