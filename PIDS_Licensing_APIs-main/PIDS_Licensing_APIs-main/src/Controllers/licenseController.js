const {
  createLicence_ddb,
  updateLicence_ddb,
  deleteLicence_ddb,
  getLicencesCount,
  getLicencesByCustomer,
  getLicenceInfo_ddb,
  getAllLicenses_ddb,
  activateLicense_ddb,
  getLicence_ddb
} = require('../Connectors/AwsDynamoDBConnector.js');
const { generatePassword } = require('../Supporters/genPass.js');
const { createLicensePDF } = require('./pdfController.js');
const { sendEmailWithAttachment } = require('./emailController.js');
const jwt = require('jsonwebtoken');
const { encryptPayloadWithPassword, sealPayload } = require('../Supporters/encryption.js');
require('dotenv').config();

// Simple in-memory lock to prevent duplicate rapid submissions
// Keyed by a deterministic combination of request fields
const createLicenceLocks = new Map();
const CREATE_LOCK_TTL_MS = 10000; // 10 seconds


// Generate license data and system ID
async function generateLicenseData(body) {
  const { customer_name, site_name, device_count, validity, email, description, file_url } = body;
  const cust_name_sysID = customer_name.slice(0, 3).toUpperCase();
  const site_name_sysID = site_name.slice(0, 2).toUpperCase();
  const numOfExisting_Licenses = await getLicencesCount(customer_name);
  const incrementedLicenseCount = numOfExisting_Licenses + 1;

  const formatLicenseCount = (count) => {
    if (count < 10) {
      return `CS${count}`;  
    } else if (count < 100) {
      return `C${count}`;   
    } else {
      return count.toString(); 
    }
  };
  
  const formatted_license_count = formatLicenseCount(incrementedLicenseCount);
  const currentDate = new Date();
  const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
  const year = currentDate.getFullYear();
  const sys_id_date = `${month}${year}`;
  const generated_date = currentDate.toISOString().split('T')[0];
  const system_id = `CFS30_${cust_name_sysID}_${site_name_sysID}${formatted_license_count}_${sys_id_date}${device_count}`;
  const password = generatePassword();
  
  return {
    customer_name,
    site_name,
    device_count,
    validity,
    email,
    description,
    file_url,
    system_id,
    password,
    generated_date,
    activated_date: null,
    licence_state: 0
  };
}

// Save license to database
async function saveLicenseToDatabase(licenseData) {
  const { customer_name, system_id, site_name, device_count, generated_date, validity, activated_date, email, licence_state, password, description, file_url } = licenseData;
  return await createLicence_ddb(customer_name, system_id, site_name, device_count, generated_date, validity, activated_date, email, licence_state, password, description, file_url);
}

// Generate license PDF
async function generateLicensePDF(licenseData) {
  console.log('Creating PDF document...');
  const pdfPath = await createLicensePDF(licenseData.customer_name, licenseData.system_id, licenseData.password);
  console.log('PDF created successfully at:', pdfPath);
  return pdfPath;
}

