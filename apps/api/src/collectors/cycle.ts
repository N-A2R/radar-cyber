/**
 * Ordonnancement et point de reprise du cycle de collecte.
 *
 * Un cycle est un tour complet des sources éligibles. Deux garanties :
 *   1. Les sources jamais collectées passent en tête — elles sont la couverture
 *      manquante, pas les sources déjà vues cent fois.
 *   2. Le tour est journalisé en base (`collecte_cycle`). Si le processus meurt
 *      au milieu, le tour suivant reprend les sources encore en attente au lieu
 *      d'en repartir de zéro — là où les sources de fin de liste n'étaient
 *      jamais collectées.
 *
 * Le tri et l'éligibilité sont des fonctions pures : testables sans base, sans
 * réseau et sans horloge factice. Seules les fonctions `demarrer/marquer/
 * terminer` touchent à la table de reprise.
 */
import { query, withTransaction } from "../db.js";
import {
  attenteRestanteMs,
  derniereActiviteMs,
  estMorte,
  type EtatSourceSante,
} from "./sante-source.js";

export const CYCLE_ID = "unique" as const;

export type SourcePlanifiable = EtatSourceSante & { id: string };

export type PlanCycle = {
  /** Sources à traiter dans ce cycle, dans l'ordre. */
  aCollecter: string[];
  /** Sources éligibles mais encore en backoff. */
  reportees: { id: string; attenteMs: number }[];
  /** Sources qu'on ne collectera pas automatiquement. */
  exclues: { id: string; raison: "morte" | "desactivee" }[];
  /** Nommer les sources vierges permet de mesurer la priorité effective. */
  jamaisCollectees: number;
};

function rang(source: SourcePlanifiable): number {
  if (!source.last_ok_at && !source.last_error_at) return 0; // jamais tentée
  if (!source.last_ok_at) return 1; // tentée, jamais réussie
  return 2; // déjà collectée
}

/**
 * Éligibilité + priorité d'un cycle. `maintenant` est injecté pour rendre les
 * backoffs déterministes dans les tests.
 */
export function planifierCycle(
  sources: readonly SourcePlanifiable[],
  maintenant = Date.now(),
): PlanCycle {
  const plan: PlanCycle = { aCollecter: [], reportees: [], exclues: [], jamaisCollectees: 0 };
  const retenues: SourcePlanifiable[] = [];
  for (const source of sources) {
    if (estMorte(source)) {
      plan.exclues.push({ id: source.id, raison: "morte" });
      continue;
    }
    if (source.enabled === false) {
      plan.exclues.push({ id: source.id, raison: "desactivee" });
      continue;
    }
    const attenteMs = attenteRestanteMs(source, maintenant);
    if (attenteMs > 0) {
      plan.reportees.push({ id: source.id, attenteMs });
      continue;
    }
    if (rang(source) === 0) plan.jamaisCollectees += 1;
    retenues.push(source);
  }
  retenues.sort((a, b) => {
    const ecart = rang(a) - rang(b);
    if (ecart !== 0) return ecart;
    const anciennete = derniereActiviteMs(a) - derniereActiviteMs(b);
    return anciennete !== 0 ? anciennete : a.id.localeCompare(b.id);
  });
  plan.aCollecter = retenues.map((s) => s.id);
  return plan;
}

export type CycleRow = {
  id: string;
  debut: string;
  fin: string | null;
  en_attente: string[];
  traitees: string[];
  jamais_collectees: number;
  sources_collectees: number;
  sources_en_echec: number;
  rss_avant_octets: number | null;
  rss_apres_octets: number | null;
};

export type DemarrageCycle = {
  id: typeof CYCLE_ID;
  aCollecter: string[];
  /** Vrai si un cycle précédent a été interrompu et que ses restantes sont reprises. */
  reprise: boolean;
  restantesAvant: number;
};

const COLONNES_CYCLE = `id, debut, fin, en_attente, traitees, jamais_collectees,
  sources_collectees, sources_en_echec, rss_avant_octets, rss_apres_octets`;

export async function cycleCourant(): Promise<CycleRow | null> {
  const r = await query<CycleRow>(`SELECT ${COLONNES_CYCLE} FROM collecte_cycle WHERE id = $1`, [CYCLE_ID]);
  return r.rows[0] ?? null;
}

/**
 * Ouvre un cycle, ou reprend celui qui est resté ouvert. Le `SELECT FOR UPDATE`
 * rend l'opération sûre même si deux processus démarrent en même temps.
 */
