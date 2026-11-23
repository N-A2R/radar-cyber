/** Public RSS 2.0 feed of recent Nouvelle-Aquitaine alerts. */
import type { FastifyInstance } from "fastify";
import { fetchNotificationAlerts } from "../notify/notification-alerts.js";
import { buildRssFeed } from "../notify/notification-content.js";
import { appliquerEnTetes, scellerExport, scellementHttpActif } from "../export/scellement.js";

export const RSS_LIMIT = 20;

export default async function (app: FastifyInstance): Promise<void> {
  app.get("/alerts/rss.xml", async (_request, reply) => {
    const alerts = await fetchNotificationAlerts({ pendingOnly: false, limit: RSS_LIMIT });
    const xml = buildRssFeed(alerts, { webBaseUrl: process.env.RADAR_WEB_BASE_URL });
    if (scellementHttpActif()) {
      const scellement = await scellerExport({
        reference: "/alerts/rss.xml",
        format: "rss-xml",
        contenu: xml,
      });
      appliquerEnTetes((nom, valeur) => reply.header(nom, valeur), scellement);
    }
    return reply
      .type("application/rss+xml; charset=utf-8")
      .header("Cache-Control", "public, max-age=60")
      .send(xml);
  });
}
