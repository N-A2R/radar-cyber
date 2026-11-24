/**
 * Valeur d'une source pour la planification.
 *
 * Une source n'a pas de valeur « en soi » : elle en a une par rapport à ce
 * qu'elle coûte. La mesure est donc un rapport, sur la même fenêtre de 30 jours :
 *
 *     items pertinents de Nouvelle-Aquitaine / temps de collecte
 *
 * Un item pertinent est un événement régional admis par le moteur de
 * pertinence (score >= seuil, ou règle de couverture org/epss/dept). Le temps
 * de collecte est la somme des durées des runs sur la fenêtre ; quand la base
 * n'enregistre pas encore ces durées (toutes à zéro), le nombre de runs sert
 * d'unité de temps explicite — le rapport devient alors des items par collecte.
 * L'unité utilisée est publiée avec le classement, jamais devinée à l'affiche.
 *
 * La règle de cadence qui en découle est volontairement simple et réversible :
 *   - zéro pertinent sur 30 j → hebdomadaire (604 800 s) ;
 *   - sources productives classées par valeur décroissante :
 *       * le premier quintile → 4× plus souvent que sa cadence déclarée ;
 *       * les autres → 2× plus souvent ;
 *   - source sans mesure → cadence déclarée, inchangée.
 * Aucune source productive n'est ralentie, aucune source muette n'est coupée :
 * on change la fréquence, pas la couverture.
 * Les jeux d'or et sources d'évaluation (`bench-*`, `precision-eval-*`) sont
 * écartés avant comptage : ce ne sont pas des sources de production.
 */
import { query } from "../db.js";
import { evaluatePertinence } from "./pertinence.js";

export const FENETRE_JOURS = 30;
export const FREQUENCE_MIN_SEC = 60;
export const FREQUENCE_HEBDO_SEC = 7 * 24 * 3600;
export const FACTEUR_TOP = 4;
export const FACTEUR_PRODUCTIF = 2;
export const PART_TOP = 0.2;
export const FREQUENCE_DEFAUT_SEC = 3600;
/**
 * Jeux d'or et sources d'évaluation semés en base (`bench-*`,
 * `precision-eval-*`). Ils portent leurs propres runs et événements
 * synthétiques : les écarter de la mesure évite de leur donner une cadence de
 * production. Le registre `/api/sources` peut continuer à les afficher.
 */
export const MOTIF_SOURCE_MESURE = "^(bench-|precision-eval-)";
const SOURCE_MESURE = new RegExp(MOTIF_SOURCE_MESURE);
export const estSourceDeMesure = (id: string): boolean => SOURCE_MESURE.test(id);

export type UniteTemps = "secondes" | "runs";

export type MesureValeurSource = {
  pertinentsNA30j: number;
  tempsCollecte: number;
  uniteTemps: UniteTemps;
};

export type RegleCadence = "hebdomadaire" | "top" | "productif" | "sans-mesure";

export const LIBELLE_REGLE: Readonly<Record<RegleCadence, string>> = {
  hebdomadaire: "zéro pertinent NA sur 30 j → hebdomadaire",
  top: "premier quintile de valeur → 4× plus souvent",
  productif: "source productive → 2× plus souvent",
  "sans-mesure": "aucune mesure → cadence déclarée",
};

export type ValeurClassee = MesureValeurSource & {
  id: string;
  /** Items pertinents par unité de temps de collecte. */
  valeur: number;
  /** Rang parmi les sources productives ; null pour zéro ou sans mesure. */
  rang: number | null;
  frequenceSec: number;
  regle: RegleCadence;
};

/** Items pertinents / temps de collecte ; zéro temps est borné à une unité. */
export function valeurDe(mesure: MesureValeurSource): number {
  if (mesure.pertinentsNA30j <= 0) return 0;
  return mesure.pertinentsNA30j / Math.max(1, mesure.tempsCollecte);
}

function cadenceDe(baseSec: number, facteur: number): number {
  const base = Number.isFinite(baseSec) && baseSec > 0 ? baseSec : FREQUENCE_DEFAUT_SEC;
  return Math.max(FREQUENCE_MIN_SEC, Math.floor(base / facteur));
}

