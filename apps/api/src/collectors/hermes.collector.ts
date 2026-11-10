/**
 * Collecteur Hermes : rapatrie les briefings produits par le bot de veille
 * sur la box distante (profil radar-cyber) via le tunnel SSH instabox.
 * Les fichiers sont lus dans ~/.hermes/profiles/radar-cyber/out/*.json.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { query } from "../db.js";

const execFileAsync = promisify(execFile);
const REMOTE_DIR = "/data/home/.hermes/profiles/radar-cyber/out";
const SOURCE_ID = "hermes_radar_cyber";

type BriefingEvent = {
  dedup_key?: unknown;
  family?: unknown;
  assertion_type?: unknown;
  title?: unknown;
  observed_at?: unknown;
  severity?: unknown;
  confidence?: unknown;
  source_id?: unknown;
  source_url?: unknown;
  org_name?: unknown;
  evidence?: unknown;
};

type Briefing = { generated_at?: unknown; events?: unknown };

function runRemote(command: string): Promise<string> {
  return execFileAsync("instabox", ["ssh", "hermes", command], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
    .then(({ stdout }) => stdout)
    .catch(() => "");
}

function normalise(raw: BriefingEvent): { dedupKey: string; family: string; assertionType: string; title: string; observedAt: string | null; severity: number; confidence: string; sourceUrl: string | null; orgName: string | null; evidence: object } | null {
  const title = String(raw.title ?? "").trim().slice(0, 400);
  if (!title) return null;
  const family = String(raw.family ?? "cti");
  const assertionType = String(raw.assertion_type ?? "ambient_signal");
  const dedupKey = String(raw.dedup_key ?? "").trim() || `hermes:${createHash("sha256").update(title).digest("base64url").slice(0, 24)}`;
  const observedAt = raw.observed_at ? String(raw.observed_at) : null;
  const severity = Number(raw.severity);
  const evidence = raw.evidence && typeof raw.evidence === "object" ? raw.evidence as object : {};
  return {
    dedupKey,
    family,
    assertionType,
    title,
    observedAt: observedAt && !Number.isNaN(Date.parse(observedAt)) ? new Date(observedAt).toISOString() : null,
    severity: Number.isFinite(severity) ? Math.min(Math.max(Math.trunc(severity), 1), 5) : 3,
    confidence: String(raw.confidence ?? "C3"),
    sourceUrl: raw.source_url ? String(raw.source_url) : null,
    orgName: raw.org_name ? String(raw.org_name) : null,
    evidence,
  };
}

export async function runHermesCollector(log: (msg: string) => void): Promise<void> {
  const listing = await runRemote(`ls -1 ${REMOTE_DIR}/*.json 2>/dev/null`);
  if (!listing.trim()) {
    log("hermes: aucun briefing disponible");
    return;
  }

  const files = listing.split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
  let total = 0;
  let added = 0;

  for (const file of files) {
    const raw = await runRemote(`cat ${file}`);
    if (!raw.trim()) continue;
    let briefing: Briefing;
    try { briefing = JSON.parse(raw) as Briefing; } catch { continue; }
    const events = Array.isArray(briefing.events) ? briefing.events as BriefingEvent[] : [];
    total += events.length;

    for (const rawEvent of events) {
      const event = normalise(rawEvent);
      if (!event) continue;
      const r = await query(
        `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, severity, confidence,
          source_id, source_url, evidence, geo_type, org_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'unknown',
           (SELECT id FROM org WHERE name = $12 LIMIT 1))
         ON CONFLICT (dedup_key) DO NOTHING`,
        [event.dedupKey, event.family, event.assertionType, event.title, null, event.observedAt, event.severity,
         event.confidence, SOURCE_ID, event.sourceUrl, JSON.stringify(event.evidence), event.orgName]
      );
      if ((r.rowCount ?? 0) > 0) added++;
    }
  }

  log(`hermes: ${files.length} briefing(s), ${total} événement(s), ${added} nouveau(x)`);
  await query(
    "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', $2, $3)",
    [SOURCE_ID, total, added]
  ).catch(() => {});
}
