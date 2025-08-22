const fs = require("fs");
const path = require("path");
const { sendEmail } = require('../Connectors/AwsSesConnector.js');

async function sendEmailWithAttachment(to, subject, htmlBody, pdfPath, textBody = null, from = 'support@cfs.embedpro.in') {
  try {
    // Create plain text version if not provided
    if (!textBody) {
      // Simple HTML to text conversion (basic)
      textBody = htmlBody.replace(/<[^>]*>/g, '')
                         .replace(/\s+/g, ' ')
                         .trim();
    }
    
    // Read the PDF file
    const fileContent = fs.readFileSync(pdfPath);
    const fileName = path.basename(pdfPath);
    
    // Define MIME type directly
    const mimeType = 'application/pdf';
    
    // Convert the file to base64
    const fileBase64 = fileContent.toString('base64');
    
    // Create the raw email message data
    const rawMessage = createRawEmail(from, to, subject, htmlBody, textBody, fileName, fileBase64, mimeType);
    
    // Create the params object correctly - only RawMessage goes here
    const params = {
      RawMessage: {
        Data: rawMessage
      }
    };
    
    // Send the email
    await sendEmail(params);
    console.log('Email with attachment sent successfully.');
    
    // Cleanup the temporary PDF file
    fs.unlinkSync(pdfPath);
    
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

/**
 * Create a raw email message with attachment
 */
function createRawEmail(from, to, subject, htmlBody, textBody, fileName, fileBase64, mimeType) {
  // Generate a boundary string for the MIME parts
  const boundary = `----EmailBoundary${Date.now()}`;
  
  // Construct email headers and body
  let message = [
    `From: ${from}`,
    `To: ${to}`,
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: multipart/alternative; boundary="alt-boundary"',
    '',
    '--alt-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    textBody,
    '',
    '--alt-boundary',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
    '',
    '--alt-boundary--',
    '',
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${fileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${fileName}"`,
    '',
    // Insert base64 data in chunks to avoid line length issues
    ...chunkBase64(fileBase64),
    '',
    `--${boundary}--`
  ].join('\r\n');
  
  return message;
}

/**
 * Split base64 string into chunks to avoid line length issues
 */
function chunkBase64(base64String) {
  const chunkSize = 76; // RFC 2045 recommended line length
  const chunks = [];
  
  for (let i = 0; i < base64String.length; i += chunkSize) {
    chunks.push(base64String.substring(i, i + chunkSize));
  }
  
  return chunks;
}

module.exports = {
  sendEmailWithAttachment
};
