/*
  Frontend-friendly single function to decrypt license payloads.
  Copy this function into your web app. No imports/exports needed.

  Usage:
    // If you have sealed_payload (string: v1:...)
    const data = await decryptLicensePayload(sealed_payload, password);

    // If you have encrypted_payload (object with iv/salt/tag/ciphertext/...)
    const data = await decryptLicensePayload(encrypted_payload, password);
*/
async function decryptLicensePayload(input, password) {
  const b64ToBytes = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  // Derive AES-GCM 256 key via PBKDF2
  async function deriveKey(pass, saltBytes, iterations, hashName) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    const hash = (hashName || 'sha256').toUpperCase().replace('SHA-', 'SHA-'); // 'sha256' -> 'SHA-256'
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: iterations || 150000, hash: hash || 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
  }

  // Case 1: compact string 'v1:' + base64(salt||iv||tag||ciphertext)
  if (typeof input === 'string') {
    const compact = input.startsWith('v1:') ? input.slice(3) : input;
    const buf = b64ToBytes(compact);
    if (buf.length < 16 + 12 + 16) throw new Error('Invalid sealed payload');
    const salt = buf.slice(0, 16);
    const iv = buf.slice(16, 28);
    const tag = buf.slice(28, 44);
    const ciphertext = buf.slice(44);

    // WebCrypto expects ciphertext||tag
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);

    const key = await deriveKey(password, salt, 150000, 'SHA-256');
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, combined);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(plainBuf)));
  }

  // Case 2: verbose object { iv, salt, tag, ciphertext, iterations, digest }
  if (input && typeof input === 'object') {
    const iterations = input.iterations || 150000;
    const digest = (input.digest || 'sha256').toUpperCase().replace('SHA-', 'SHA-');
    const iv = b64ToBytes(input.iv);
    const salt = b64ToBytes(input.salt);
    const tag = b64ToBytes(input.tag);
    const ct = b64ToBytes(input.ciphertext);

    const combined = new Uint8Array(ct.length + tag.length);
    combined.set(ct, 0);
    combined.set(tag, ct.length);

    const key = await deriveKey(password, salt, iterations, digest);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, combined);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(plainBuf)));
  }

  throw new Error('Unsupported input for decryption');
}


