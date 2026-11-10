#!/usr/bin/env -S node --experimental-strip-types
/**
 * Remontée d'un briefing Hermes normalisé vers le Radar.
 *
 * Deux modes :
 *   1. FICHIER (défaut, recommandé) — écrit le JSON au schéma du collecteur
 *      dans <out>/briefing-<date>.json. Le collecteur `hermes.collector.ts`
 *      rapatrie `~/.hermes/profiles/radar-cyber/out/*.json` via SSH.
 *   2. HTTP — POST du même JSON vers `--api-url` (ex. http://radar:8080/api/ingest).
 *      À n'utiliser que si la route est enregistrée côté API (sinon 404).
 *
 * Usage :
 *   node --experimental-strip-types scripts/hermes-push.mts <briefing.json> [--dry-run]
 *   node --experimental-strip-types scripts/hermes-push.mts <briefing.json> --out /chemin/out.json
 *   node --experimental-strip-types scripts/hermes-push.mts <briefing.json> --api-url http://radar:8080/api/ingest
 *
 * `--dry-run` affiche la charge utile (schéma collecteur) sans écrire ni envoyer.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const SOURCE_ID = "hermes_radar_cyber";
const FAMILIES = new Set([
  "ransomware",
  "vuln",
  "phishing",
  "malware",
  "cert",
  "cert_fr",
  "typosquat",
  "reputation",
  "cti",
  "presse",
]);

type Item = {
  title: string;
  url?: string | null;
  summary?: string | null;
  severity?: number;
  family?: string;
};

type Briefing = {
  profile?: string;
  generated_at?: string;
  items?: Item[];
};

type Event = {
  dedup_key: string;
  family: string;
  assertion_type: string;
  title: string;
  summary: string | null;
  observed_at: string | null;
  severity: number;
  confidence: string;
  source_id: string;
  source_url: string | null;
  org_name: string | null;
  evidence: Record<string, unknown>;
};

function usage(): never {
  console.error(
    "usage : node --experimental-strip-types scripts/hermes-push.mts <briefing.json> [--out <fichier>|--api-url <url>] [--dry-run] [--profile <nom>]",
  );
  process.exit(1);
}

function clampSeverity(n: number): number {
  return Math.min(Math.max(Math.trunc(Number.isFinite(n) ? n : 3), 1), 5);
}

function dirnameOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : ".";
}

function toEvent(item: Item, profile: string): Event | null {
  const title = String(item.title ?? "").trim().slice(0, 400);
  if (!title) return null;
  const family = FAMILIES.has(String(item.family ?? "")) ? String(item.family) : "cti";
  const summary = String(item.summary ?? "").trim().slice(0, 4000) || null;
  const url = item.url ? String(item.url) : null;
  return {
    dedup_key: `hermes:${createHash("sha256").update(title).digest("base64url").slice(0, 24)}`,
    family,
    // Une revendication rançongicielle reste une allégation tant qu'elle n'est
    // pas recoupée : jamais « confirmed_incident » en provenance d'un bot.
    assertion_type: family === "ransomware" ? "third_party_claim" : "ambient_signal",
    title,
    summary,
    observed_at: null,
    severity: clampSeverity(Number(item.severity)),
    confidence: "C3",
    source_id: SOURCE_ID,
    source_url: url,
    org_name: null,
    evidence: summary ? { summary, profile } : { profile },
  };
}

function defaultOut(profile: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const dir = profile && profile !== "radar-cyber"
    ? join(homedir(), ".hermes", "profiles", profile, "out")
    : join(homedir(), ".hermes", "profiles", "radar-cyber", "out");
  return join(dir, `briefing-${date}.json`);
}

async function postJson(url: string, body: string): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text: text.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e) };
  }
}

function main(): void {
  const args = process.argv.slice(2);
  let input: string | null = null;
  let out: string | null = null;
  let apiUrl: string | null = null;
  let dryRun = false;
  let profile = "radar-cyber";

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out") out = args[++i] ?? null;
    else if (a === "--api-url") apiUrl = args[++i] ?? null;
    else if (a === "--profile") profile = args[++i] ?? profile;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--help" || a === "-h") usage();
    else if (!a.startsWith("--")) input = a;
    else usage();
  }

  if (!input) usage();

  let briefing: Briefing;
  try {
    briefing = JSON.parse(readFileSync(input, "utf8")) as Briefing;
  } catch (e) {
    console.error(`[hermes-push] lecture impossible de ${input} : ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  const items = Array.isArray(briefing.items) ? briefing.items : [];
  const events = items
    .map((it) => toEvent(it, profile))
    .filter((e): e is Event => e !== null);

  // Dédup par dedup_key (le collecteur fait ON CONFLICT DO NOTHING, mais on
  // évite ainsi les doublons dans le fichier lui-même).
  const seen = new Set<string>();
  const deduped = events.filter((e) => {
    if (seen.has(e.dedup_key)) return false;
    seen.add(e.dedup_key);
    return true;
  });

  const payload = JSON.stringify(
    {
      generated_at: briefing.generated_at ?? new Date().toISOString(),
      profile,
      items_in: items.length,
      events: deduped,
    },
    null,
    2,
  ) + "\n";

  if (dryRun) {
    process.stdout.write(payload);
    console.error(
      `[hermes-push] dry-run : ${deduped.length} événement(s) (profil ${profile}) — ni écrit ni envoyé`,
    );
    return;
  }

  if (apiUrl) {
    void postJson(apiUrl, payload).then((r) => {
      if (r.ok) {
        console.error(`[hermes-push] HTTP ${r.status} → ${apiUrl} (${deduped.length} événement(s))`);
      } else {
        console.error(`[hermes-push] HTTP ${r.status} → ${apiUrl} : ${r.text}`);
        process.exit(1);
      }
    });
    return;
  }

  const target = out ?? defaultOut(profile);
  mkdirSync(dirnameOf(target), { recursive: true });
  writeFileSync(target, payload, "utf8");
  console.error(`[hermes-push] ${deduped.length} événement(s) → ${target}`);
}

main();
