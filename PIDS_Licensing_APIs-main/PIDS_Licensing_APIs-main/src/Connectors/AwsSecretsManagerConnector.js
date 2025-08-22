const { 
  SecretsManagerClient, 
  GetSecretValueCommand, 
  PutSecretValueCommand, 
  CreateSecretCommand,
  //UpdateSecretCommand,
  DescribeSecretCommand
} = require('@aws-sdk/client-secrets-manager');
const { aws_remote_config, requestHandler } = require('./config');
require('dotenv').config();

// Initialize Secrets Manager client with shared keep-alive handler
const secretsClient = new SecretsManagerClient({
  region: aws_remote_config.region,
  credentials: aws_remote_config.accessKeyId && aws_remote_config.secretAccessKey ? {
    accessKeyId: aws_remote_config.accessKeyId,
    secretAccessKey: aws_remote_config.secretAccessKey
  } : undefined,
  requestHandler
});

// Secret configurations
const SECRETS_CONFIG = {
  USER_CREDENTIALS: {
    name: 'pids-user-credentials',
    description: 'PIDS user credentials and authentication data'
  }
};

/**
 * Get secret value from AWS Secrets Manager
 * @param {string} secretName - Name of the secret
 * @returns {Object} - Success/error response with secret data
 */
async function getSecret(secretName) {
  try {
    // Basic in-memory cache for secrets (short TTL)
    if (!global.__SECRETS_CACHE__) {
      global.__SECRETS_CACHE__ = new Map();
    }
    const cacheKey = secretName;
    const entry = global.__SECRETS_CACHE__.get(cacheKey);
    const now = Date.now();
    const TTL_MS = 60_000; // 60 seconds cache
    if (entry && (now - entry.ts) < TTL_MS) {
      return { success: true, code: 200, message: 'Secret retrieved from cache.', data: entry.value };
    }
    const command = new GetSecretValueCommand({
      SecretId: secretName
    });
    
    const response = await secretsClient.send(command);
    
    if (response.SecretString) {
      const parsed = JSON.parse(response.SecretString);
      global.__SECRETS_CACHE__.set(cacheKey, { ts: now, value: parsed });
      return {
        success: true,
        code: 200,
        message: "Secret retrieved successfully.",
        data: parsed
      };
    }
    
    return {
      success: false,
      code: 404,
      message: "Secret data not found.",
      error: "Empty secret string"
    };
  } catch (error) {
    console.error('Error getting secret:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      return {
        success: false,
        code: 404,
        message: "Secret not found. It may need to be created first.",
        error: error.name
      };
    }
    
    if (error.name === 'DecryptionFailureException') {
      return {
        success: false,
        code: 500,
        message: "Failed to decrypt secret. Check AWS permissions.",
        error: error.name
      };
    }
    
    if (error.name === 'AccessDeniedException') {
      return {
        success: false,
        code: 403,
        message: "Access denied. Check AWS IAM permissions for Secrets Manager.",
        error: error.name
      };
    }
    
    return {
      success: false,
      code: 500,
      message: "Failed to retrieve secret. Please try again later.",
      error: error.message
    };
  }
}

/**
 * Create a new secret in AWS Secrets Manager
 * @param {string} secretName - Name of the secret
 * @param {Object} secretData - Data to store in the secret
 * @param {string} description - Description of the secret
 * @returns {Object} - Success/error response
 */
async function createSecret(secretName, secretData, description = '') {
  try {
    const command = new CreateSecretCommand({
      Name: secretName,
      SecretString: JSON.stringify(secretData),
      Description: description
    });
    
    await secretsClient.send(command);
    
    return {
      success: true,
      code: 201,
      message: "Secret created successfully.",
      data: { secretName }
    };
  } catch (error) {
    console.error('Error creating secret:', error);
    
    if (error.name === 'ResourceExistsException') {
      return {
        success: false,
        code: 409,
        message: "Secret already exists. Use update operation instead.",
        error: error.name
      };
    }
    
    if (error.name === 'AccessDeniedException') {
      return {
        success: false,
        code: 403,
        message: "Access denied. Check AWS IAM permissions for Secrets Manager.",
        error: error.name
      };
    }
    
    if (error.name === 'LimitExceededException') {
      return {
        success: false,
        code: 429,
        message: "AWS Secrets Manager limit exceeded. Please contact support.",
        error: error.name
      };
    }
    
    return {
      success: false,
      code: 500,
      message: "Failed to create secret. Please try again later.",
      error: error.message
    };
  }
}

/**
 * Update an existing secret in AWS Secrets Manager
 * @param {string} secretName - Name of the secret
 * @param {Object} secretData - New data to store in the secret
 * @returns {Object} - Success/error response
 */
