#!/usr/bin/env node
/**
 * Generate a Firebase ID token for local testing.
 * Requires FIREBASE_ADMIN_SDK_KEY env var (path to service account JSON)
 * Usage: node test-auth-token.js <uid>
 */

import admin from 'firebase-admin';
import fs from 'fs';

const uid = process.argv[2] || 'test-user-123';
const keyPath = process.env.FIREBASE_ADMIN_SDK_KEY;

if (!keyPath) {
  console.error('ERROR: Set FIREBASE_ADMIN_SDK_KEY=/path/to/serviceAccountKey.json');
  process.exit(1);
}

if (!fs.existsSync(keyPath)) {
  console.error(`ERROR: Service account key not found at ${keyPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

admin
  .auth()
  .createCustomToken(uid)
  .then((token) => {
    console.log('Custom Token (for frontend sign-in):');
    console.log(token);
    console.log('\nTo get ID token, use custom token to sign in on frontend first.');
    console.log('OR use Firebase REST to exchange custom token for ID token:');
    console.log(`\ncurl -X POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=YOUR_API_KEY \\`);
    console.log(`  -d '{"token":"${token}","returnSecureToken":true}'`);
  })
  .catch((err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