// Send license email
async function sendLicenseEmail(licenseData, pdfPath) {
  const subject = "Your License Activation Credentials for Crown Fence Solar License.";
  const mail_body = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <style>
          body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
          }
          .credentials {
              background-color: #f4f4f4;
              border: 1px solid #ddd;
              padding: 15px;
              margin: 15px 0;
              border-radius: 5px;
          }
          .credential-label {
              font-weight: bold;
              margin-right: 10px;
          }
          .logo {
              text-align: center;
              margin-bottom: 20px;
              color: #2c3e50;
          }
          .footer {
              margin-top: 20px;
              font-size: 0.9em;
              color: #666;
              border-top: 1px solid #eee;
              padding-top: 10px;
          }
      </style>
  </head>
  <body>
      <div class="logo">
          <h2>Crown Fence Solar</h2>
      </div>
      
      <p>Dear ${licenseData.customer_name},</p>
      
      <p>Thank you for choosing Crown Fence Solar. To activate your license, please use the credentials in the attached PDF.</p>
      
      <div class="credentials">
          <p><span class="credential-label">System ID:</span> ${licenseData.system_id}</p>
          <p><span class="credential-label">Password:</span> ${licenseData.password}</p>
      </div>
      
      <p>Please keep these credentials secure and do not share them with anyone.</p>
      
      <div class="footer">
          <p>Thank you.<br>
          Best regards,<br>
          Crown Fence Solar Support Team</p>
      </div>
  </body>
  </html>
  `;

  console.log('Sending email...');
  await sendEmailWithAttachment(licenseData.email, subject, mail_body, pdfPath);
  console.log('Email sent successfully to:', licenseData.email);
}

async function createLicence(body) {
  try {
    // Soft duplicate prevention by recent similar existing license
    // Fetch licenses for this customer and check for same site_name + device_count + validity
    try {
      const existing = await getLicencesByCustomer(body.customer_name);
      const dup = existing.find(l =>
        l.SiteName === body.site_name &&
        String(l.DeviceCount) === String(body.device_count) &&
        String(l.Validity) === String(body.validity) &&
        l.Email === body.email
      );
      if (dup) {
        return {
          success: false,
          code: 409,
          message: 'A similar license already exists for this customer.'
        };
      }
    } catch (_) {
      // Non-fatal; continue
    }
    // Idempotency/duplicate-click guard
    const lockKey = [
      body.customer_name,
      body.site_name,
      body.device_count,
      body.validity,
      body.email,
      body.description,
      body.file_url
    ].join('|');
    const now = Date.now();
    const lastAt = createLicenceLocks.get(lockKey);
    if (lastAt && (now - lastAt) < CREATE_LOCK_TTL_MS) {
      return {
        success: false,
        code: 409,
        message: 'A similar license create request was just submitted. Please wait a few seconds and try again.'
      };
    }
    createLicenceLocks.set(lockKey, now);
    // Auto-expire the lock after TTL
    setTimeout(() => {
      try { createLicenceLocks.delete(lockKey); } catch (_) {}
    }, CREATE_LOCK_TTL_MS);

    // Generate license data
    const licenseData = await generateLicenseData(body);
    console.log(licenseData.system_id);
    
    // Save to database
    const res = await saveLicenseToDatabase(licenseData);
    
    // Generate PDF and send email asynchronously to reduce latency
    setImmediate(async () => {
      try {
        const pdfPath = await generateLicensePDF(licenseData);
        await sendLicenseEmail(licenseData, pdfPath);
      } catch (bgErr) {
        console.error('Background email/PDF task failed:', bgErr);
      }
    });

    // Build an encrypted payload that the frontend can decrypt using the provided password
    const payloadForClient = {
      customer_name: licenseData.customer_name,
      system_id: licenseData.system_id,
      site_name: licenseData.site_name,
      device_count: licenseData.device_count,
      validity: licenseData.validity,
      email: licenseData.email,
      generated_date: licenseData.generated_date
    };
    const encrypted_payload = encryptPayloadWithPassword(payloadForClient, licenseData.password);
    const sealed_payload = sealPayload(payloadForClient, licenseData.password);
    
    return {
      status: 'success',
      success: true,
      code: 200,
      message: 'License created successfully. An email with credentials has been sent.',
      license_data: res,
      encrypted_payload,
      sealed_payload
    };
  } catch (error) {
    console.error('Error while creating license:', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ConditionalCheckFailedException: {
        message: 'A licence with this Customer Name and System ID already exists.',
        code: 409
      },
      ValidationException: {
        message: 'Invalid request. Please verify the provided fields.',
        code: 400
      },
      MissingRequiredParameter: {
        message: 'Required fields are missing. Please fill all mandatory fields.',
        code: 400
      },
      ResourceNotFoundException: {
        message: 'License table missing. Contact admin.',
        code: 404
      },
      ProvisionedThroughputExceededException: {
        message: 'Too many requests. Try later.',
        code: 429
      },
      ThrottlingException: {
        message: 'Slow down. Try again soon.',
        code: 429
      },
      RequestLimitExceeded: {
        message: 'AWS limit reached. Try shortly.',
        code: 429
      },
      AccessDeniedException: {
        message: 'Access denied. Contact admin.',
        code: 403
      },
      ENOTFOUND: {
        message: 'DynamoDB error. Check connection.',
        code: 503
      },
      NetworkingError: {
        message: 'DynamoDB error. Check connection.',
        code: 503
      },
      InternalServerError: {
        message: 'Server error. Try again later.',
        code: 500
      }
    };
    const fallback = { message: 'License creation failed. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, message: response.message, code: response.code, error };
  }
}

async function updateLicence(query, body) {
  const { customer_name, system_id } = query;
  try {
    const password = generatePassword();
    const update_payload = {
      SiteName: body.site_name,
      DeviceCount: body.device_count,
      Validity: body.validity,
      Email: body.email,
      password: password,
      description: body.description,
      file_url: body.file_url
    };
    
    const resp = await updateLicence_ddb(customer_name, system_id, update_payload);

    // Create PDF and send email asynchronously
    const subject = "Your License Activation Credentials for Crown Fence Solar License.";
    const mail_body = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }
            .credentials {
                background-color: #f4f4f4;
                border: 1px solid #ddd;
                padding: 15px;
                margin: 15px 0;
                border-radius: 5px;
            }
            .credential-label {
                font-weight: bold;
                margin-right: 10px;
            }
            .logo {
                text-align: center;
                margin-bottom: 20px;
                color: #2c3e50;
            }
            .footer {
                margin-top: 20px;
                font-size: 0.9em;
                color: #666;
                border-top: 1px solid #eee;
                padding-top: 10px;
            }
        </style>
    </head>
    <body>
        <div class="logo">
            <h2>Crown Fence Solar</h2>
        </div>
        
        <p>Dear ${customer_name},</p>
        
        <p>Thank you for choosing Crown Fence Solar. To activate your license, please use the following credentials:</p>
        
        <div class="credentials">
            <p><span class="credential-label">System ID:</span> ${system_id}</p>
            <p><span class="credential-label">Password:</span> ${password}</p>
        </div>
        
        <p>Please keep these credentials secure and do not share them with anyone.</p>
        
        <div class="footer">
            <p>Thank you.<br>
            Best regards,<br>
            Crown Fence Solar Support Team</p>
        </div>
    </body>
    </html>
    `;

    setImmediate(async () => {
      try {
        console.log('Creating PDF document...');
        const pdfPath = await createLicensePDF(customer_name, system_id, password);
        console.log('PDF created successfully at:', pdfPath);
        console.log('Sending email...');
        await sendEmailWithAttachment(body.email, subject, mail_body, pdfPath);
        console.log('Email sent successfully to:', body.email);
      } catch (bgErr) {
        console.error('Background email/PDF task failed (update):', bgErr);
      }
    });
    
    return {
      success: true,
      code: 200,
      message: "License updated successfully. New credentials have been sent to your email.",
      license_data: resp
    };
  } catch (error) {
    if (error && error.code === 'NOT_FOUND') {
      return { status: 'rejected', success: false, code: 404, message: 'License not found. It may have been deleted.', error };
    }
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ValidationException: { message: 'Invalid input. Please check your fields.', code: 400 },
      MissingRequiredParameter: { message: 'Required fields are missing.', code: 400 },
      ResourceNotFoundException: { message: 'License table missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      ENOTFOUND: { message: 'DynamoDB error. Check connection.', code: 503 },
      NetworkingError: { message: 'DynamoDB error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Failed to update license. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, message: response.message, code: response.code, error };
  }
}

async function deleteLicence(query) {
  try {
    const resp = await deleteLicence_ddb(query.customer_name, query.system_id);
    // If we reach here, delete succeeded
    console.log("License deleted successfully.");
    return {
      success: true,
      code: 200,
      message: "License deleted successfully."
    };
  } catch (error) {
    if (error && error.code === 'NOT_FOUND') {
      return { status: 'rejected', success: false, code: 404, message: 'License not found. It may have already been deleted.', error };
    }
    console.error('License deletion failed! Error', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ResourceNotFoundException: { message: 'License table missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      ENOTFOUND: { message: 'DynamoDB error. Check connection.', code: 503 },
      NetworkingError: { message: 'DynamoDB error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Failed to delete license. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, message: response.message, code: response.code, error };
  }
}

async function getLicenceInfo() {  
  try {
    const lic_info = await getLicenceInfo_ddb();
    console.log("Fetched license info successfully");
    return {
      success: true,
      code: 200,
      message: "License information retrieved successfully.",
      lic_info: lic_info
    };
  } catch (error) {
    console.error('Failed to fetch license info! Error:', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ResourceNotFoundException: { message: 'License table missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      ENOTFOUND: { message: 'DynamoDB error. Check connection.', code: 503 },
      NetworkingError: { message: 'DynamoDB error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Failed to retrieve license information. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, message: response.message, code: response.code, error };
  }
}

async function getAllLicenses() {
  try {
    const licenses = await getAllLicenses_ddb();
    console.log("Fetched all the licenses.");
    return {
      success: true,
      code: 200,
      message: "All licenses retrieved successfully.",
      licenses: licenses
    };
  } catch (error) {
    console.error('Fetching all licenses failed! Error', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ResourceNotFoundException: { message: 'License table missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      ENOTFOUND: { message: 'DynamoDB error. Check connection.', code: 503 },
      NetworkingError: { message: 'DynamoDB error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Failed to retrieve licenses. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, message: response.message, code: response.code, error };
  }
}

async function activateLicense(body) {
  try {
    const lic_info = await getLicence_ddb(body.system_id);
    console.log(lic_info);
    
    if (lic_info.Password != body.password) {
      return {
        success: false,
        code: 401,
        message: 'Invalid password. Please check your credentials and try again.'
      };
    }
    
    const currentDate = new Date();
    const validTillDate = new Date(currentDate); // Clone the date
    validTillDate.setMonth(validTillDate.getMonth() + lic_info.Validity);
    const validTillString = validTillDate.toISOString().split('T')[0];
    console.log(validTillString);
    
    const resp = await activateLicense_ddb(lic_info.Customer_Names, body.system_id, null, null);
    resp.valid_till = validTillString;
    
    const keysToRemove = ['Password', 'Validity', 'ActivatedDate', 'GeneratedDate', 'LicenceState', 'Email'];
    keysToRemove.forEach(key => delete resp[key]);
    
    console.log("License activation successful.");
    return {
      success: true,
      code: 200,
      message: "License activated successfully.",
      activation_res: resp
    };
  } catch (error) {
    console.error('License activation failed! Error', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ResourceNotFoundException: { message: 'License table missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      ENOTFOUND: { message: 'DynamoDB error. Check connection.', code: 503 },
      NetworkingError: { message: 'DynamoDB error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Failed to activate license. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, message: response.message, code: response.code, error };
  }
}

async function generateToken(body) {
  try {
    console.log("Inside generateToken func:", body.customer_name, body.system_id);
    const resp = await getLicence_ddb(body.system_id);
    const currentDate = new Date();
    const validity = parseInt(JSON.stringify(currentDate).split('-')[1]);
    const validTillDate = new Date(currentDate); // Clone the date
    validTillDate.setMonth(validTillDate.getMonth() + validity);
    const validTillString = validTillDate.toISOString().split('T')[0];
    
    console.log("License activation successful.");
    const token = jwt.sign({ 
      customer_name: resp.Customer_Names, 
      site_name: resp.SiteName, 
      system_id: resp.System_ID, 
      valid_till: validTillString, 
      total_zones: resp.DeviceCount 
    }, process.env.JWT_SECRET, { expiresIn: '365d' });
    
    if (token) {
      await activateLicense_ddb(body.customer_name, body.system_id);
      const subject = "Your License Activation Token for Crown Fence Solar License.";
      const mail_body = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <style>
              body {
                  font-family: Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
              }
              .token {
                  background-color: #f4f4f4;
                  border: 1px solid #ddd;
                  padding: 10px;
                  margin: 15px 0;
                  word-break: break-all;
                  font-family: monospace;
              }
              .logo {
                  text-align: center;
                  margin-bottom: 20px;
              }
              .footer {
                  margin-top: 20px;
                  font-size: 0.9em;
                  color: #666;
              }
          </style>
      </head>
      <body>
          <div class="logo">
              <h2>Crown Fence Solar</h2>
          </div>
          
          <p>Dear ${body.customer_name},</p>
          
          <p>Thank you for choosing Crown Fence Solar. To activate your license, please use the TOKEN below:</p>
          
          <div class="token">
              ${token}
          </div>
          
          <p>Please keep this token secure and do not share it with anyone.</p>
          
          <div class="footer">
              <p>Thank you.<br>
              Best regards,<br>
              Crown Fence Solar Support Team</p>
          </div>
      </body>
      </html>
      `;
      await sendEmailWithAttachment(resp.Email, subject, mail_body, body.customer_name, token);
    }
    
    return {
      success: true,
      code: 200,
      message: "Token generated successfully. Check your email for the activation token.",
      token: token
    };
  } catch (error) {
    console.error('Token generation failed! Error', error);
    const errorType = error.name || error.__type || error.code || error.statusCode;
    const errorResponses = {
      ResourceNotFoundException: { message: 'License table missing. Contact admin.', code: 404 },
      ProvisionedThroughputExceededException: { message: 'Too many requests. Try later.', code: 429 },
      ThrottlingException: { message: 'Slow down. Try again soon.', code: 429 },
      RequestLimitExceeded: { message: 'AWS limit reached. Try shortly.', code: 429 },
      AccessDeniedException: { message: 'Access denied. Contact admin.', code: 403 },
      ENOTFOUND: { message: 'DynamoDB error. Check connection.', code: 503 },
      NetworkingError: { message: 'DynamoDB error. Check connection.', code: 503 },
      InternalServerError: { message: 'Server error. Try again later.', code: 500 }
    };
    const fallback = { message: 'Failed to generate token. Please try again later.', code: 500 };
    const response = errorResponses[errorType] || fallback;
    return { status: 'rejected', success: false, message: response.message, code: response.code, error };
  }
}

module.exports = {
  createLicence,
  updateLicence,
  deleteLicence,
  getLicenceInfo,
  getAllLicenses,
  activateLicense,
  generateToken
};
