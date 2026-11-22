/**
 * Mesure reproductible de la règle de priorisation des sources.
 *
 * Une seule mesure sert à la fois au classement et au comparatif : sur 30
 * jours, items pertinents de Nouvelle-Aquitaine admis par le moteur courant,
 * divisés par le temps de collecte. Le coût d'une collecte n'est pas inventé
 * ici : il est lu dans la mesure publiée `bench/results/cadence.json`.
 *
 * Avant : cadence déclarée de chaque source. Après : cadence issue de la
 * règle (zéro pertinent → hebdomadaire, productif → 2×, premier quintile → 4×).
 * Les deux scénarios portent exactement le même jeu d'items pertinents et
 * sont comparés sur le même horizon de 30 jours.
 *
 * Usage (base de développement sur 5433) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-priorite-sources.mts
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
  chargerValeursSources,
  classerValeurs,
  FENETRE_JOURS,
  LIBELLE_REGLE,
} from "../apps/api/src/collectors/valeur-plan.js";
import {
  simulerCycleValeur,
  type TacheCycleValeur,
} from "../apps/api/src/collectors/cycle-valeur.js";

const RACINE = fileURLToPath(new URL("../", import.meta.url));
const FICHIER_CADENCE = `${RACINE}bench/results/cadence.json`;
const FICHIER_RESULTAT = `${RACINE}bench/results/priorite-sources.json`;
const OBJECTIF_GAIN_PCT = 20;

type MesureCadence = {
  duree_collecte: {
    duree_moyenne_par_collecte_derivee_s: number;
    calcul_derive: string;
    limite: string;
  };
};

async function main(): Promise<void> {
  const cadence = JSON.parse(await readFile(FICHIER_CADENCE, "utf8")) as MesureCadence;
  const coutParCollecteS = cadence.duree_collecte?.duree_moyenne_par_collecte_derivee_s;
  if (!Number.isFinite(coutParCollecteS) || coutParCollecteS <= 0) {
    throw new Error(`coût par collecte absent de ${FICHIER_CADENCE}`);
  }

  const maintenant = new Date();
  const mesures = await chargerValeursSources(query, maintenant);
  const classes = classerValeurs(mesures.mesures, mesures.intervallesBase);
  const taches: TacheCycleValeur[] = Object.keys(mesures.mesures).map((id) => ({
    id,
    intervalSecBase: mesures.intervallesBase[id] ?? 3600,
    mesure: mesures.mesures[id] as TacheCycleValeur["mesure"],
    coutMsParCollecte: coutParCollecteS * 1000,
    itemsPertinentsSec: mesures.itemsPertinentsSec[id] ?? [],
  }));
  const cycle = simulerCycleValeur(taches, { horizonSec: FENETRE_JOURS * 24 * 3600 });

  const classement = [...classes.values()]
    .sort((a, b) => (a.rang ?? Number.MAX_SAFE_INTEGER) - (b.rang ?? Number.MAX_SAFE_INTEGER)
      || b.valeur - a.valeur || a.id.localeCompare(b.id))
    .map((classe) => ({
      id: classe.id,
      pertinentsNA30j: classe.pertinentsNA30j,
      tempsCollecte: classe.tempsCollecte,
      uniteTemps: classe.uniteTemps,
      valeur: Number(classe.valeur.toFixed(6)),
      rang: classe.rang,
      regle: classe.regle,
      libelleRegle: LIBELLE_REGLE[classe.regle],
      frequenceSecAvant: mesures.intervallesBase[classe.id] ?? 3600,
      frequenceSecApres: classe.frequenceSec,
    }));

  const rapport = {
    genereLe: maintenant.toISOString(),
    question: "Classer les sources par valeur et mesurer le temps de cycle avant/après priorisation",
    objectif: { gainPctMinimum: OBJECTIF_GAIN_PCT, couvertureEgale: true },
    methode: {
      fenetreJours: FENETRE_JOURS,
      valeur: "items pertinents NA sur 30 jours / temps de collecte sur la même fenêtre",
      uniteTemps: mesures.uniteTemps,
      coutParCollecteS,
      coutParCollecteSource: {
        fichier: "bench/results/cadence.json",
        calcul: cadence.duree_collecte.calcul_derive,
        limite: cadence.duree_collecte.limite,
      },
      couverture: "un item est couvert dès la première collecte qui suit sa date, dans la fenêtre ; mêmes items dans les deux scénarios",
      margesFrequence: 0.8,
    },
    regle: {
      hebdomadaire: LIBELLE_REGLE.hebdomadaire,
      top: LIBELLE_REGLE.top,
      productif: LIBELLE_REGLE.productif,
      sansMesure: LIBELLE_REGLE["sans-mesure"],
      frequenceHebdoSec: 7 * 24 * 3600,
      facteurTop: 4,
      facteurProductif: 2,
      partTop: 0.2,
    },
    totaux: {
      sourcesMesurees: Object.keys(mesures.mesures).length,
      sourcesProductives: classement.filter((s) => s.rang !== null).length,
      sourcesHebdomadaires: classement.filter((s) => s.regle === "hebdomadaire").length,
      sourcesSansMesure: classement.filter((s) => s.regle === "sans-mesure").length,
      itemsPertinents: cycle.avant.itemsPertinents,
    },
    avant: cycle.avant,
    apres: cycle.apres,
    gainPct: Number(cycle.gainPct.toFixed(2)),
    couvertureEgale: cycle.couvertureEgale,
    classement,
  };

  await writeFile(FICHIER_RESULTAT, `${JSON.stringify(rapport, null, 2)}\n`);
  console.log(`sources mesurées : ${rapport.totaux.sourcesMesurees} (${rapport.totaux.sourcesProductives} productives, ${rapport.totaux.sourcesHebdomadaires} en hebdomadaire)`);
  console.log(`cycle avant : ${(cycle.avant.tempsMs / 1000).toFixed(1)} s, ${cycle.avant.collectes} collectes, ${cycle.avant.itemsPertinents} items couverts`);
  console.log(`cycle après : ${(cycle.apres.tempsMs / 1000).toFixed(1)} s, ${cycle.apres.collectes} collectes, ${cycle.apres.itemsPertinents} items couverts`);
  console.log(`gain : ${rapport.gainPct} % ; couverture égale : ${cycle.couvertureEgale}`);
  console.log(`résultat écrit : ${FICHIER_RESULTAT}`);

  if (!cycle.couvertureEgale) throw new Error("couverture inégale : la règle perd des items pertinents");
  if (cycle.gainPct < OBJECTIF_GAIN_PCT) {
    throw new Error(`objectif non atteint : ${rapport.gainPct} % < ${OBJECTIF_GAIN_PCT} %`);
  }
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => { void closePools(); });
