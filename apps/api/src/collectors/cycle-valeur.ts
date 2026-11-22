/**
 * Simulation du coût d'un cycle de collecte avant/après la règle de valeur.
 *
 * Le coût d'une collecte est mesuré par ailleurs (traitement réel des items
 * stockés) et fourni en entrée : cette fonction ne fabrique aucun chiffre,
 * elle ne fait que répartir les collectes dans le temps selon les cadences.
 * Un item pertinent est couvert dès la première collecte qui suit sa date ;
 * les deux scénarios portent exactement le même jeu d'items.
 *
 * Fonction pure, sans base ni réseau : la règle et sa mesure sont testables
 * sans attendre un cycle réel de 30 jours.
 */
import {
  classerValeurs,
  type MesureValeurSource,
  type ValeurClassee,
} from "./valeur-plan.js";

export type TacheCycleValeur = {
  id: string;
  intervalSecBase: number;
  mesure: MesureValeurSource;
  /** Coût mesuré d'une collecte, en millisecondes. */
  coutMsParCollecte: number;
  /** Dates des items pertinents NA, en secondes depuis le début de la fenêtre. */
  itemsPertinentsSec: readonly number[];
};

type Scenario = {
  collectes: number;
  tempsMs: number;
  itemsPertinents: number;
};

export type ResultatCycleValeur = {
  horizonSec: number;
  avant: Scenario;
  apres: Scenario;
  gainPct: number;
  couvertureEgale: boolean;
  parSource: Array<{
    id: string;
    rang: number | null;
    regle: ValeurClassee["regle"];
    frequenceSecAvant: number;
    frequenceSecApres: number;
    collectesAvant: number;
    collectesApres: number;
    coutMsParCollecte: number;
  }>;
};

const HORIZON_DEFAUT_SEC = 30 * 24 * 3600;
const MARGE_DEFAUT = 0.8;
const INTERVALLE_MIN_SEC = 60;

function collectesEtCouverture(
  intervalSec: number,
  items: readonly number[],
  horizonSec: number,
): { collectes: number; couverts: number } {
  const interval = Math.max(INTERVALLE_MIN_SEC, intervalSec);
  const collectes = Math.floor(horizonSec / interval) + 1;
  let couverts = 0;
  for (const item of items) {
    if (item < 0 || item > horizonSec) continue;
    const prochaine = Math.ceil(item / interval) * interval;
    if (prochaine <= horizonSec) couverts++;
  }
  return { collectes, couverts };
}

/**
 * Compare le plan actuel (cadence déclarée) au plan priorisé sur le même
 * horizon et le même jeu d'items. Le gain porte sur le temps de collecte
 * cumulé ; à cadence horaire, c'est aussi le temps moyen d'un cycle d'une heure.
 */
export function simulerCycleValeur(
  taches: readonly TacheCycleValeur[],
  options: { horizonSec?: number; marge?: number } = {},
): ResultatCycleValeur {
  const horizonSec = options.horizonSec ?? HORIZON_DEFAUT_SEC;
  const marge = options.marge ?? MARGE_DEFAUT;
  const mesures: Record<string, MesureValeurSource> = {};
  const intervallesBase: Record<string, number> = {};
  for (const tache of taches) {
    mesures[tache.id] = tache.mesure;
    intervallesBase[tache.id] = tache.intervalSecBase;
  }
  const classes = classerValeurs(mesures, intervallesBase);

  let avant: Scenario = { collectes: 0, tempsMs: 0, itemsPertinents: 0 };
  let apres: Scenario = { collectes: 0, tempsMs: 0, itemsPertinents: 0 };
  const parSource: ResultatCycleValeur["parSource"] = [];

  for (const tache of taches) {
    const classe = classes.get(tache.id);
    if (!classe) throw new Error(`tâche sans classement : ${tache.id}`);
    const ancien = collectesEtCouverture(tache.intervalSecBase * marge, tache.itemsPertinentsSec, horizonSec);
    const nouveau = collectesEtCouverture(classe.frequenceSec * marge, tache.itemsPertinentsSec, horizonSec);
    const cout = Math.max(0, tache.coutMsParCollecte);

    avant.collectes += ancien.collectes;
    avant.tempsMs += ancien.collectes * cout;
    avant.itemsPertinents += ancien.couverts;
    apres.collectes += nouveau.collectes;
    apres.tempsMs += nouveau.collectes * cout;
    apres.itemsPertinents += nouveau.couverts;

    parSource.push({
      id: tache.id,
      rang: classe.rang,
      regle: classe.regle,
      frequenceSecAvant: Math.max(INTERVALLE_MIN_SEC, tache.intervalSecBase),
      frequenceSecApres: classe.frequenceSec,
      collectesAvant: ancien.collectes,
      collectesApres: nouveau.collectes,
      coutMsParCollecte: cout,
    });
  }

  parSource.sort((a, b) => (a.rang ?? Number.MAX_SAFE_INTEGER) - (b.rang ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  return {
    horizonSec,
    avant,
    apres,
    gainPct: avant.tempsMs === 0 ? 0 : (avant.tempsMs - apres.tempsMs) / avant.tempsMs * 100,
    couvertureEgale: avant.itemsPertinents === apres.itemsPertinents,
    parSource,
  };
}
