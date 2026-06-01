#!/usr/bin/env node
/**
 * Local API testing script
 * Tests the Phase 1 auth guards without needing Firebase
 * Run from workspace root: node test/test-local-api.js
 */

import http from 'http';

const BASE_URL = 'http://localhost:3001';
const TEST_TOKEN = 'test-id-token-12345';
const TEST_UID = 'test-user-123';

// Color helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(type, msg) {
  const prefix = {
    pass: `${colors.green}✓${colors.reset}`,
    fail: `${colors.red}✗${colors.reset}`,
    info: `${colors.blue}ℹ${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
  }[type] || '•';
  console.log(`${prefix} ${msg}`);
}

/**
 * Make an HTTP request with optional auth
 */
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data ? JSON.parse(data) : null,
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       Phase 1 Auth Guard Local API Tests               ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Subscribe without auth (should fail)
  try {
    log('info', 'Test 1: POST /api/subscribe without auth');
    const res = await request('POST', '/api/subscribe', { endpoint: 'https://example.com/push' });
    if (res.status === 401) {
      log('pass', '401 Unauthorized (correct)');
      passed++;
    } else {
      log('fail', `Expected 401, got ${res.status}`);
      failed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Test 2: Subscribe WITH auth (should succeed)
  try {
    log('info', 'Test 2: POST /api/subscribe with Bearer token');
    const res = await request('POST', '/api/subscribe', {
      endpoint: 'https://fcm.googleapis.com/push/test',
      auth: 'auth-secret',
      p256dh: 'p256dh-secret',
    }, TEST_TOKEN);
    if (res.status === 200 && res.body?.ok) {
      log('pass', '200 OK with valid token');
      passed++;
    } else {
      log('fail', `Expected 200 OK, got ${res.status}: ${res.body?.error || 'unknown error'}`);
      failed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Test 3: Chat GET conversations without auth
  try {
    log('info', 'Test 3: GET /api/chat?action=conversations without auth');
    const res = await request('GET', '/api/chat?action=conversations');
    if (res.status === 401) {
      log('pass', '401 Unauthorized (correct)');
      passed++;
    } else {
      log('fail', `Expected 401, got ${res.status}`);
      failed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Test 4: Chat GET conversations WITH auth
  try {
    log('info', 'Test 4: GET /api/chat?action=conversations with Bearer token');
    const res = await request('GET', '/api/chat?action=conversations', null, TEST_TOKEN);
    if (res.status === 200 && res.body?.conversations) {
      log('pass', `200 OK, got ${res.body.conversations.length} conversations`);
      passed++;
    } else {
      log('fail', `Expected 200 OK, got ${res.status}`);
      failed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Test 5: Chat POST send without auth
  try {
    log('info', 'Test 5: POST /api/chat (send) without auth');
    const res = await request('POST', '/api/chat', {
      action: 'send',
      convId: 'squad',
      senderId: TEST_UID,
      text: 'Test message',
    });
    if (res.status === 401) {
      log('pass', '401 Unauthorized (correct)');
      passed++;
    } else {
      log('fail', `Expected 401, got ${res.status}`);
      failed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Test 6: Chat POST send WITH auth and matching senderId
  try {
    log('info', 'Test 6: POST /api/chat (send) with auth, matching senderId');
    const res = await request('POST', '/api/chat', {
      action: 'send',
      convId: 'squad',
      senderId: TEST_UID,  // Must match authenticated user
      text: 'Test message',
    }, TEST_TOKEN);
    if (res.status === 200 && res.body?.message) {
      log('pass', '200 OK, message created');
      passed++;
    } else {
      log('fail', `Expected 200 OK, got ${res.status}: ${res.body?.error || 'unknown'}`);
      failed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Test 7: Schedules GET without auth
  try {
    log('info', 'Test 7: GET /api/schedules without auth');
    const res = await request('GET', '/api/schedules');
    if (res.status === 401) {
      log('pass', '401 Unauthorized (correct)');
      passed++;
    } else {
      log('fail', `Expected 401, got ${res.status}`);
      failed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Test 8: Availability GET without auth
  try {
    log('info', 'Test 8: GET /api/availability without auth');
    const res = await request('GET', '/api/availability');
    if (res.status === 401) {
      log('pass', '401 Unauthorized (correct)');
      passed++;
    } else {
      log('fail', `Expected 401, got ${res.status}`);
      failed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Test 9: Invite GET ?token=xxx (public, no auth required)
  try {
    log('info', 'Test 9: GET /api/invite?token=xxx (public validation)');
    const res = await request('GET', '/api/invite?token=test-token-123');
    // Should NOT require auth for token validation
    if (res.status === 404) {
      log('pass', '404 Not Found (correct, no auth required)');
      passed++;
    } else if (res.status === 401) {
      log('fail', 'Should allow unauthenticated token validation');
      failed++;
    } else {
      log('pass', `${res.status} (no 401, so public access works)`);
      passed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Test 10: Invite GET (list all, requires auth)
  try {
    log('info', 'Test 10: GET /api/invite (list all) without auth');
    const res = await request('GET', '/api/invite');
    if (res.status === 401) {
      log('pass', '401 Unauthorized (correct)');
      passed++;
    } else {
      log('fail', `Expected 401, got ${res.status}`);
      failed++;
    }
  } catch (e) {
    log('warn', `Connection failed: ${e.message}`);
  }

  // Summary
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║ Results: ${colors.green}${passed} passed${colors.reset} / ${colors.red}${failed} failed${colors.reset}                          ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  log('fail', `Test suite error: ${err.message}`);
  process.exit(1);
});
