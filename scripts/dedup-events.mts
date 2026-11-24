#!/usr/bin/env -S npx tsx
/**
 * Doublons existants d'événements de flux : rapport, puis nettoyage optionnel.
 *
 * L'unicité est portée par `event_fingerprint_key` (migration 045) :
 *   titre normalisé (minuscules, accents tombés, ponctuation = espace)
 *   + jour UTC de `observed_at` + identifiant de source.
 * Le périmètre est volontairement limité aux événements `feed:%` : les autres
 * voies d'écriture (Hermès, revue, quarantaine) ont leur propre clé et ne
 * portent pas d'empreinte. Le survivant est le plus petit id, donc le plus
 * ancien enregistrement, stable d'une exécution à l'autre.
 *
 * En mode `--appliquer`, les alertes qui pointaient sur un doublon sont
 * réaffectées au survivant (sauf conflit sur `(rule_id, event_id)`, auquel cas
 * le doublon est conservé et compté dans `doublonsConserves`), puis les
 * doublons restants sont supprimés dans une seule transaction. Le rapport
 * indique séparément le nombre trouvé et le nombre effectivement nettoyé.
 *
 * Usage :
 *   tsx scripts/dedup-events.mts                      # rapport JSON sur stdout, aucune écriture
 *   tsx scripts/dedup-events.mts --json=rapport.json  # rapport sur disque
 *   tsx scripts/dedup-events.mts --appliquer          # supprime les doublons après rapport
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PoolClient } from "pg";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { archiverEvenements } from "../apps/api/src/dedup/archive.js";

/**
 * Même expression que `db/migrate-045-dedup-empreinte.sql`, recopiée ici
 * uniquement pour que la détection porte sur les lignes dont l'empreinte est
 * absente (écriture antérieure à la migration).
 */
const EMPREINTE_SQL = `btrim(regexp_replace(
       translate(lower(title),
         'àáâãäåçèéêëìíîïñòóôõöøùúûüýÿ',
         'aaaaaaceeeeiiiinoooooouuuuyy'),
       '[^a-z0-9]+', ' ', 'g'))
   || '|' || COALESCE(
     lpad(extract(year from (observed_at AT TIME ZONE 'UTC'))::text, 4, '0') || '-' ||
     lpad(extract(month from (observed_at AT TIME ZONE 'UTC'))::text, 2, '0') || '-' ||
     lpad(extract(day from (observed_at AT TIME ZONE 'UTC'))::text, 2, '0'),
     'sans-date')
   || '|' || source_id`;

type Ligne = {
  id: number;
  title: string;
  source_id: string;
  observed_at: string | null;
  dedup_key: string;
  fingerprint: string | null;
  empreinte: string;
};

type Groupe = {
  empreinte: string;
  taille: number;
  survivantId: number;
  doublons: Ligne[];
  supprimes: number[];
  conserves: number[];
};

type Rapport = {
  genereA: string;
  base: string;
  mode: "rapport" | "application";
  regles: {
    empreinte: string;
    perimeter: string;
    survivant: string;
  };
  evenementsFlux: number;
  nombreGroupes: number;
  doublonsTrouves: number;
  doublonsNettoyes: number;
  doublonsConserves: number;
  alertesRedirigees: number;
  groupes: Groupe[];
};

type Options = { appliquer: boolean; jsonFichier: string | null };

function usage(): never {
  console.error(
    [
      "usage : tsx scripts/dedup-events.mts [--appliquer] [--json=<fichier>]",
      "",
      "Par défaut : rapport JSON sur stdout (journal sur stderr), aucune écriture.",
      "--appliquer supprime les doublons trouvés dans une transaction.",
    ].join("\n"),
  );
  process.exit(2);
}

function analyserArgs(argv: string[]): Options {
  const options: Options = { appliquer: false, jsonFichier: null };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") usage();
    else if (arg === "--appliquer") options.appliquer = true;
    else if (arg.startsWith("--json=")) {
      const chemin = arg.slice("--json=".length);
      if (!chemin) throw new Error("--json= attend un chemin de fichier");
      options.jsonFichier = chemin;
    } else throw new Error(`argument inconnu : ${arg}`);
  }
  return options;
}

async function detecter(): Promise<{ evenementsFlux: number; groupes: Groupe[] }> {
  const total = await query<{ total: number }>(
    "SELECT count(*)::int AS total FROM event WHERE dedup_key LIKE 'feed:%'",
  );
  const { rows } = await query<Ligne>(
    `WITH flux AS (
       SELECT id, title, source_id, observed_at, dedup_key, fingerprint,
              COALESCE(fingerprint, ${EMPREINTE_SQL}) AS empreinte
         FROM event
        WHERE dedup_key LIKE 'feed:%'
     ), doublons AS (
       SELECT empreinte FROM flux GROUP BY empreinte HAVING count(*) > 1
     )
     SELECT f.* FROM flux f JOIN doublons USING (empreinte)
      ORDER BY f.empreinte, f.id`,
  );
  const parEmpreinte = new Map<string, Ligne[]>();
  for (const ligne of rows) {
    const membres = parEmpreinte.get(ligne.empreinte) ?? [];
    membres.push(ligne);
    parEmpreinte.set(ligne.empreinte, membres);
  }
  const groupes: Groupe[] = [...parEmpreinte].map(([empreinte, membres]) => ({
    empreinte,
    taille: membres.length,
    survivantId: membres[0]!.id,
    doublons: membres.slice(1),
    supprimes: [],
    conserves: [],
  }));
  return { evenementsFlux: total.rows[0]?.total ?? 0, groupes };
}

