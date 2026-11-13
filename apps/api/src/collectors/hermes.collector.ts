/**
 * Collecteur Hermes : rapatrie les briefings produits par le bot de veille
 * sur la box distante (profil radar-cyber) via le tunnel SSH instabox.
 * Les fichiers sont lus dans ~/.hermes/profiles/radar-cyber/out/*.json.
 */
import { execFile } from "node:child_process";
import { consigner } from "../journal/index.js";
import { porteeRegionale } from "../match/territorial.js";
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

import { AdmissionTally, admitEvent } from "../contract/admit.js";

function runRemote(command: string): Promise<string> {
  return execFileAsync("instabox", ["ssh", "hermes", command], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
    .then(({ stdout }) => stdout)
    .catch(() => "");
}

/**
 * Extraction brute d'un briefing Hermes. La validation n'est plus faite ici :
 * elle appartient au contrat partagé (`admitEvent`), qui répare avec trace et
 * rejette avec motif. Ce qui reste ici ne fait que remettre les champs du
 * format Hermes (snake_case) dans la forme attendue par le contrat.
 */
function normalise(raw: BriefingEvent): Record<string, unknown> | null {
  const title = String(raw.title ?? "").trim();
  if (!title) return null;
  const dedupKey = String(raw.dedup_key ?? "").trim() || `hermes:${createHash("sha256").update(title).digest("base64url").slice(0, 24)}`;
  return {
    dedupKey,
    family: String(raw.family ?? "cti"),
    assertionType: String(raw.assertion_type ?? "ambient_signal"),
    title,
    observedAt: raw.observed_at ? String(raw.observed_at) : undefined,
    severity: raw.severity ?? 3,
    confidence: String(raw.confidence ?? "C3"),
    sourceId: SOURCE_ID,
    sourceUrl: raw.source_url ? String(raw.source_url) : undefined,
    orgHint: raw.org_name ? String(raw.org_name) : undefined,
    evidence: raw.evidence ?? {},
    geoType: "unknown",
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
  const contract = new AdmissionTally();

  for (const file of files) {
    const raw = await runRemote(`cat ${file}`);
    if (!raw.trim()) continue;
    let briefing: Briefing;
    try { briefing = JSON.parse(raw) as Briefing; } catch { continue; }
    const events = Array.isArray(briefing.events) ? briefing.events as BriefingEvent[] : [];
    total += events.length;

    for (const rawEvent of events) {
      const candidate = normalise(rawEvent);
      if (!candidate) continue;
      const admitted = admitEvent(candidate);
      contract.record(admitted);
      if (!admitted.ok) continue;
      const event = admitted.event;
      const r = await query(
        `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, severity, confidence,
          source_id, source_url, evidence, geo_type, org_id, regional, regional_motif)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
           (SELECT id FROM org WHERE name = $13 LIMIT 1), $14, $15)
         ON CONFLICT (dedup_key) DO NOTHING`,
        [event.dedupKey, event.family, event.assertionType, event.title, event.summary ?? null, event.observedAt ?? null, event.severity,
         event.confidence ?? "C3", event.sourceId, event.sourceUrl ?? null, JSON.stringify(event.evidence ?? {}), event.geoType,
         candidate.orgHint ?? null,
         porteeRegionale(`${event.title} ${event.summary ?? ""}`, null).regional,
         porteeRegionale(`${event.title} ${event.summary ?? ""}`, null).motif]
      );
      if ((r.rowCount ?? 0) > 0) {
        added++;
        // Hermes écrit ses événements hors de la boucle générique : sans ce
        // fait, ils n'ont aucune trace dans le journal.
        await consigner({
          kind: event.orgHint ? "event.rattachement" : "event.admitted",
          subject: event.dedupKey,
          summary: `hermes : ${event.title.slice(0, 80)}`,
          actor: "collecteur:hermes",
          payload: { family: event.family, assertionType: event.assertionType, orgHint: candidate.orgHint ?? null },
          validAt: event.observedAt ?? null,
        }).catch(() => {});
      }
    }
  }

  log(`hermes: ${files.length} briefing(s), ${total} événement(s), ${added} nouveau(x)`);
  const contractLine = contract.logLine();
  if (contractLine) log(`hermes: contrat — ${contractLine}`);
  await query(
    "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', $2, $3)",
    [SOURCE_ID, total, added]
  ).catch(() => {});
}
