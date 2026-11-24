/**
 * Contrats partagés entre le runner de migrations et les tests de dérive.
 *
 * L'historique `schema_migrations` stocke le NOM DE FICHIER (extension `.sql`
 * incluse). Deux règles évitent les pièges documentés dans l'audit base :
 *
 *  1. l'ordre est (`préfixe numérique`, `nom complet`) — jamais un
 *     `localeCompare` brut qui exécuterait `migrate-010` après `migrate-225` ;
 *  2. les versions appliquées en production dont le SQL n'a jamais été
 *     versionné sont des TOMBSTONES : fichiers explicites, sans effet, qui
 *     réconcilient l'historique sans inventer une requête perdue.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

export type Tombstone = {
  version: string;
  /** Fichier versionné qui porte aujourd'hui l'effet de cette version. */
  successor: string;
  reason: string;
};

export const TOMBSTONES: readonly Tombstone[] = [
  {
    version: "migrate-047-org-search-indexable.sql",
    successor: "migrate-048-orgs-list-indexes.sql",
    reason: "index de tri de la liste des organisations recréé sous le numéro 048",
  },
  {
    version: "migrate-051-ctlogs-inventaire.sql",
    successor: "migrate-052-ctlogs-inventaire.sql",
    reason: "inventaire CT log renommé 051 → 052 sans migration de l'historique",
  },
  {
    version: "migrate-061-org-naf-detail.sql",
    successor: "migrate-064-org-naf-detail.sql",
    reason: "détail NAF renommé 061 → 064",
  },
  {
    version: "migrate-063-media-transcription.sql",
    successor: "migrate-064-media-transcription.sql",
    reason: "transcription média renommée 063 → 064",
  },
  {
    version: "migrate-064-source-verification.sql",
    successor: "migrate-066-source-verification.sql",
    reason: "vérification des sources renommée 064 → 066",
  },
  {
    version: "migrate-200-negative-attestation.sql",
    successor: "migrate-201-negative-attestation.sql",
    reason: "registre des attestations négatives renommé 200 → 201",
  },
  {
    version: "migrate-200-registre-retention-raw.sql",
    successor: "migrate-201-registre-retention-raw.sql",
    reason: "registre de rétention du brut renommé 200 → 201",
  },
  {
    version: "migrate-216-campaign-precursor.sql",
    successor: "migrate-219-campaign-precursor-detector.sql",
    reason: "détecteur de précurseur de campagne repris sous le numéro 219",
  },
  {
    version: "migrate-218-identite-legale-stock-lot.sql",
    successor: "migrate-215-org-siren-verifie.sql",
    reason: "identité légale / stock LOT repris dans la migration 215 (antérieure mais déjà appliquée)",
  },
];

/** Versions ajoutées pour les réparations : applicables sur une base copiée. */
export const REPAIR_VERSIONS: readonly string[] = [
  "migrate-231-event-archive-incidents.sql",
  "migrate-232-v-event-all-dedup.sql",
  "migrate-233-org-score-referentiel-scope.sql",
  "migrate-234-org-unknown-index.sql",
  "migrate-235-post-load-analyze.sql",
  "migrate-236-violation-rgpd-workflow.sql",
  "migrate-237-enrich-job-partial.sql",
  "migrate-238-confidence-regle-version.sql",
  "migrate-239-access-log-no-delete.sql",
  "migrate-240-source-readiness.sql",
  "migrate-241-fk-leading-indexes.sql",
  "migrate-242-event-temporal-order.sql",
  "migrate-243-event-temporal-normalisation.sql",
  "migrate-244-retention-grants.sql",
  "migrate-245-temporal-benchmark-exemption.sql",
  "migrate-246-fixture-temporal-normalisation.sql",
  "migrate-247-access-log-no-truncate.sql",
];

function numericPrefix(file: string): number {
  const match = /^migrate-(\d+)/.exec(file);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/** Ordre d'application déterministe, indépendant du locale de la machine. */
export function compareMigrations(a: string, b: string): number {
  const pa = numericPrefix(a);
  const pb = numericPrefix(b);
  return pa - pb || a.localeCompare(b, "en");
}

export function listMigrations(dir = join(process.cwd(), "db")): string[] {
  return readdirSync(dir)
    .filter((f) => /^migrate-.*\.sql$/.test(f))
    .sort(compareMigrations);
}

/**
 * Retire les seules lignes de contrôle de transaction écrites pour `psql`.
 *
 * Un `BEGIN;` au début d'un fichier et son `COMMIT;` à la fin ne sont pas des
 * instructions métier : le runner porte désormais la transaction afin que la
 * version soit enregistrée dans le MÊME commit. Les `BEGIN` de blocs PL/pgSQL
 * n'ont pas de point-virgule et sont conservés ; les lignes à l'intérieur d'un
 * corps dollar-quoté sont également conservées.
 */
export function stripTransactionControl(sql: string): string {
  const dollarTag = /\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/g;
  const wholeLineTag = /^\s*(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)\s*$/;
  const txLine = /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*$/i;
  let openTag: string | null = null;
  const kept: string[] = [];

  for (const line of sql.split("\n")) {
    if (openTag !== null) {
      if (wholeLineTag.test(line) && line.trim() === openTag) openTag = null;
      else if ((line.match(dollarTag) ?? []).includes(openTag)) openTag = null;
      kept.push(line);
      continue;
    }
    if (!txLine.test(line)) {
      const tags = line.match(dollarTag) ?? [];
      // Une seule occurrence ouvre un corps ; deux occurrences se ferment
      // sur la même ligne et ne laissent aucun corps ouvert.
      if (tags.length === 1) openTag = tags[0];
      kept.push(line);
    }
  }
  return kept.join("\n");
}
