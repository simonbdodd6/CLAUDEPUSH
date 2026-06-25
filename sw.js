// coacheseyeGPT service worker: receive push messages and record player replies.
// SW_VERSION is queried by the diagnostics panel to confirm the running build.
const SW_VERSION = '20260609.4';
const APP_URL = '/';

// Cache used to persist the push event log across page reloads and app restarts.
// Readable from the page via the 'read_push_log' message.
const LOG_CACHE = 'push-diag-v1';
const LOG_KEY   = 'push-event-log';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// Broadcast a message to all open windows (live diagnostics while app is open).
function broadcast(data) {
  return clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(wins => wins.forEach(w => w.postMessage({ timestamp: Date.now(), ...data })));
}

// Append an entry to the persistent push event log in the Cache API.
// This survives the page being closed so diagnostics can show what happened
// even when the notification fired with the iPhone screen locked.
async function logToCache(entry) {
  try {
    const cache = await caches.open(LOG_CACHE);
    const resp  = await cache.match(LOG_KEY).catch(() => null);
    const prev  = resp ? await resp.json().catch(() => []) : [];
    const log   = Array.isArray(prev) ? prev : [];
    log.unshift({ ts: Date.now(), ...entry });
    if (log.length > 30) log.length = 30;
    await cache.put(LOG_KEY, new Response(JSON.stringify(log), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch (_) {
    // logToCache must never throw — it runs inside critical push event handlers
  }
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    if (!event.data) {
      await logToCache({ stage: 'received_empty', error: 'push event had no data' });
      await broadcast({ type: 'push_diag', stage: 'received_empty', error: 'push event had no data' });
      return;
    }

    let payload;
    try { payload = event.data.json(); }
    catch (e) {
      payload = { title: 'coacheseyeGPT', body: event.data.text() };
      await logToCache({ stage: 'parse_error', error: e.message, raw: event.data.text().slice(0, 100) });
    }

    const title = String(payload.title || 'coacheseyeGPT').trim() || 'coacheseyeGPT';
    // iOS suppresses notifications with an empty body — use a non-breaking space as minimum.
    const body  = String(payload.body  || '').trim() || ' ';

    await logToCache({ stage: 'received', title, body: body.slice(0, 80) });
    await broadcast({ type: 'push_diag', stage: 'received', title, body: body.slice(0, 80) });

    const options = {
      body,
      // icon: iOS ignores this field (uses the app icon from the manifest instead).
      // badge: omitted — SVG badges cause silent failures on some iOS versions.
      icon:  '/icon.svg',
      tag:   payload.tag || 'coachseye-message',
      renotify: true,
      // requireInteraction is not supported on iOS; omit rather than pass false
      // to avoid any chance of a silent option-parsing error.
      data: {
        url:       payload.url      || APP_URL,
        type:      payload.type     || 'message',
        sessionId: payload.sessionId || 'game',
      },
    };
    // actions are not supported on iOS — only add them on platforms that support it.
    if (Array.isArray(payload.actions) && payload.actions.length) options.actions = payload.actions;

    await logToCache({ stage: 'show_calling', title, body: body.slice(0, 80), tag: options.tag });
    await broadcast({ type: 'push_diag', stage: 'show_calling', tag: options.tag });

    try {
      await self.registration.showNotification(title, options);
      await logToCache({ stage: 'show_resolved', title });
      await broadcast({ type: 'push_diag', stage: 'show_resolved' });
      await broadcast({ type: 'push_received', title });
    } catch (e) {
      await logToCache({ stage: 'show_error', error: e.message, title });
      await broadcast({ type: 'push_diag', stage: 'show_error', error: e.message });
    }
  })());
});

// Page-triggered SW notification test, version query, and push log read.
self.addEventListener('message', event => {
  if (event.data?.type === 'get_version') {
    (event.source || self).postMessage({ type: 'sw_version', version: SW_VERSION, timestamp: Date.now() });
    return;
  }
  if (event.data?.type === 'read_push_log') {
    caches.open(LOG_CACHE)
      .then(cache => cache.match(LOG_KEY).catch(() => null))
      .then(resp  => resp ? resp.json().catch(() => []) : [])
      .then(log   => {
        const target = event.source || self;
        target.postMessage({ type: 'push_log_data', log: Array.isArray(log) ? log : [], timestamp: Date.now() });
      })
      .catch(e => {
        const target = event.source || self;
        target.postMessage({ type: 'push_log_data', log: [], error: e.message, timestamp: Date.now() });
      });
    return;
  }
  if (event.data?.type === 'clear_push_log') {
    caches.open(LOG_CACHE)
      .then(cache => cache.delete(LOG_KEY))
      .catch(() => {});
    return;
  }
  if (event.data?.type === 'test_show_notification') {
    const title = event.data.title || 'SW Test Notification';
    const body  = event.data.body  || 'Service worker showNotification() test';
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      tag: 'sw-direct-test-' + Date.now(),
    }).then(() => {
      if (event.source) event.source.postMessage({ type: 'sw_notification_shown', timestamp: Date.now() });
    }).catch(e => {
      if (event.source) event.source.postMessage({ type: 'sw_notification_error', error: e.message, timestamp: Date.now() });
    });
  }
});

async function recordAvailability(response, sessionId) {
  const subscription = await self.registration.pushManager.getSubscription();
  if (!subscription?.endpoint) return false;
  const result = await fetch('/api/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint, response, sessionId }),
  });
  return result.ok;
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};
  const isResponse = ['available', 'unavailable', 'maybe'].includes(action);

  event.waitUntil((async () => {
    if (isResponse) {
      const saved = await recordAvailability(action, data.sessionId || 'game').catch(() => false);
      await self.registration.showNotification(saved ? 'Response recorded' : 'Open the app to respond', {
        body: saved ? 'Your coach can now see your availability.' : 'We could not save the response from this device.',
        icon: '/icon.svg',
        tag: 'availability-confirmation',
      });
    }
    const target = new URL(data.url || APP_URL, self.location.origin);
    if ((data.type || '').startsWith('availability')) target.searchParams.set('to', 'availability');
    if ((data.type || '').startsWith('training'))     target.searchParams.set('to', 'week');
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(windowClient => windowClient.url.startsWith(self.location.origin));
    if (existing) {
      if ((data.type || '').startsWith('availability')) existing.postMessage({ type: 'navigate', to: 'availability' });
      if ((data.type || '').startsWith('training'))     existing.postMessage({ type: 'navigate', to: 'week' });
      return existing.focus();
    }
    return clients.openWindow(target.href);
  })());
});
