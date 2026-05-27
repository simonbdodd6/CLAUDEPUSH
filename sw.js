// Coach's Eye · Boitsfort RFC · Service Worker
// Handles push notifications and lock-screen quick replies

const CACHE_NAME = 'coachseye-v5';

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(clients.claim()));

// ── Push received ─────────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { data = { title: "Coach's Eye", body: event.data.text() }; }

  const type = data.type || 'message';

  // Notification actions depend on message type
  let actions;
  if (type === 'availability' || type === 'availability-reminder') {
    actions = [
      { action: 'available-all', title: '✅ All good this week' },
      { action: 'open-avail',    title: '📋 Set each session'  },
    ];
  } else {
    actions = [
      { action: 'open',    title: '📲 Open app' },
      { action: 'dismiss', title: 'Dismiss'     },
    ];
  }

  const options = {
    body:               data.body || '',
    icon:               '/icon.svg',
    badge:              '/icon.svg',
    tag:                data.tag  || 'coachseye-msg',
    renotify:           true,
    // Keep availability requests on screen until player responds
    requireInteraction: (type === 'availability' || type === 'availability-reminder'),
    data: {
      sessionId: data.sessionId || 'game',
      type,
    },
    actions,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Coach's Eye", options)
  );
});

// ── Notification tapped ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const { action } = event;
  const notifData  = event.notification.data || {};
  const sessionId  = notifData.sessionId || 'game';

  // ── "All good this week" — one tap sets all 3 sessions available ────────────
  if (action === 'available-all') {
    event.waitUntil(
      (async () => {
        const sub      = await self.registration.pushManager.getSubscription();
        const endpoint = sub?.endpoint;
        if (endpoint) {
          // Set available for all three sessions at once
          await Promise.all(
            ['tue', 'thu', 'game'].map(sid =>
              fetch('/api/availability', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ endpoint, response: 'available', sessionId: sid }),
              }).catch(() => {})
            )
          );
        }
        await self.registration.showNotification("You're in! ✅", {
          body:               "All set — the coach knows you're available for everything this week.",
          icon:               '/icon.svg',
          tag:                'availability-confirm',
          requireInteraction: false,
        });
      })()
    );
    return;
  }

  // ── Single-session yes/no (kept for backwards compat) ──────────────────────
  if (action === 'available' || action === 'unavailable' || action === 'maybe') {
    event.waitUntil(
      (async () => {
        const sub      = await self.registration.pushManager.getSubscription();
        const endpoint = sub?.endpoint;
        if (endpoint) {
          await fetch('/api/availability', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ endpoint, response: action, sessionId }),
          }).catch(() => {});
        }
        const msg = action === 'available' ? "✅ Got it — see you there!" : "👍 Thanks, the coach has been notified.";
        await self.registration.showNotification("Response recorded", {
          body:               msg,
          icon:               '/icon.svg',
          tag:                'availability-confirm',
          requireInteraction: false,
        });
      })()
    );
    return;
  }

  // ── Dismiss ────────────────────────────────────────────────────────────────
  if (action === 'dismiss') return;

  // ── Open app → route to availability page ─────────────────────────────────
  // For availability notifications, always land on the availability page —
  // this covers iOS (no action buttons) and anyone who taps the notification body
  const notifType = notifData.type || 'message';
  const isAvailNotif = notifType === 'availability' || notifType === 'availability-reminder';
  const targetUrl = (action === 'open-avail' || isAvailNotif)
    ? `${self.location.origin}/?to=availability`
    : `${self.location.origin}/`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          w.postMessage({ type: 'navigate', to: 'availability' });
          return w.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
