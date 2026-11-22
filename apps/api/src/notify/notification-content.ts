/**
 * Content shared by every external notification channel.
 *
 * Alerts are built from structured fields only. Event titles, alert titles,
 * summaries and evidence are never read here: they may name a victim or carry
 * personal data. Names of organizations and sources are sanitized as a second
 * barrier; links keep only the scheme, host and path.
 */
import type { NotificationAlert } from "./notification-alerts.js";

export type MessageAlert = Pick<
  NotificationAlert,
  "id" | "severity" | "status" | "created_at" | "attempts" | "org_name" | "org_dept" | "source_name" | "source_url"
>;

export interface NotificationMessage {
  alertId: number;
  subject: string;
  text: string;
  payload: Record<string, unknown>;
}

const SEVERITY_LABELS: Readonly<Record<number, string>> = {
  1: "info", 2: "low", 3: "medium", 4: "high", 5: "critical",
};

export function severityLabel(severity: number): string {
  return SEVERITY_LABELS[severity] ?? String(severity);
}

/** Remove people's identifiers and control characters from a display label. */
export function sanitizeText(input: string | null | undefined, maxLength = 160): string {
  if (!input) return "";
  return input
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[address removed]")
    .replace(/\+?\d(?:[\d\s().-]{8,}\d)/g, "[number removed]")
    .replace(/\b(?:M\.|Mme|Mr|Mrs|Ms)\s+[A-ZÀ-Ÿ][\w'-]+/g, "[name removed]")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Keep a link safe to publish: http(s) only, no query string or fragment. */
export function safeLink(alert: MessageAlert, webBaseUrl?: string): string | null {
  const candidate = alert.source_url?.trim();
  if (candidate) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") {
        url.search = "";
        url.hash = "";
        url.username = "";
        url.password = "";
        return url.toString();
      }
    } catch {
      // An invalid source link is simply omitted.
    }
  }
  const base = webBaseUrl?.trim().replace(/\/+$/, "");
  return base ? `${base}/alerts/${alert.id}` : null;
}

/** Structured, privacy-safe message for webhook, email and RSS alike. */
export function buildNotificationMessage(alert: MessageAlert, webBaseUrl?: string): NotificationMessage {
  const label = severityLabel(alert.severity);
  const organization = sanitizeText(alert.org_name, 120) || "organization not identified";
  const source = sanitizeText(alert.source_name, 120) || "source not identified";
  const link = safeLink(alert, webBaseUrl);
  const created = alert.created_at instanceof Date ? alert.created_at : new Date(alert.created_at);
  const date = Number.isNaN(created.getTime()) ? "" : created.toISOString();
  const subject = `[Radar Cyber] Nouvelle-Aquitaine alert #${alert.id} - severity ${label}`;
  const text = [
    subject,
    `Organization: ${organization}`,
    `Source: ${source}`,
    `Date: ${date || "unknown"}`,
    ...(link ? [`Link: ${link}`] : []),
  ].join("\n");
  return {
    alertId: alert.id,
    subject,
    text,
    payload: {
      type: "radar.alert",
      region: "Nouvelle-Aquitaine",
      alert: {
        id: alert.id,
        severity: alert.severity,
        severity_label: label,
        status: alert.status,
        organization,
        source,
        date,
        link,
        attempts: alert.attempts,
      },
    },
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rssDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toUTCString() : date.toUTCString();
}

/** RSS 2.0 feed for the most recent eligible Nouvelle-Aquitaine alerts. */
export function buildRssFeed(
  alerts: readonly NotificationAlert[],
  options: { webBaseUrl?: string; generatedAt?: Date } = {},
): string {
  const base = options.webBaseUrl?.trim().replace(/\/+$/, "");
  const home = base ?? "https://radar.local/alerts";
  const items = alerts.map((alert) => {
    const message = buildNotificationMessage(alert, base);
    const info = message.payload.alert as Record<string, unknown>;
    const title = `Alert #${alert.id} - severity ${severityLabel(alert.severity)} - ${String(info.organization)}`;
    const description = message.text.split("\n").slice(1).join(" ");
    return [
      "    <item>",
      `      <title>${escapeXml(title)}</title>`,
      `      <link>${escapeXml(String(info.link ?? home))}</link>`,
      `      <guid isPermaLink="false">radar-alert-${alert.id}</guid>`,
      `      <pubDate>${rssDate(alert.created_at)}</pubDate>`,
      `      <description>${escapeXml(description)}</description>`,
      "    </item>",
    ].join("\n");
  });
  const generated = rssDate(options.generatedAt ?? new Date(0));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>Radar Cyber - Nouvelle-Aquitaine alerts</title>",
    `    <link>${escapeXml(home)}</link>`,
    "    <description>Recent public cybersecurity alerts in Nouvelle-Aquitaine, without victim personal data.</description>",
    "    <language>en</language>",
    `    <lastBuildDate>${generated}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
