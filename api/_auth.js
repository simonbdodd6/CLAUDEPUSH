import admin from 'firebase-admin';
import { getBearerToken } from './_http.js';

function firebaseCredentials() {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envJson) {
    try {
      return JSON.parse(envJson);
    } catch (error) {
      console.warn('[api/_auth] FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (clientEmail && privateKey && projectId) {
    return {
      clientEmail,
      privateKey: privateKey.replace(/\\\n/g, '\n'),
      projectId,
    };
  }

  return null;
}

function initFirebase() {
  if (admin.apps.length) return admin.app();
  const creds = firebaseCredentials();
  if (creds) {
    return admin.initializeApp({ credential: admin.credential.cert(creds) });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  return null;
}

function authConfigured() {
  return Boolean(firebaseCredentials() || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

async function verifyIdToken(idToken) {
  const app = initFirebase();
  if (!app) throw new Error('Firebase auth is not configured');
  return admin.auth().verifyIdToken(idToken);
}

function normalizeRole(claims) {
  const raw = String(claims?.role || (claims?.admin ? 'admin' : '') || 'player').toLowerCase();
  return raw;
}

export async function requireAuth(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' });
    return null;
  }

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (error) {
    console.error('[api/_auth] Token verification failed:', error.message);
    res.status(401).json({ error: 'Invalid or expired auth token' });
    return null;
  }

  return {
    uid: decoded.uid,
    role: normalizeRole(decoded),
    claims: decoded,
  };
}

export async function requireRole(req, res, allowedRoles) {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (!allowedRoles.includes(auth.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return auth;
}

export { authConfigured };
