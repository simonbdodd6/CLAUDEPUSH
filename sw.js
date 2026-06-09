// coacheseyeGPT service worker: receive push messages and record player replies.
// SW_VERSION is queried by the diagnostics panel to confirm the running build.
const SW_VERSION = '20260609.3';
const APP_URL = '/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// Broadcast a diagnostic event to all open windows.
function broadcast(data) {
  return clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(wins => wins.forEach(w => w.postMessage({ timestamp: Date.now(), ...data })));
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    if (!event.data) {
      await broadcast({ type: 'push_diag', stage: 'received_empty', error: 'push event had no data' });
      return;
    }

    let payload;
    try { payload = event.data.json(); }
    catch { payload = { title: 'coacheseyeGPT', body: event.data.text() }; }

    await broadcast({ type: 'push_diag', stage: 'received', title: payload.title || '', body: (payload.body || '').slice(0, 80) });

    const options = {
      body: payload.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.tag || 'coachseye-message',
      renotify: true,
      requireInteraction: payload.type === 'availability' || payload.type === 'availability-reminder',
      data: {
        url: payload.url || APP_URL,
        type: payload.type || 'message',
        sessionId: payload.sessionId || 'game',
      },
    };
    if (Array.isArray(payload.actions) && payload.actions.length) options.actions = payload.actions;

    await broadcast({ type: 'push_diag', stage: 'show_calling', tag: options.tag });
    try {
      await self.registration.showNotification(payload.title || 'coacheseyeGPT', options);
      await broadcast({ type: 'push_diag', stage: 'show_resolved' });
      await broadcast({ type: 'push_received', title: payload.title || '' });
    } catch (e) {
      await broadcast({ type: 'push_diag', stage: 'show_error', error: e.message });
    }
  })());
});

// Page-triggered SW notification test and version query.
self.addEventListener('message', event => {
  if (event.data?.type === 'get_version') {
    (event.source || self).postMessage({ type: 'sw_version', version: SW_VERSION, timestamp: Date.now() });
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
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(windowClient => windowClient.url.startsWith(self.location.origin));
    if (existing) {
      if ((data.type || '').startsWith('availability')) existing.postMessage({ type: 'navigate', to: 'availability' });
      return existing.focus();
    }
    return clients.openWindow(target.href);
  })());
});
