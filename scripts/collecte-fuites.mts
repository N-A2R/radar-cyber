#!/usr/bin/env -S npx tsx
/**
 * Passe réelle de collecte des fuites documentées (sources publiques).
 *
 *   apps/api/node_modules/.bin/tsx scripts/collecte-fuites.mts
 *
 * Par défaut la base de test radar:5433 (jamais 5432). Le script interroge
 * HIBP, LeakIX, DataBreaches.net et Pwned Passwords, puis affiche le rapport :
 * sources interrogées, taux d'échec, références stockées, organisations NA
 * touchées. Aucun mot de passe, suffixe k-anonyme ni e-mail n'est écrit.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5433/radar";

const { closePools, query } = await import("../apps/api/src/db.js");
const { fetchResilient } = await import("../apps/api/src/collectors/http.js");
const { collecterFuites } = await import("../apps/api/src/collectors/fuites.collector.js");

function sourceDe(url: string): string {
  if (url.includes("leakix.net")) return "fuites-leakix";
  if (url.includes("haveibeenpwned.com")) return "fuites-hibp";
  if (url.includes("databreaches.net")) return "fuites-databreaches";
  return "fuites-pwned";
}

const ctx = {
  fetchJson: async <T = unknown>(url: string): Promise<T> => {
    const res = await fetchResilient(url, { source: sourceDe(url), accept: "application/json" });
    return JSON.parse(res.text) as T;
  },
  fetchText: async (url: string): Promise<string> => {
    const res = await fetchResilient(url, { source: sourceDe(url), accept: "*/*" });
    return res.text;
  },
  cursor: { toutLeReferentiel: true },
  log: (msg: string) => console.log(`[collecte-fuites] ${msg}`),
  now: () => new Date(),
};

try {
  const resultat = await collecterFuites(ctx);
  const { rows: Stats } = await query<{
    source: string; tentatives: number; echecs: number; detail: unknown;
  }>("SELECT source, tentatives, echecs, detail FROM fuite_stat ORDER BY source");
  const { rows: totaux } = await query<{
    references: string; correspondances: string; organisations: string; sensibles: string;
  }>(`SELECT
         (SELECT count(*) FROM fuite_reference) AS references,
         (SELECT count(*) FROM fuite_org) AS correspondances,
         (SELECT count(DISTINCT org_id) FROM fuite_org) AS organisations,
         (SELECT count(*) FROM fuite_reference
           WHERE evidence ?| array['password', 'passwords', 'suffix', 'suffixes', 'email', 'emails']
              OR evidence::text ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}') AS sensibles`);

  console.log(JSON.stringify({
    sources: Stats.map((s) => ({
      source: s.source,
      tentatives: s.tentatives,
      echecs: s.echecs,
      taux_echec: s.tentatives ? Number((s.echecs / s.tentatives).toFixed(4)) : null,
      detail: s.detail,
    })),
    collecte: {
      references: resultat.references,
      correspondances: resultat.correspondances,
      organisations: resultat.organisations,
      domaines_du_referentiel: resultat.domainesOrganisations,
    },
    base: totaux[0],
    aucune_donnee_personnelle: totaux[0]?.sensibles === "0",
  }, null, 2));
} finally {
  await closePools();
}