export async function demarrerCycle(
  ids: readonly string[],
  stats?: { jamaisCollectees?: number; rssAvantOctets?: number },
  maintenant = new Date(),
): Promise<DemarrageCycle> {
  return withTransaction(async (client) => {
    const r = await client.query<CycleRow>(
      `SELECT ${COLONNES_CYCLE} FROM collecte_cycle WHERE id = $1 FOR UPDATE`,
      [CYCLE_ID],
    );
    const precedent = r.rows[0];
    if (precedent && precedent.fin === null) {
      const dejaTraitees = new Set(precedent.traitees);
      const enCours = new Set(ids);
      const restantes = precedent.en_attente.filter((id) => !dejaTraitees.has(id));
      const aCollecter = restantes.filter((id) => enCours.has(id));
      if (aCollecter.length === 0) {
        await client.query("UPDATE collecte_cycle SET fin = now() WHERE id = $1 AND fin IS NULL", [CYCLE_ID]);
      }
      return { id: CYCLE_ID, aCollecter, reprise: true, restantesAvant: restantes.length };
    }

    await client.query(
      `INSERT INTO collecte_cycle
         (id, debut, fin, en_attente, traitees, jamais_collectees,
          sources_collectees, sources_en_echec, rss_avant_octets, rss_apres_octets)
       VALUES ($1, $2, NULL, $3, '{}', $4, 0, 0, $5, NULL)
       ON CONFLICT (id) DO UPDATE SET
         debut = EXCLUDED.debut, fin = NULL, en_attente = EXCLUDED.en_attente,
         traitees = '{}', jamais_collectees = EXCLUDED.jamais_collectees,
         sources_collectees = 0, sources_en_echec = 0,
         rss_avant_octets = EXCLUDED.rss_avant_octets, rss_apres_octets = NULL`,
      [CYCLE_ID, maintenant, [...ids], stats?.jamaisCollectees ?? 0, stats?.rssAvantOctets ?? null],
    );
    return { id: CYCLE_ID, aCollecter: [...ids], reprise: false, restantesAvant: 0 };
  });
}

/**
 * Consigne une source traitée. Idempotent : un appel en double (reprise après
 * une erreur réseau entre le traitement et l'écriture) ne compte pas deux fois.
 */
export async function marquerTraitee(
  sourceId: string,
  issue: "ok" | "erreur" | "reporte",
  cycleId: typeof CYCLE_ID = CYCLE_ID,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE collecte_cycle
          SET traitees = CASE WHEN $2 = ANY(traitees) THEN traitees ELSE array_append(traitees, $2) END,
              sources_collectees = sources_collectees
                + CASE WHEN $3 = 'ok' AND NOT ($2 = ANY(traitees)) THEN 1 ELSE 0 END,
              sources_en_echec = sources_en_echec
                + CASE WHEN $3 = 'erreur' AND NOT ($2 = ANY(traitees)) THEN 1 ELSE 0 END
        WHERE id = $1 AND fin IS NULL`,
      [cycleId, sourceId, issue],
    );
    await client.query(
      `UPDATE collecte_cycle SET fin = now()
        WHERE id = $1 AND fin IS NULL AND cardinality(traitees) >= cardinality(en_attente)`,
      [cycleId],
    );
  });
}

export async function terminerCycle(
  rssApresOctets?: number,
  cycleId: typeof CYCLE_ID = CYCLE_ID,
): Promise<void> {
  await query(
    `UPDATE collecte_cycle
        SET fin = COALESCE(fin, now()), rss_apres_octets = COALESCE($2, rss_apres_octets)
      WHERE id = $1`,
    [cycleId, rssApresOctets ?? null],
  );
}

/* -------------------------------------------------------------------------- */
/* Mesure : mémoire du processus avant/après, nombre de sources collectées.    */
/* -------------------------------------------------------------------------- */

/** Plafond du gazetteer (mesure séparée) ; reporté ici pour un rapport unique. */
export const LIMITE_MEMOIRE_GAZETTEER_MO = 500;

const OCTETS_PAR_MO = 1048576;
const enMo = (octets: number): number => Math.round((octets / OCTETS_PAR_MO) * 10) / 10;

export type MesureCycle = {
  rssAvantMo: number;
  rssApresMo: number;
  deltaRssMo: number;
  tasAvantMo: number;
  tasApresMo: number;
  deltaTasMo: number;
  sourcesCollectees: number;
  sourcesEnEchec: number;
  jamaisCollectees: number;
  enAttente: number;
  traitees: number;
};

/** Compare deux relevés `process.memoryUsage()` et le compteur du cycle. */
export function mesurerCycle(
  avant: NodeJS.MemoryUsage,
  apres: NodeJS.MemoryUsage,
  cycle: Pick<CycleRow, "sources_collectees" | "sources_en_echec" | "jamais_collectees" | "en_attente" | "traitees"> | null,
): MesureCycle {
  return {
    rssAvantMo: enMo(avant.rss),
    rssApresMo: enMo(apres.rss),
    deltaRssMo: enMo(apres.rss - avant.rss),
    tasAvantMo: enMo(avant.heapUsed),
    tasApresMo: enMo(apres.heapUsed),
    deltaTasMo: enMo(apres.heapUsed - avant.heapUsed),
    sourcesCollectees: cycle?.sources_collectees ?? 0,
    sourcesEnEchec: cycle?.sources_en_echec ?? 0,
    jamaisCollectees: cycle?.jamais_collectees ?? 0,
    enAttente: cycle?.en_attente.length ?? 0,
    traitees: cycle?.traitees.length ?? 0,
  };
}

export function formatRapportCycle(m: MesureCycle): string {
  return [
    `mémoire RSS  : ${m.rssAvantMo} Mo avant → ${m.rssApresMo} Mo après (${m.deltaRssMo >= 0 ? "+" : ""}${m.deltaRssMo} Mo)`,
    `mémoire tas  : ${m.tasAvantMo} Mo avant → ${m.tasApresMo} Mo après (${m.deltaTasMo >= 0 ? "+" : ""}${m.deltaTasMo} Mo)`,
    `sources      : ${m.sourcesCollectees} collectée(s), ${m.sourcesEnEchec} en échec, ${m.jamaisCollectees} jamais collectée(s)`,
    `cycle        : ${m.traitees}/${m.enAttente} traitée(s)`,
  ].join("\n");
}