/** Réaffecte les alertes puis désigne les doublons réellement supprimables. */
async function preparerGroupe(client: PoolClient, groupe: Groupe): Promise<void> {
  const cibles = groupe.doublons.map((ligne) => ligne.id);
  await client.query(
    `UPDATE alert SET event_id = $1
      WHERE event_id = ANY($2)
        AND NOT EXISTS (SELECT 1 FROM alert a WHERE a.rule_id = alert.rule_id AND a.event_id = $1)`,
    [groupe.survivantId, cibles],
  );
  const restants = await client.query<{ event_id: number }>(
    "SELECT DISTINCT event_id FROM alert WHERE event_id = ANY($1)", [cibles],
  );
  const encoreReferences = new Set(restants.rows.map((ligne) => ligne.event_id));
  groupe.supprimes = cibles.filter((id) => !encoreReferences.has(id));
  groupe.conserves = cibles.filter((id) => encoreReferences.has(id));
}

async function nettoyer(groupes: Groupe[]): Promise<{ supprimes: number; alertesRedirigees: number }> {
  let supprimes = 0;
  let alertesRedirigees = 0;
  await withTransaction(async (client) => {
    for (const groupe of groupes) {
      const avant = await client.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM alert WHERE event_id = ANY($1)",
        [groupe.doublons.map((ligne) => ligne.id)],
      );
      await preparerGroupe(client, groupe);
      alertesRedirigees += (avant.rows[0]?.total ?? 0) - groupe.conserves.length;
      if (groupe.supprimes.length === 0) continue;
      await archiverEvenements(client, groupe.supprimes);
      const resultat = await client.query(
        "DELETE FROM event WHERE id = ANY($1)", [groupe.supprimes],
      );
      supprimes += resultat.rowCount ?? 0;
    }
  });
  return { supprimes, alertesRedirigees };
}

async function main(): Promise<void> {
  const options = analyserArgs(process.argv.slice(2));
  const journal = (message: string): void => console.error(`[dedup-events] ${message}`);
  const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";

  journal("analyse des événements de flux (titre normalisé + jour UTC + source)…");
  const { evenementsFlux, groupes } = await detecter();
  const doublonsTrouves = groupes.reduce((n, g) => n + g.doublons.length, 0);
  journal(`${evenementsFlux.toLocaleString("fr-FR")} événement(s) de flux lus`);
  journal(`${groupes.length} groupe(s) de doublons, ${doublonsTrouves} doublon(s) trouvé(s)`);
  for (const groupe of groupes.slice(0, 20)) {
    journal(`  ${groupe.empreinte}  ${groupe.taille} ligne(s)  survivant #${groupe.survivantId}`);
  }
  if (groupes.length > 20) journal(`  … ${groupes.length - 20} autre(s) groupe(s) dans le JSON`);

  let doublonsNettoyes = 0;
  let doublonsConserves = 0;
  let alertesRedirigees = 0;
  if (options.appliquer) {
    const resultat = await nettoyer(groupes);
    doublonsNettoyes = resultat.supprimes;
    doublonsConserves = doublonsTrouves - doublonsNettoyes;
    alertesRedirigees = resultat.alertesRedirigees;
    journal(`${doublonsNettoyes} doublon(s) supprimé(s), ${alertesRedirigees} alerte(s) réaffectée(s)`);
  } else {
    journal("mode rapport : aucune écriture. --appliquer pour supprimer les doublons.");
  }

  const rapport: Rapport = {
    genereA: new Date().toISOString(),
    base: new URL(url).pathname.slice(1),
    mode: options.appliquer ? "application" : "rapport",
    regles: {
      empreinte: "titre normalisé + jour UTC de observed_at + source_id (migration 045)",
      perimeter: "event.dedup_key LIKE 'feed:%'",
      survivant: "plus petit event.id du groupe (le plus ancien, choix stable)",
    },
    evenementsFlux,
    nombreGroupes: groupes.length,
    doublonsTrouves,
    doublonsNettoyes,
    doublonsConserves,
    alertesRedirigees,
    groupes,
  };
  const json = `${JSON.stringify(rapport, null, 2)}\n`;
  if (options.jsonFichier) {
    const chemin = resolve(options.jsonFichier);
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, json, "utf8");
    journal(`rapport JSON écrit : ${chemin}`);
  } else {
    process.stdout.write(json);
  }
}

try {
  await main();
} catch (erreur) {
  console.error(`[dedup-events] échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  process.exitCode = 1;
} finally {
  await closePools();
}
