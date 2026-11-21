/**
 * Rapport avant/après du collecteur Tor, à partir des deux mesures produites
 * par `tor-stability.mts`. Aucun réseau, aucune écriture en base.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx apps/api/scripts/tor-stability-report.mts \
 *     --before bench/results/tor-stability-before.json \
 *     --after bench/results/tor-stability-after.json \
 *     --out bench/results/tor-stability-rapport.json
 */
import { readFileSync, writeFileSync } from "node:fs";

interface Mesure {
  id: string;
  url: string;
  ok: boolean;
  cause: string;
  ms: number;
  strategy: string | null;
  items: number;
  detail: string | null;
  extrait: string | null;
  sous_cause: string | null;
}

interface Snapshot {
  phase: string;
  at: string;
  total: number;
  ok: number;
  taux_succes: number;
  latence_ms: { median: number; median_ok: number; p90: number; max: number };
  causes: Record<string, number>;
  strategies: Record<string, number>;
  par_source: Record<string, Mesure>;
}

const EXPLICATIONS: Record<string, string> = {
  circuit:
    "Tor n'a pas pu ouvrir le circuit jusqu'à l'hôte .onion (HostUnreachable, proxy fermé) : site éteint ou adresse obsolète. Rotation de circuit tentée.",
  timeout:
    "Aucune réponse dans le délai (45 s plancher pour un circuit froid) : service .onion saturé ou indisponible.",
  blocked:
    "La page répond 403/429 ou un challenge anti-bot : accès refusé au collecteur, aucun contournement tenté.",
  http_error:
    "Réponse HTTP d'erreur (4xx/5xx) côté serveur .onion : page en panne ou redirection invalide.",
  invalid_content:
    "HTTP 200 mais aucun item vérifiable : coquille JavaScript, corps trop court ou encodage illisible. La page reste en quarantaine, rien n'est fabriqué.",
};

const SOUS_CAUSES: Record<string, string> = {
  "coquille-js":
    "coquille JS sans contenu extractible (balises <script> seules) — le parseur tolérant refuse d'inventer des annonces",
  "corps-court": "corps trop court pour porter une information vérifiable",
  "encodage-incertain": "encodage déclaré incohérent avec les octets reçus",
};

function arg(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? fallback : fallback;
}

function lire(path: string): Snapshot {
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
}

function delta(before: Mesure | undefined, after: Mesure | undefined) {
  if (!before || !after) return "absent";
  if (!before.ok && after.ok) return "reparée";
  if (before.ok && !after.ok) return "régression";
  if (before.cause !== after.cause) return `${before.cause}→${after.cause}`;
  return "inchangée";
}

function main(): void {
  const before = lire(arg("before", "bench/results/tor-stability-before.json"));
  const after = lire(arg("after", "bench/results/tor-stability-after.json"));
  const out = arg("out", "bench/results/tor-stability-rapport.json");

  const quarantaines = Object.entries(after.par_source)
    .filter(([, m]) => !m.ok)
    .map(([id, m]) => ({
      id,
      url: m.url,
      cause: m.cause,
      detail: m.detail,
      sous_cause: m.sous_cause,
      extrait: m.extrait,
      explication:
        (SOUS_CAUSES[m.sous_cause ?? ""] ? `${SOUS_CAUSES[m.sous_cause!]} : ` : "") +
        (EXPLICATIONS[m.cause] ?? "cause non classée"),
    }))
    .sort((a, b) => a.cause.localeCompare(b.cause) || a.id.localeCompare(b.id));

  const transitions = Object.entries(after.par_source).map(([id, m]) => ({
    id,
    avant: before.par_source[id]?.ok ?? null,
    apres: m.ok,
    transition: delta(before.par_source[id], m),
    cause_avant: before.par_source[id]?.cause ?? null,
    cause_apres: m.cause,
    ms_avant: before.par_source[id]?.ms ?? null,
    ms_apres: m.ms,
  }));

  const rapport = {
    genere_le: new Date().toISOString(),
    methode:
      "77 sources .onion, un fetch réel chacune via fetchResilient, maxAttempts=1, " +
      "timeout 45 s. Les deux passes utilisent la même liste et le même échantillon.",
    contexte_consigne: {
      annonce: "77 sources .onion, 37 productives, 45 pages en quarantaine (plan de vague)",
      observation:
        `Les 77 sources sont bien présentes. La mesure live compte ${before.ok} puis ${after.ok} sources exploitables ; ` +
        `${before.causes.invalid_content ?? 0} puis ${after.causes.invalid_content ?? 0} pages HTTP 200 sans item extractible, ` +
        `et ${Object.values(before.par_source).filter((m) => !m.ok).length} puis ` +
        `${Object.values(after.par_source).filter((m) => !m.ok).length} sources en échec toutes causes confondues.`,
      quarantaine_raw:
        "Aucune ligne onion dans quarantine_raw dans la base de test : les 45 pages annoncées par la consigne ne s'y trouvent pas. " +
        "Chaque échec observé est expliqué ci-dessous, sans inventer de quarantaine absente.",
    },
    avant: {
      at: before.at,
      total: before.total,
      ok: before.ok,
      taux_succes: before.taux_succes,
      latence_mediane_ms: before.latence_ms.median,
      causes: before.causes,
    },
    apres: {
      at: after.at,
      total: after.total,
      ok: after.ok,
      taux_succes: after.taux_succes,
      latence_mediane_ms: after.latence_ms.median,
      causes: after.causes,
      strategies: after.strategies,
    },
    ecart: {
      sources_reparées: transitions.filter((d) => d.transition === "reparée").length,
      regressions: transitions.filter((d) => d.transition === "régression").length,
      gain_points: +(after.taux_succes - before.taux_succes).toFixed(1),
      delta_latence_mediane_ms: after.latence_ms.median - before.latence_ms.median,
      pages_illisibles_avant: before.causes.invalid_content ?? 0,
      pages_illisibles_apres: after.causes.invalid_content ?? 0,
    },
    transitions,
    quarantaines_expliquees: quarantaines,
    nombre_quarantaines: quarantaines.length,
    rotation_et_backoff: {
      mecanisme:
        "IsolateSOCKSAuth : identifiants SOCKS5 dérivés par source et par échec " +
        "(sha256 avec secret aléatoire par processus) → circuit distinct par source, " +
        "nouveau circuit après chaque échec ; liste RADAR_TOR_SOCKS_LIST en rotation.",
      paliers_ms: {
        circuit: [5000, 15000, 60000],
        timeout: [60000, 300000, 1800000],
        contenu_invalide: [1800000, 7200000],
        bloque: [21600000, 86400000],
      },
      donnees_personnelles_stockées: false,
    },
  };
  writeFileSync(out, JSON.stringify(rapport, null, 2) + "\n");
  console.log(JSON.stringify({
    avant: rapport.avant.taux_succes,
    apres: rapport.apres.taux_succes,
    gain_points: rapport.ecart.gain_points,
    pages_illisibles: `${rapport.ecart.pages_illisibles_avant} → ${rapport.ecart.pages_illisibles_apres}`,
    quarantaines: rapport.nombre_quarantaines,
    out,
  }, null, 2));
}

main();
