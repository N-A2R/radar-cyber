/**
 * Mesure avant/après sur 20 sources réelles, sur les OCTETS FIGÉS d'un même GET.
 *
 * `avant`  : `detectItems()` de l'état du dépôt avant ce chantier (commit pinné),
 *            chargé depuis un `git archive` temporaire — pas une approximation.
 * `après`  : `parseSource()` du code courant (détection + champs canoniques).
 *
 * Aucune écriture en base, aucun corps versionné : seules les métriques sont
 * enregistrées dans `bench/results/parseurs-20-avant-apres.json`.
 *
 * Usage : apps/api/node_modules/.bin/tsx scripts/mesure-parseurs-20.mts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync, existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// État du dépôt avant les parseurs complets (21 novembre 2026).
const BASELINE_REF = "60500802e3799af4c3d478cbc29fec15017f2226";
const OUTPUT = "bench/results/parseurs-20-avant-apres.json";
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 25 * 1024 * 1024;
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const ACCEPT = "application/ld+json, application/json, application/rss+xml, application/atom+xml, text/xml, text/csv, text/html;q=0.9, */*;q=0.5";

const SOURCES = [
  { source: "cert-fr-feed", url: "https://www.cert.ssi.gouv.fr/feed/", format: "RSS 2.0" },
  { source: "krebsonsecurity-feed", url: "https://krebsonsecurity.com/feed/", format: "RSS 2.0" },
  { source: "thehackernews-feed", url: "https://feeds.feedburner.com/TheHackersNews", format: "RSS 2.0" },
  { source: "securelist-feed", url: "https://securelist.com/feed/", format: "RSS 2.0" },
  { source: "helpnetsecurity-feed", url: "https://www.helpnetsecurity.com/feed/", format: "RSS 2.0" },
  { source: "infosecurity-magazine-feed", url: "https://www.infosecurity-magazine.com/rss/news/", format: "RSS 2.0" },
  { source: "securityaffairs-feed", url: "https://securityaffairs.co/wordpress/feed", format: "RSS 2.0" },
  { source: "welivesecurity-feed", url: "https://www.welivesecurity.com/feed/", format: "RSS 2.0" },
  { source: "jpcert-atom", url: "https://blogs.jpcert.or.jp/en/atom.xml", format: "Atom 1.0" },
  { source: "rust-releases-atom", url: "https://github.com/rust-lang/rust/releases.atom", format: "Atom 1.0" },
  { source: "github-blog-article", url: "https://github.blog/open-source/maintainers/the-best-things-in-open-source-are-built-together/", format: "JSON-LD" },
  { source: "bleepingcomputer-article", url: "https://www.bleepingcomputer.com/news/security/badbox-30-botnet-returns-with-record-breaking-40-billion-daily-ad-requests/", format: "JSON-LD" },
  { source: "theregister-article", url: "https://www.theregister.com/security/2026/11/20/signal-slams-door-on-prying-ai-agents-to-protect-privacy/5311466", format: "JSON-LD" },
  { source: "certfr-avis", url: "https://www.cert.cyber.gouv.fr/avis/CERTFR-2026-AVI-1344/", format: "HTML <article>" },
  { source: "krebsonsecurity-article", url: "https://krebsonsecurity.com/2026/11/cto-of-ransomwarehelp-indicted-for-wire-fraud/", format: "HTML <article>" },
  { source: "cisa-advisories", url: "https://www.cisa.gov/news-events/cybersecurity-advisories", format: "HTML <main>" },
  { source: "nvd-cve-api", url: "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=20", format: "JSON maison" },
  { source: "cisa-kev-json", url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", format: "JSON maison" },
  { source: "ransomwatch-posts", url: "https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json", format: "JSON maison" },
  { source: "ransomlook-recent", url: "https://ransomlook.io/api/recent", format: "JSON maison" },
] as const;

type BeforeFn = (body: string, contentType: string | null) => {
  strategy: string;
  items: Record<string, unknown>[];
  path: string | null;
};

function tempBaseline(): string {
  const dir = resolve(`bench/.avant-parseurs-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const archive = execFileSync("git", ["archive", BASELINE_REF, "apps/api/src"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", dir], { input: archive, maxBuffer: 64 * 1024 * 1024 });
  // Le code extrait résout ses dépendances depuis le workspace réel.
  if (!existsSync(join(dir, "apps/api/node_modules"))) {
    symlinkSync(resolve("apps/api/node_modules"), join(dir, "apps/api/node_modules"), "dir");
  }
  return dir;
}

/** Champs lisibles d'un item du code d'avant (avant canonicalisation). */
function oldField(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim()) return entry.trim();
        if (entry && typeof entry === "object") {
          const nested = entry as Record<string, unknown>;
          for (const k of ["@_href", "href", "url", "link", "#text"]) {
            if (typeof nested[k] === "string" && String(nested[k]).trim()) return String(nested[k]).trim();
          }
        }
      }
    }
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      for (const k of ["@_href", "href", "url", "link", "#text", "value"]) {
        if (typeof nested[k] === "string" && String(nested[k]).trim()) return String(nested[k]).trim();
      }
    }
  }
  return "";
}

function completeBefore(item: Record<string, unknown>): boolean {
  return Boolean(
    oldField(item, ["title", "headline", "name", "post_title", "vulnerabilityName", "cveID", "id", "value"]) &&
    oldField(item, ["date", "pubDate", "published", "dateAdded", "discovered", "updated", "lastModified"]) &&
    oldField(item, ["link", "url", "href", "guid", "html_url"]) &&
    oldField(item, ["summary", "description", "shortDescription", "content", "encoded", "notes", "text"]),
  );
}

function completeAfter(item: Record<string, unknown>): boolean {
  return ["title", "date", "link", "summary"].every((k) => typeof item[k] === "string" && item[k].length > 0);
}

async function fetchOnce(url: string): Promise<{ body: string; contentType: string; note: string; bytes: number }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: ACCEPT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) return { body: "", contentType, note: `HTTP ${res.status}`, bytes: buf.length };
    if (buf.length > MAX_BYTES) return { body: "", contentType, note: "corps trop gros", bytes: buf.length };
    return { body: buf.toString("utf8"), contentType, note: "", bytes: buf.length };
  } catch (e) {
    const err = e as Error;
    return { body: "", contentType: "", note: err.name === "TimeoutError" ? "timeout" : err.message.slice(0, 100), bytes: 0 };
  }
}

async function main(): Promise<void> {
  const dir = tempBaseline();
  // Import après extraction : c'est le vrai code d'avant, pas une copie locale.
  const moduleUrl = pathToFileURL(join(dir, "apps/api/src/collectors/generic.ts")).href;
  const baseline = (await import(moduleUrl)) as { detectItems: BeforeFn };
  const { parseSource } = await import("../apps/api/src/collectors/parsers/index.js");

  const results = new Array<(typeof SOURCES)[number] & {
    code_http_note: string;
    octets: number;
    avant: { strategie: string; items: number; complets: number; chemin: string | null };
    apres: { format: string; strategie: string; items: number; complets: number; diagnostic: string[] };
  }>(SOURCES.length);

  let index = 0;
  const workers = Array.from({ length: 4 }, async () => {
    for (;;) {
      const slot = index++;
      if (slot >= SOURCES.length) return;
      const source = SOURCES[slot];
      const fetched = await fetchOnce(source.url);
      const before = baseline.detectItems(fetched.body, fetched.contentType || null);
      const after = parseSource(fetched.body, fetched.contentType || null, { baseUrl: source.url });
      results[slot] = {
        ...source,
        code_http_note: fetched.note || "ok",
        octets: fetched.bytes,
        avant: {
          strategie: before.strategy,
          items: before.items.length,
          complets: before.items.filter(completeBefore).length,
          chemin: before.path,
        },
        apres: {
          format: after.format,
          strategie: after.strategy,
          items: after.items.length,
          complets: after.items.filter(completeAfter).length,
          diagnostic: after.diagnostics.map((d) => d.code),
        },
      };
      console.log(`[${slot + 1}/${SOURCES.length}] ${source.format.padEnd(12)} ${source.source.padEnd(28)} ${String(before.items.length).padStart(6)} → ${String(after.items.length).padStart(6)}`);
    }
  });
  await Promise.all(workers);

  const sum = (key: "avant" | "apres", field: "items" | "complets"): number =>
    results.reduce((total, row) => total + (row?.[key][field] ?? 0), 0);
  const report = {
    genere_le: new Date().toISOString(),
    bases: {
      avant: { ref: BASELINE_REF, description: "état du dépôt avant ce chantier, extrait par git archive" },
      apres: { description: "parseSource() courant, avec canonicalisation et diagnostics" },
    },
    methode: {
      fetch: `un GET par URL, redirect:follow, timeout ${TIMEOUT_MS / 1000} s, mêmes en-têtes que le collecteur ; corps non versionnés`,
      mesure: "les deux parseurs tournent sur les mêmes octets, une seule fois par source",
      complet: "item porteur des quatre champs title/date/link/summary (avant : équivalence par alias de clés)",
      base: "aucune écriture en base",
    },
    sources: results,
    totaux: {
      sources: SOURCES.length,
      items_avant: sum("avant", "items"),
      items_apres: sum("apres", "items"),
      items_complets_avant: sum("avant", "complets"),
      items_complets_apres: sum("apres", "complets"),
      sources_avec_items_avant: results.filter((r) => (r?.avant.items ?? 0) > 0).length,
      sources_avec_items_apres: results.filter((r) => (r?.apres.items ?? 0) > 0).length,
      sources_en_erreur: results.filter((r) => r?.code_http_note !== "ok").map((r) => ({ source: r?.source, note: r?.code_http_note })),
    },
    limites: [
      "Mesure ponctuelle : le contenu des sites évolue ; les deux colonnes portent sur le même corps figé au moment du GET.",
      "Un item 'complet' peut manquer légitimement de lien ou de date selon la source (ex. NVD sans URL d'article) : le comptage décrit les champs fournis, pas une exigence métier.",
      "Le nombre d'items n'est pas un score de qualité : avant, les pages d'article produisaient des dizaines de liens de menu, désormais écartés.",
    ],
  };
  writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nÉcrit ${OUTPUT}`);
  console.log(`items : ${report.totaux.items_avant} avant → ${report.totaux.items_apres} après`);
  console.log(`complets : ${report.totaux.items_complets_avant} avant → ${report.totaux.items_complets_apres} après`);
  rmSync(dir, { recursive: true, force: true });
}

main()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => {
    for (const entry of process.argv) {
      if (entry.startsWith("bench/.avant-parseurs-")) rmSync(entry, { recursive: true, force: true });
    }
  });