/**
 * Classe les sources et déduit leur cadence. Fonction pure : l'ordre des clés
 * d'entrée ne change pas le résultat (égalité de valeur → id lexicographique).
 * Le rang ne compte que les sources qui rapportent au moins un item.
 */
export function classerValeurs(
  mesures: Readonly<Record<string, MesureValeurSource>>,
  intervallesBase: Readonly<Record<string, number>>,
): Map<string, ValeurClassee> {
  const ids = new Set<string>([...Object.keys(mesures), ...Object.keys(intervallesBase)]);
  const sorties = new Map<string, ValeurClassee>();
  const productives: ValeurClassee[] = [];

  for (const id of ids) {
    const mesure = mesures[id];
    const base = intervallesBase[id] ?? FREQUENCE_DEFAUT_SEC;
    if (!mesure) {
      sorties.set(id, {
        id,
        pertinentsNA30j: 0,
        tempsCollecte: 0,
        uniteTemps: "secondes",
        valeur: 0,
        rang: null,
        frequenceSec: cadenceDe(base, 1),
        regle: "sans-mesure",
      });
      continue;
    }
    const valeur = valeurDe(mesure);
    if (mesure.pertinentsNA30j <= 0) {
      sorties.set(id, {
        ...mesure,
        id,
        valeur,
        rang: null,
        frequenceSec: FREQUENCE_HEBDO_SEC,
        regle: "hebdomadaire",
      });
      continue;
    }
    const classe: ValeurClassee = {
      ...mesure,
      id,
      valeur,
      rang: null,
      frequenceSec: cadenceDe(base, FACTEUR_PRODUCTIF),
      regle: "productif",
    };
    productives.push(classe);
    sorties.set(id, classe);
  }

  productives.sort((a, b) => b.valeur - a.valeur
    || b.pertinentsNA30j - a.pertinentsNA30j
    || a.id.localeCompare(b.id));
  const seuilTop = Math.max(1, Math.ceil(productives.length * PART_TOP));
  for (const [index, classe] of productives.entries()) {
    classe.rang = index + 1;
    if (index < seuilTop) {
      classe.frequenceSec = cadenceDe(intervallesBase[classe.id] ?? FREQUENCE_DEFAUT_SEC, FACTEUR_TOP);
      classe.regle = "top";
    }
  }
  return sorties;
}

type LigneNA = {
  source_id: string;
  title: string | null;
  summary: string | null;
  admission_rule: string | null;
  secondes: string | number | null;
};

type LigneRun = {
  source_id: string;
  runs: string | number;
  secondes: string | number | null;
};

type LigneBase = { id: string; interval_sec: number | null };

const SQL_EVENEMENTS_NA = `
  SELECT e.source_id, e.title, e.summary, e.admission_rule,
         extract(epoch FROM (COALESCE(e.observed_at, e.collected_at)
           - ($1::timestamptz - interval '30 days'))) AS secondes
    FROM event e
    JOIN source s ON s.id = e.source_id AND s.enabled
   WHERE e.regional = true
     AND COALESCE(e.observed_at, e.collected_at) BETWEEN $1::timestamptz - interval '30 days' AND $1::timestamptz
`;

const SQL_RUNS = `
  SELECT r.source_id,
         count(*) AS runs,
         sum(GREATEST(0, extract(epoch FROM (r.finished_at - r.started_at)))) AS secondes
    FROM collector_run r
    JOIN source s ON s.id = r.source_id AND s.enabled
   WHERE r.started_at >= $1::timestamptz - interval '30 days'
     AND r.finished_at IS NOT NULL
   GROUP BY r.source_id
`;

const SQL_BASE = `SELECT id, interval_sec FROM source WHERE enabled`;


