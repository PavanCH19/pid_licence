const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const { aws_remote_config, requestHandler } = require('./config.js');

const ses = new SESClient({
  region: aws_remote_config.region,
  credentials: aws_remote_config.accessKeyId && aws_remote_config.secretAccessKey ? {
    accessKeyId: aws_remote_config.accessKeyId,
    secretAccessKey: aws_remote_config.secretAccessKey
  } : undefined,
  requestHandler
});


// Function to send an email
async function sendEmail(params) {

  try {
    const command = new SendRawEmailCommand(params);
    const data = await ses.send(command);
    console.log('Email sent successfully:', data.MessageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}


// Example usage
// const recipientEmail = 'cmsathwik80@gmail.com';
// const subject = 'Test Email from CFS';
// const body = 'This is a test email sent from a CFS application using AWS SES.';


// sendEmail(recipientEmail, subject, body);

module.exports = {sendEmail};
