const crypto = require('crypto');

// Derive a 32-byte key from a password using PBKDF2
function deriveKeyFromPassword(password, salt, iterations = 150000, digest = 'sha256') {
  return crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, digest);
}

// Encrypt a JSON payload using AES-256-GCM with a key derived from password
function encryptPayloadWithPassword(payloadObject, password) {
  const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
  const salt = crypto.randomBytes(16);
  const iterations = 150000;
  const digest = 'sha256';
  const key = deriveKeyFromPassword(password, salt, iterations, digest);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payloadObject), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    algorithm: 'aes-256-gcm',
    kdf: 'pbkdf2',
    iterations,
    digest,
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    tag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

// Compact format: base64(salt || iv || tag || ciphertext), optionally prefixed with 'v1:'
function sealPayload(payloadObject, password) {
  const iv = crypto.randomBytes(12);
  const salt = crypto.randomBytes(16);
  const iterations = 150000;
  const digest = 'sha256';
  const key = deriveKeyFromPassword(password, salt, iterations, digest);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payloadObject), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([salt, iv, tag, ciphertext]);
  return `v1:${packed.toString('base64')}`;
}

module.exports = {
  encryptPayloadWithPassword,
  sealPayload
};


