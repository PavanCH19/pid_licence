require('dotenv').config();
const http = require('http');
const https = require('https');
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');

// Build AWS config, only include credentials if provided to allow default provider chain
const awsRemoteConfig = {
  region: process.env.REGION || 'ap-south-1'
};

const resolvedAccessKeyId = process.env.ACCESSKEY_ID || process.env.AWS_ACCESS_KEY_ID;
const resolvedSecretAccessKey = process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

if (resolvedAccessKeyId && resolvedSecretAccessKey) {
  awsRemoteConfig.accessKeyId = resolvedAccessKeyId;
  awsRemoteConfig.secretAccessKey = resolvedSecretAccessKey;
}

module.exports = {
  aws_remote_config: awsRemoteConfig,
  // Reusable HTTP handler with keep-alive for all AWS SDK v3 clients
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 3000,
    socketTimeout: 5000,
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 50 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 })
  })
};