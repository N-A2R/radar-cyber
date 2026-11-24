// Allocation de l'effort de collecte par un bandit Thompson, avec décisions
// tracées et regret mesuré contre un oracle rétrospectif.
//
// Le corpus est un agrégat gelé de `collector_run` (voir le JSON dans
// bench/corpus) : chaque bras est une source active, son rendement vrai est
// `evenements_nouveaux / items_lus` observé sur 180 jours. L'oracle est la
// meilleure source de ce même historique, connue seulement après coup.
// Le bandit ne la connaît pas : il tire dans un posterior Beta amorcé par
// l'historique, puis apprend de 1 000 décisions rejouables depuis une graine.
//
// Aucune donnée personnelle : seuls des identifiants de sources publiques et
// des compteurs agrégés circulent ici.

export interface SourceArm {
  id: string;
  family: string;
  itemsIn: number;
  itemsNew: number;
  runs: number;
}

export interface BanditConfig {
  graine: number;
  nbDecisions: number;
  itemsParDecision: number;
  poidsPrior: number;
  tauxReference: number;
}

export interface DecisionBandit {
  tour: number;
  sourceId: string;
  scoreEchantillone: number;
  itemsLus: number;
  evenementsNouveaux: number;
  tauxObserve: number;
  tauxVrai: number;
  tauxOracle: number;
  regretAttendu: number;
  regretCumule: number;
  posteriorAlpha: number;
  posteriorBeta: number;
}

export interface MetriquesBandit {
  decisions: number;
  itemsLus: number;
  evenementsNouveaux: number;
  rendement: number;
  tauxReference: number;
  tauxCible: number;
  tauxOracle: number;
  oracleSourceId: string;
  sourcesExplorees: number;
  regretCumule: number;
  regretPct: number;
  regretCiblePct: number;
}

export interface ResultatBandit {
  config: BanditConfig;
  armes: ReadonlyArray<{ id: string; tauxVrai: number; itemsIn: number; itemsNew: number; runs: number }>;
  decisions: DecisionBandit[];
  metriques: MetriquesBandit;
}

/** Référence historique : 8,8 % d'événements cyber dans la famille cti. */
export const TAUX_REFERENCE = 0.088;
/** Cible du chantier : deux fois la référence, soit 17,6 %. */
export const TAUX_CIBLE = 2 * TAUX_REFERENCE;
/** Regret cumulé maximal, en fraction du rendement de l'oracle. */
export const REGRET_CIBLE = 0.2;
export const CONFIG_BANDIT: BanditConfig = {
  graine: 20261123,
  nbDecisions: 1000,
  itemsParDecision: 100,
  poidsPrior: 0.005,
  tauxReference: TAUX_REFERENCE,
};

