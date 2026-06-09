// coacheseyeGPT service worker: receive push messages and record player replies.
const APP_URL = '/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: "coacheseyeGPT", body: event.data.text() }; }

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
  event.waitUntil(
    self.registration.showNotification(payload.title || "coacheseyeGPT", options).then(() =>
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins =>
        wins.forEach(w => w.postMessage({ type: 'push_received', timestamp: Date.now(), title: payload.title || '' }))
      )
    )
  );
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
