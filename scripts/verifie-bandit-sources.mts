/**
 * Mesure et vérification du bandit d'allocation des sources.
 *
 * Rejoue 1 000 décisions depuis un corpus gelé (aucun réseau, aucune base
 * requise), écrit la trace JSONL et le rapport JSON, relit la trace écrite,
 * puis imprime le critère et sa ligne OBJECTIF. `--db` persiste en plus la
 * campagne dans `bandit_run` / `bandit_decision` (migration 217).
 *
 * Usage :
 *   pnpm verifie:bandit-sources
 *   pnpm mesure:bandit-sources -- --db   # avec DATABASE_URL migré
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { armesDuCorpus, lireCorpus } from "../apps/api/src/bandit/corpus.js";
import { enregistrerBandit } from "../apps/api/src/bandit/store.js";
import {
  CONFIG_BANDIT,
  lignesMesure,
  simulerBandit,
  verifierObjectif,
} from "../apps/api/src/bandit/sources.js";
import { closePools, withTransaction } from "../apps/api/src/db.js";

const RACINE = fileURLToPath(new URL("../", import.meta.url));
const CORPUS = `${RACINE}bench/corpus/bandit-sources-2026-11-23.json`;
const TRACE = `${RACINE}bench/results/bandit-decisions.jsonl`;
const RAPPORT = `${RACINE}bench/results/bandit-sources.json`;
const PERSISTER = process.argv.includes("--db");

async function main(): Promise<void> {
  const corpus = lireCorpus(JSON.parse(await readFile(CORPUS, "utf8")));
  const resultat = simulerBandit(armesDuCorpus(corpus), CONFIG_BANDIT);
  const verdict = verifierObjectif(resultat);
  // L'identifiant d'essai dérive du corpus et des paramètres : changer l'un
  // crée une nouvelle campagne, jamais une métrique réécrite sur d'anciens tirages.
  const empreinte = createHash("sha256")
    .update(JSON.stringify({ config: CONFIG_BANDIT, arms: corpus.arms }))
    .digest("hex")
    .slice(0, 12);
  const runId = `thompson-beta-${empreinte}`;

  const lignesTrace = resultat.decisions.map((d) =>
    JSON.stringify({
      run_id: runId,
      tour: d.tour,
      source_id: d.sourceId,
      score_echantillone: d.scoreEchantillone,
      items_lus: d.itemsLus,
      evenements_nouveaux: d.evenementsNouveaux,
      taux_observe: d.tauxObserve,
      taux_oracle: d.tauxOracle,
      regret_attendu: d.regretAttendu,
      regret_cumule: d.regretCumule,
      posterior_alpha: d.posteriorAlpha,
      posterior_beta: d.posteriorBeta,
    }),
  );
  await writeFile(TRACE, `${lignesTrace.join("\n")}\n`);

  const rapport = {
    genereLe: new Date().toISOString(),
    question: "Allouer l'effort de collecte par décisions tracées, avec regret mesuré contre un oracle rétrospectif",
    run_id: runId,
    corpus: {
      fichier: "bench/corpus/bandit-sources-2026-11-23.json",
      provenance: corpus.provenance,
      sourcesActives: corpus.arms.length,
      fenetreJours: corpus.fenetre_jours,
    },
    methode: {
      algorithme: "Thompson sampling Beta, prior pondéré par l'historique 180 j",
      graine: CONFIG_BANDIT.graine,
      prior_pondere: CONFIG_BANDIT.poidsPrior,
      items_par_decision: CONFIG_BANDIT.itemsParDecision,
      oracle: "meilleure source du corpus gelé, connue seulement après la campagne",
      regret: "attendu : somme (taux oracle - taux de la source choisie), rapportée à 1000 × taux oracle",
    },
    metriques: resultat.metriques,
    verdict,
    trace: "bench/results/bandit-decisions.jsonl",
  };
  await writeFile(RAPPORT, `${JSON.stringify(rapport, null, 2)}\n`);

  // Relecture : la trace publiée doit être exactement celle qui a été mesurée,
  // pas un résumé reconstruit de mémoire.
  const reluBrut = (await readFile(TRACE, "utf8")).trimEnd().split("\n");
  const relue = reluBrut.map((l) => JSON.parse(l));
  const coherente =
    reluBrut.length === lignesTrace.length && reluBrut.every((l, i) => l === lignesTrace[i]);
  if (!coherente) throw new Error("la trace JSONL relue ne correspond pas à la mesure");

  let persiste = "non (--db absent)";
  if (PERSISTER) {
    const ecrit = await withTransaction((client) => enregistrerBandit(client, runId, resultat, corpus.fenetre_jours));
    persiste = `${ecrit.decisions} lignes en base`;
  }

  console.log(`corpus : ${corpus.arms.length} sources actives, fenêtre ${corpus.fenetre_jours} j, graine ${CONFIG_BANDIT.graine}`);
  console.log(`trace : bench/results/bandit-decisions.jsonl (${relue.length} décisions relues) ; persistance ${persiste}`);
  for (const ligne of lignesMesure(resultat)) console.log(ligne);
  if (!verdict.atteint) process.exitCode = 1;
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (PERSISTER) void closePools();
  });
