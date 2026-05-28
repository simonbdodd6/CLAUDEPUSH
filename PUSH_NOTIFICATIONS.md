# Scheduled Push Notifications

coacheseyeGPT now sends browser push notifications instead of WhatsApp messages. Players enable notifications once on their phone or computer, then the coach can send an availability request or schedule recurring reminders from Message Center.

## One-Time Vercel Setup

Add these environment variables to the Vercel project in `Settings > Environment Variables`:

| Name | Purpose |
| --- | --- |
| `VAPID_PUBLIC_KEY` | Public browser push key |
| `VAPID_PRIVATE_KEY` | Private push signing key |
| `VAPID_CONTACT` | Contact email, for example `coach@club.be` |
| `CRON_SECRET` | A long random password for scheduled calls |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `APP_KEY_PREFIX` | Use `app` for this deployment |
| `LOCAL_TZ_OFFSET` | Belgium is `2` in summer and `1` in winter |

Generate VAPID keys locally:

```bash
npx web-push generate-vapid-keys
```

Create a Redis database in Upstash, then copy its REST URL and REST token to Vercel. Redeploy after adding the settings.

## Scheduling

The application includes daily Vercel fallback calls in `vercel.json`. For accurate five-minute scheduled sends, create a free cron-job.org job:

- URL: `https://YOUR-DOMAIN.vercel.app/api/cron?secret=YOUR_CRON_SECRET`
- Method: `GET`
- Schedule: every 5 minutes

Use the same secret in the URL and in Vercel. The API prevents a schedule sending twice on the same UTC date.

## Coach Test Flow

1. Open Player View on a device and choose `Enable` under Notifications.
2. Open Coach View, then Message Center.
3. Use `New schedule` to create an availability message, or use `Send now`.
4. Tap `Available`, `Not available`, or `Maybe` from the player notification.
5. Return to Message Center and click `Refresh`; the player status appears in the appropriate colour.

## Stored Data

Upstash stores:

- `app:subscriptions`
- `app:templates`
- `app:schedules`
- `app:availability:SESSION_ID`
- `app:message_log`

The server still reads older `ce:` records during this upgrade, avoiding loss of existing pilot data.