export type MesuresValeurs = {
  mesures: Record<string, MesureValeurSource>;
  intervallesBase: Record<string, number>;
  uniteTemps: UniteTemps;
  /** Dates des items pertinents, en secondes depuis le début de la fenêtre. */
  itemsPertinentsSec: Record<string, number[]>;
  /** Sources de mesure rencontrées en base et écartées du classement, triées. */
  sourcesExclues: string[];
};
const REGLES_COUVERTURE: Readonly<Record<string, true>> = { org: true, epss: true, dept: true };
/**
 * Charge les mesures depuis la base. Le score de pertinence est recalculé avec
 * le moteur courant : les événements historiques n'ont pas tous de score
 * stocké, et une mesure doit rester rejouable après un changement de seuil.
 */
export async function chargerValeursSources(
  exec: typeof query = query,
  maintenant: Date | number = new Date(),
): Promise<MesuresValeurs> {
  const date = maintenant instanceof Date ? maintenant : new Date(maintenant);
  const [evenements, runs, bases] = await Promise.all([
    exec<LigneNA>(SQL_EVENEMENTS_NA, [date]),
    exec<LigneRun>(SQL_RUNS, [date]),
    exec<LigneBase>(SQL_BASE),
  ]);

  const exclues = new Set<string>();
  const pertinents = new Map<string, number>();
  const itemsPertinentsSec: Record<string, number[]> = {};
  for (const ligne of evenements.rows) {
    if (estSourceDeMesure(ligne.source_id)) {
      exclues.add(ligne.source_id);
      continue;
    }
    const admission = ligne.admission_rule === null ? null : String(ligne.admission_rule);
    const verdict = evaluatePertinence({ title: ligne.title, summary: ligne.summary });
    if (!verdict.relevant && (admission === null || REGLES_COUVERTURE[admission] !== true)) continue;
    pertinents.set(ligne.source_id, (pertinents.get(ligne.source_id) ?? 0) + 1);
    const secondes = Number(ligne.secondes);
    if (Number.isFinite(secondes) && secondes >= 0) {
      (itemsPertinentsSec[ligne.source_id] ??= []).push(secondes);
    }
  }

  const temps = new Map<string, { runs: number; secondes: number }>();
  for (const ligne of runs.rows) {
    if (estSourceDeMesure(ligne.source_id)) {
      exclues.add(ligne.source_id);
      continue;
    }
    temps.set(ligne.source_id, {
      runs: Math.max(1, Number(ligne.runs) || 0),
      secondes: Math.max(0, Number(ligne.secondes) || 0),
    });
  }
  const uniteTemps: UniteTemps = [...temps.values()].some((t) => t.secondes > 0) ? "secondes" : "runs";

  const mesures: Record<string, MesureValeurSource> = {};
  const intervallesBase: Record<string, number> = {};
  for (const ligne of bases.rows) {
    if (estSourceDeMesure(ligne.id)) {
      exclues.add(ligne.id);
      continue;
    }
    const brut = ligne.interval_sec;
    intervallesBase[ligne.id] = typeof brut === "number" && Number.isFinite(brut) && brut > 0
      ? brut
      : FREQUENCE_DEFAUT_SEC;
    const t = temps.get(ligne.id);
    const nb = pertinents.get(ligne.id) ?? 0;
    // Sans run ni item pertinent, il n'existe aucune mesure : ne pas fabriquer
    // un zéro qui enverrait la source en hebdomadaire.
    if (!t && nb === 0) continue;
    mesures[ligne.id] = {
      pertinentsNA30j: nb,
      tempsCollecte: uniteTemps === "secondes" ? Math.max(1, t?.secondes ?? 0) : (t?.runs ?? 1),
      uniteTemps,
    };
  }
  return { mesures, intervallesBase, uniteTemps, itemsPertinentsSec, sourcesExclues: [...exclues].sort() };
}
/** Cadences à appliquer au planificateur : une mesure, une seule règle, un seul objet. */
export async function chargerCadencesValeur(
  exec: typeof query = query,
  maintenant: Date | number = new Date(),
): Promise<Record<string, number>> {
  const { mesures, intervallesBase } = await chargerValeursSources(exec, maintenant);
  const classes = classerValeurs(mesures, intervallesBase);
  const cadences: Record<string, number> = {};
  for (const [id, classe] of classes) cadences[id] = classe.frequenceSec;
  return cadences;
}
