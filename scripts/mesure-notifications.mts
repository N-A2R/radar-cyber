/**
 * Reproducible measurement of the real notification base.
 *
 *   DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-notifications.mts
 *
 * Read-only: the eligible alert count uses the same selector as the email,
 * webhook and RSS channels, so the number can be compared with the delivered
 * messages counted by apps/api/test/notifications.test.ts.
 */
import { closePools, query } from "../apps/api/src/db.js";
import { fetchNotificationAlerts, NA_DEPARTMENTS } from "../apps/api/src/notify/notification-alerts.js";

const counts = await query<{
  organizations: number;
  sources: number;
  events: number;
  alerts: number;
}>(`
  SELECT (SELECT count(*)::int FROM org) AS organizations,
         (SELECT count(*)::int FROM source) AS sources,
         (SELECT count(*)::int FROM event) AS events,
         (SELECT count(*)::int FROM alert) AS alerts
`);

const eligible = await fetchNotificationAlerts({ pendingOnly: false, limit: 100_000 });
const pending = await fetchNotificationAlerts({ pendingOnly: true, limit: 100_000 });

console.log(
  JSON.stringify(
    {
      ...counts.rows[0],
      na_departments: NA_DEPARTMENTS.length,
      eligible_notifications: eligible.length,
      pending_delivery: pending.length,
      channels: ["email", "webhook", "rss"],
    },
    null,
    2,
  ),
);

await closePools();
