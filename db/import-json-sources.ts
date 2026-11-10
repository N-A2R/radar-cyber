/**
 * Importe des sources JSON (définitions estorides) dans `source`.
 * Filtre : URLs sans joker {…}, sources activées, flux ressemblant à une liste/une lecture.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const file = process.argv[2] ?? "/tmp/estorides-sources.json";

type Candidate = { name: string; url: string; method: string; enabled: boolean; requires_key: boolean; origin: string };

const FEED_HINTS = /feed|recent|list|download|\.csv$|\.txt$|\.json$|\.xml$|rss|blocklist|malware|threat|breach|paste|hash/i;

function looksCollectable(url: string): boolean {
  if (url.includes("{")) return false;
  if (/\/api\/v\d+\/(search|lookup|route|aircraft|track|query)/i.test(url)) return false;
  return FEED_HINTS.test(url);
}

function familyFromUrl(url: string, origin: string): string {
  const haystack = `${url} ${origin}`.toLowerCase();
  if (/ransom|leak|breach|paste|dehashed|haveibeenpwned/.test(haystack)) return "ransomware";
  if (/cve|nvd|vuln/.test(haystack)) return "vuln";
  if (/phish|openphish|urlhaus|threatfox|malware|bazaar|feodo/.test(haystack)) return "malware";
  if (/crt|cert|ct\b/.test(haystack)) return "cert";
  if (/blocklist|blacklist|ip|botrij|spamhaus/.test(haystack)) return "reputation";
  return "cti";
}

function formatFromUrl(url: string): string {
  if (/\.csv(\?|$)/i.test(url)) return "txt";
  if (/\.txt(\?|$)/i.test(url)) return "txt";
  if (/\.xml(\?|$)/i.test(url)) return "rss";
  return "json";
}

async function main() {
  const candidates = JSON.parse(readFileSync(file, "utf8")) as Candidate[];
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of candidates) {
    if (!c.enabled || c.requires_key || !looksCollectable(c.url)) { skipped++; continue; }
    const id = `estorides:${c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    const family = familyFromUrl(c.url, c.origin);
    const format = formatFromUrl(c.url);
    const kind = format === "rss" || /feed|recent|list/i.test(c.url) ? "narrative" : "indicator";
    try {
      await pool.query(
        `INSERT INTO source (id, name, family, url, license, retain_raw, enabled, kind, format, parser, interval_sec, description)
         VALUES ($1,$2,$3,$4,$5,false,true,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, family=EXCLUDED.family, url=EXCLUDED.url,
           kind=EXCLUDED.kind, format=EXCLUDED.format, enabled=EXCLUDED.enabled`,
        [
          id,
          `estorides — ${c.name}`.slice(0, 200),
          family,
          c.url,
          "voir conditions de la source d'origine",
          kind,
          format,
          JSON.stringify({ source: "estorides", origin: c.origin }),
          kind === "indicator" ? 86400 : 3600,
          c.origin.slice(0, 200),
        ]
      );
      inserted++;
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message}`);
    }
  }

  const total = await pool.query("SELECT count(*)::int AS n FROM source");
  console.log(JSON.stringify({ inserted, skipped, errors: errors.slice(0, 5), total: total.rows[0].n }, null, 1));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