async function updateSecret(secretName, secretData) {
  try {
    const command = new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: JSON.stringify(secretData)
    });
    
    await secretsClient.send(command);
    // Invalidate cache for this secret
    if (global.__SECRETS_CACHE__) {
      global.__SECRETS_CACHE__.delete(secretName);
    }
    
    return {
      success: true,
      code: 200,
      message: "Secret updated successfully.",
      data: { secretName }
    };
  } catch (error) {
    console.error('Error updating secret:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      return {
        success: false,
        code: 404,
        message: "Secret not found. Create the secret first.",
        error: error.name
      };
    }
    
    if (error.name === 'AccessDeniedException') {
      return {
        success: false,
        code: 403,
        message: "Access denied. Check AWS IAM permissions for Secrets Manager.",
        error: error.name
      };
    }
    
    return {
      success: false,
      code: 500,
      message: "Failed to update secret. Please try again later.",
      error: error.message
    };
  }
}

/**
 * Check if a secret exists
 * @param {string} secretName - Name of the secret
 * @returns {Object} - Success/error response with existence status
 */
async function secretExists(secretName) {
  try {
    const command = new DescribeSecretCommand({
      SecretId: secretName
    });
    
    await secretsClient.send(command);
    
    return {
      success: true,
      code: 200,
      message: "Secret exists.",
      data: { exists: true }
    };
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return {
        success: true,
        code: 200,
        message: "Secret does not exist.",
        data: { exists: false }
      };
    }
    
    console.error('Error checking secret existence:', error);
    return {
      success: false,
      code: 500,
      message: "Failed to check secret existence.",
      error: error.message
    };
  }
}

/**
 * Get user credentials from AWS Secrets Manager
 * @returns {Object} - Success/error response with user credentials
 */
async function getUserCredentials() {
  const secretName = SECRETS_CONFIG.USER_CREDENTIALS.name;
  const result = await getSecret(secretName);
  
  if (!result.success && result.code === 404) {
    // Secret doesn't exist, create it with default admin user
    console.log('User credentials secret not found. Creating default admin user...');
    return await createDefaultUserCredentials();
  }
  
  return result;
}

/**
 * Save user credentials to AWS Secrets Manager
 * @param {Object} users - User credentials object
 * @returns {Object} - Success/error response
 */
async function saveUserCredentials(users) {
  const secretName = SECRETS_CONFIG.USER_CREDENTIALS.name;
  return await updateSecret(secretName, users);
}

/**
 * Create default user credentials secret with admin user
 * @returns {Object} - Success/error response with default users
 */
async function createDefaultUserCredentials() {
  try {
    const bcrypt = require('bcryptjs');
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    
    const defaultUsers = {
      admin: {
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@pids.com',
        phone: process.env.DEFAULT_ADMIN_PHONE || '+1234567890',
        createdAt: new Date().toISOString()
      }
    };
    
    const secretName = SECRETS_CONFIG.USER_CREDENTIALS.name;
    const description = SECRETS_CONFIG.USER_CREDENTIALS.description;
    
    const createResult = await createSecret(secretName, defaultUsers, description);
    
    if (createResult.success) {
      console.log('Default admin user created successfully');
      console.log(`Default credentials: admin / ${defaultPassword}`);
      
      return {
        success: true,
        code: 201,
        message: "Default admin user created successfully.",
        data: defaultUsers
      };
    }
    
    return createResult;
  } catch (error) {
    console.error('Error creating default user credentials:', error);
    return {
      success: false,
      code: 500,
      message: "Failed to create default user credentials.",
      error: error.message
    };
  }
}

// /**
//  * Initialize secrets manager and ensure required secrets exist
//  * @returns {Object} - Success/error response
//  */
// async function initializeSecrets() {
//   try {
//     console.log('Initializing AWS Secrets Manager...');
    
//     // Check if user credentials secret exists
//     const userCredsExist = await secretExists(SECRETS_CONFIG.USER_CREDENTIALS.name);
    
//     if (!userCredsExist.data.exists) {
//       console.log('Creating default user credentials...');
//       const createResult = await createDefaultUserCredentials();
      
//       if (!createResult.success) {
//         return {
//           success: false,
//           code: 500,
//           message: "Failed to initialize user credentials.",
//           error: createResult.error
//         };
//       }
//     }
    
//     return {
//       success: true,
//       code: 200,
//       message: "Secrets Manager initialized successfully."
//     };
//   } catch (error) {
//     console.error('Error initializing secrets:', error);
//     return {
//       success: false,
//       code: 500,
//       message: "Failed to initialize Secrets Manager.",
//       error: error.message
//     };
//   }
// }

module.exports = {
  getSecret,
  createSecret,
  updateSecret,
  secretExists,
  getUserCredentials,
  saveUserCredentials,
  createDefaultUserCredentials,
//   initializeSecrets,
//   SECRETS_CONFIG
};