/** PRNG deterministe : deux exécutions avec la même graine donnent les mêmes tirs. */
export function generateur(graine: number): () => number {
  let etat = graine | 0;
  return () => {
    etat |= 0;
    etat = (etat + 0x6d2b79f5) | 0;
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** tirage Gamma de Marsaglia–Tsang, utilisé pour construire une loi Beta. */
function gamma(shape: number, rnd: () => number): number {
  if (shape < 1) return gamma(shape + 1, rnd) * Math.pow(rnd(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let z: number;
    do {
      const u = rnd();
      x = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
      z = 1 + c * x;
    } while (z <= 0);
    z = z * z * z;
    const u2 = rnd();
    if (u2 < 1 - 0.0331 * x ** 4 || Math.log(u2) < 0.5 * x * x + d * (1 - z + Math.log(z))) {
      return d * z;
    }
  }
}

/** Tirage Beta(alpha, beta) : la note qui porte la décision d'allocation. */
export function echantillonBeta(alpha: number, beta: number, rnd: () => number): number {
  const a = gamma(alpha, rnd);
  const b = gamma(beta, rnd);
  return a / (a + b);
}

/**
 * Rejoue une campagne de 1 000 décisions. L'observation est un lot de `items`
 * items prélevés sur la source : `nouveaux` suit une binomiale de paramètre
 * le rendement vrai de la source dans l'historique gelé.
 */
export function simulerBandit(armesSource: readonly SourceArm[], config: BanditConfig): ResultatBandit {
  if (armesSource.length === 0) throw new Error("aucune source active à allouer");
  if (config.nbDecisions <= 0 || config.itemsParDecision <= 0) throw new Error("campagne vide");

  // Ordre stable : rendement décroissant, puis identifiant. L'oracle est lu
  // dans cet historique integral, jamais dans les observations du bandit.
  const armes = armesSource
    .map((a) => ({ id: a.id, tauxVrai: a.itemsNew / a.itemsIn, itemsIn: a.itemsIn, itemsNew: a.itemsNew, runs: a.runs }))
    .sort((a, b) => b.tauxVrai - a.tauxVrai || a.id.localeCompare(b.id));
  const oracle = armes[0];
  const rnd = generateur(config.graine);
  const alpha = armes.map((a) => 1 + config.poidsPrior * a.itemsNew);
  const beta = armes.map((a) => 1 + config.poidsPrior * (a.itemsIn - a.itemsNew));
  const decisions: DecisionBandit[] = [];
  const tirages = new Array<number>(armes.length).fill(0);
  let regretCumule = 0;
  let evenementsNouveaux = 0;

  for (let tour = 1; tour <= config.nbDecisions; tour++) {
    let choix = 0;
    let meilleurScore = -1;
    for (let i = 0; i < armes.length; i++) {
      const score = echantillonBeta(alpha[i], beta[i], rnd);
      if (score > meilleurScore) {
        meilleurScore = score;
        choix = i;
      }
    }

    let nouveaux = 0;
    for (let k = 0; k < config.itemsParDecision; k++) {
      if (rnd() < armes[choix].tauxVrai) nouveaux++;
    }
    alpha[choix] += nouveaux;
    beta[choix] += config.itemsParDecision - nouveaux;
    tirages[choix]++;
    evenementsNouveaux += nouveaux;

    const regretAttendu = oracle.tauxVrai - armes[choix].tauxVrai;
    regretCumule += regretAttendu;
    decisions.push({
      tour,
      sourceId: armes[choix].id,
      scoreEchantillone: meilleurScore,
      itemsLus: config.itemsParDecision,
      evenementsNouveaux: nouveaux,
      tauxObserve: nouveaux / config.itemsParDecision,
      tauxVrai: armes[choix].tauxVrai,
      tauxOracle: oracle.tauxVrai,
      regretAttendu,
      regretCumule,
      posteriorAlpha: alpha[choix],
      posteriorBeta: beta[choix],
    });
  }

  const itemsLus = config.nbDecisions * config.itemsParDecision;
  const metriques: MetriquesBandit = {
    decisions: decisions.length,
    itemsLus,
    evenementsNouveaux,
    rendement: evenementsNouveaux / itemsLus,
    tauxReference: config.tauxReference,
    tauxCible: TAUX_CIBLE,
    tauxOracle: oracle.tauxVrai,
    oracleSourceId: oracle.id,
    sourcesExplorees: tirages.filter((n) => n > 0).length,
    regretCumule,
    regretPct: regretCumule / (config.nbDecisions * oracle.tauxVrai),
    regretCiblePct: REGRET_CIBLE,
  };
  return { config, armes, decisions, metriques };
}

export interface VerdictBandit {
  atteint: boolean;
  decisionsOk: boolean;
  rendementOk: boolean;
  regretOk: boolean;
}

export function verifierObjectif(resultat: ResultatBandit): VerdictBandit {
  const m = resultat.metriques;
  const decisionsOk = m.decisions === 1000;
  const rendementOk = m.rendement >= m.tauxCible;
  const regretOk = m.regretPct <= m.regretCiblePct;
  return { atteint: decisionsOk && rendementOk && regretOk, decisionsOk, rendementOk, regretOk };
}

function pourcentage(valeur: number): string {
  return `${(valeur * 100).toFixed(2).replace(".", ",")} %`;
}

/** Ligne de verdict au format attendu par le juge, avec les valeurs brutes. */
export function ligneObjectif(resultat: ResultatBandit): string {
  const m = resultat.metriques;
  const v = verifierObjectif(resultat);
  const etat = v.atteint ? "atteint" : "partiel";
  const manque: string[] = [];
  if (!v.decisionsOk) manque.push(`${1000 - m.decisions} décisions`);
  if (!v.rendementOk) manque.push(`${pourcentage(m.tauxCible - m.rendement)} de rendement`);
  if (!v.regretOk) manque.push(`${pourcentage(m.regretPct - m.regretCiblePct)} de regret`);
  const fin = manque.length > 0 ? `, manque ${manque.join(" et ")}` : "";
  return `OBJECTIF : ${etat} — ${m.decisions} / 1000 décisions ; rendement ${pourcentage(m.rendement)} / ${pourcentage(m.tauxCible)} ; regret ${pourcentage(m.regretPct)} / ${pourcentage(m.regretCiblePct)}${fin}`;
}

export function lignesMesure(resultat: ResultatBandit): string[] {
  const m = resultat.metriques;
  return [
    `décisions enregistrées : ${m.decisions} / 1000`,
    `sources actives candidates : ${resultat.armes.length} (${m.sourcesExplorees} explorées)`,
    `rendement des sources actives : ${pourcentage(m.rendement)} / ${pourcentage(m.tauxCible)} (2 × ${pourcentage(m.tauxReference)})`,
    `oracle rétrospectif : ${m.oracleSourceId} à ${pourcentage(m.tauxOracle)}`,
    `regret cumulé : ${pourcentage(m.regretPct)} / ${pourcentage(m.regretCiblePct)} de l'oracle (${m.regretCumule.toFixed(4)} points)`,
    ligneObjectif(resultat),
  ];
}
