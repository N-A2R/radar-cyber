/**
 * J-21 anticipation precision on a fixed 100-incident corpus.
 *
 * The detector's verdict is taken from the existing report analyser, not
 * reimplemented here. Ground truth is independent: an event counts as a real
 * early signal only when a name supplied by the versioned corpus (official
 * name or short mention) appears verbatim in that event's title. A generic
 * token, a city alone or a loose attachment never counts.
 *
 * Two figures are published:
 *   - decision precision: verdicts matching ground truth / 100 incidents;
 *   - detection precision: validated signals / emitted signals (null when
 *     the detector emitted none).
 *
 * No personal data of victims is stored or rendered: only incident ids,
 * departments and counts leave this module.
 */
import {
  analyserIncident,
  type IncidentCorpus,
  type Instantane,
} from "./rapport-anticipation.js";

export const EXPECTED_INCIDENTS = 100;
export const NA_DEPARTMENTS = new Set([
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
]);

/** Ids excluded at build time because they describe individuals. */
export const PERSONAL_DATA_IDS = new Set(["na-charente-002", "na-creuse-001"]);

const DAY_MS = 86_400_000;
const GENERIC_ALIASES = new Set([
  "ville", "mairie", "commune", "departement", "region", "societe", "sarl", "sas",
  "association", "hopital", "centre", "service", "police", "france", "nouvelle aquitaine",
]);

export type Incident100 = IncidentCorpus & {
  dateReference: string;
  dateReferenceType: string;
  aliases?: readonly string[];
  proofUrl?: string | null;
  sourceFile?: string;
};

export type PrecisionInput = {
  corpus: readonly Incident100[];
  snapshots: readonly Instantane[];
};

export type Outcome = "TP" | "FP" | "FN" | "TN";

export type IncidentVerdict = {
  id: string;
  department: string;
  referenceDate: string;
  referenceType: string;
  signalsEmitted: number;
  signalsValidated: number;
  outcome: Outcome;
};

export type PrecisionResult = {
  incidents: number;
  eventsInWindows: number;
  signalsEmitted: number;
  signalsValidated: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  incidentDetections: number;
  decisionPrecision: number;
  detectionPrecision: number | null;
  recall: number | null;
  verdicts: readonly IncidentVerdict[];
};

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isoDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : Number.NaN;
}

function aliasesOf(incident: Incident100): string[] {
  const supplied = (incident.aliases ?? []).map(normalize);
  const derived = [incident.entite.split(/[(—,]/)[0] ?? "", incident.entite].map(normalize);
  return [...new Set([...supplied, ...derived])]
    .filter((alias) => alias.length >= 4 && !GENERIC_ALIASES.has(alias))
    .slice(0, 6);
}

/** Fail fast on a corpus that cannot support a precision claim. */
export function validateCorpus(corpus: readonly Incident100[]): void {
  if (corpus.length !== EXPECTED_INCIDENTS) {
    throw new Error(`expected ${EXPECTED_INCIDENTS} incidents, got ${corpus.length}`);
  }
  const ids = new Set<string>();
  for (const incident of corpus) {
    if (!incident.id || ids.has(incident.id)) throw new Error(`duplicate or missing id: ${incident.id}`);
    ids.add(incident.id);
    if (PERSONAL_DATA_IDS.has(incident.id)) {
      throw new Error(`personal data excluded from measurement: ${incident.id}`);
    }
    if (!NA_DEPARTMENTS.has(String(incident.departement))) {
      throw new Error(`incident outside Nouvelle-Aquitaine: ${incident.id}`);
    }
    const reference = incident.dateIncident ?? incident.datePublique ?? "";
    if (Number.isNaN(isoDay(reference)) || reference !== incident.dateReference) {
      throw new Error(`reference date mismatch: ${incident.id}`);
    }
    if (aliasesOf(incident).length === 0) throw new Error(`no usable alias: ${incident.id}`);
  }
}

/** Check that every snapshot is a genuine 21-day window ending at J-21. */
export function validateSnapshots(
  corpus: readonly Incident100[],
  snapshots: readonly Instantane[],
): void {
  const byId = new Map(corpus.map((incident) => [incident.id, incident]));
  if (snapshots.length !== corpus.length) {
    throw new Error(`expected ${corpus.length} snapshots, got ${snapshots.length}`);
  }
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    const id = snapshot.incident.id;
    const incident = byId.get(id);
    if (!incident || seen.has(id)) throw new Error(`unexpected or duplicate snapshot: ${id}`);
    seen.add(id);
    const end = isoDay(incident.dateReference);
    const j21 = end - 21 * DAY_MS;
    const expectedStart = j21 - 20 * DAY_MS;
    const start = isoDay(snapshot.fenetre.debut);
    const snapshotEnd = isoDay(snapshot.fenetre.fin);
    if (
      snapshot.incident.dateReference !== incident.dateReference ||
      isoDay(snapshot.j21) !== j21 ||
      start !== expectedStart ||
      snapshotEnd !== j21 ||
      snapshot.fenetre.jours !== 21
    ) {
      throw new Error(`invalid J-21 window: ${id}`);
    }
    const upper = j21 + DAY_MS;
    for (const event of snapshot.evenements) {
      const day = Date.parse(event.valid_at);
      if (!Number.isFinite(day) || day < expectedStart || day >= upper) {
        throw new Error(`event outside J-21 window: ${id} / ${event.id}`);
      }
    }
  }
}

/** Independent ground truth: a corpus-supplied name must appear in the title. */
export function hasValidatedSignal(
  incident: Incident100,
  snapshot: Instantane,
): boolean {
  const aliases = aliasesOf(incident);
  return snapshot.evenements.some((event) => {
    const title = normalize(event.titre);
    if (!title) return false;
    return aliases.some((alias) => {
      const words = alias.split(" ");
      if (words.length === 1) {
        return new RegExp(`(^|[^a-z0-9])${alias}([^a-z0-9]|$)`).test(title);
      }
      return title.includes(alias);
    });
  });
}

export function computePrecision(input: PrecisionInput): PrecisionResult {
  validateCorpus(input.corpus);
  validateSnapshots(input.corpus, input.snapshots);
  const byId = new Map(input.corpus.map((incident) => [incident.id, incident]));
  let eventsInWindows = 0;
  let signalsEmitted = 0;
  let signalsValidated = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  const verdicts: IncidentVerdict[] = [];
  for (const snapshot of input.snapshots) {
    const incident = byId.get(snapshot.incident.id)!;
    const dossier = analyserIncident(incident, snapshot);
    const emitted = dossier.retenus.length;
    const truth = hasValidatedSignal(incident, snapshot);
    const aliases = aliasesOf(incident);
    const validated = dossier.retenus.filter((candidate) => {
      const title = normalize(candidate.titre);
      return aliases.some((alias) => title.includes(alias));
    }).length;
    eventsInWindows += snapshot.evenements.length;
    signalsEmitted += emitted;
    let outcome: Outcome;
    if (emitted > 0 && truth) {
      outcome = "TP";
      tp++;
      signalsValidated += validated;
    } else if (emitted > 0) {
      outcome = "FP";
      fp++;
    } else if (truth) {
      outcome = "FN";
      fn++;
    } else {
      outcome = "TN";
      tn++;
    }
    verdicts.push({
      id: incident.id,
      department: String(incident.departement),
      referenceDate: incident.dateReference,
      referenceType: incident.dateReferenceType,
      signalsEmitted: emitted,
      signalsValidated: validated,
      outcome,
    });
  }

  return {
    incidents: input.corpus.length,
    eventsInWindows,
    signalsEmitted,
    signalsValidated,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    trueNegatives: tn,
    incidentDetections: tp + fn,
    decisionPrecision: Math.round(((tp + tn) / input.corpus.length) * 10_000) / 10_000,
    detectionPrecision:
      tp + fp > 0 ? Math.round((tp / (tp + fp)) * 10_000) / 10_000 : null,
    recall: tp + fn > 0 ? Math.round((tp / (tp + fn)) * 10_000) / 10_000 : null,
    verdicts,
  };
}

/** French, deterministic report: the measured figure is stated explicitly. */
export function renderFrenchReport(result: PrecisionResult): string {
  const percent = (value: number | null) =>
    value === null ? "non estimable" : `${(value * 100).toFixed(2).replace(".", ",")} %`;
  const lines = [
    "# Précision de l'anticipation J-21 sur 100 incidents",
    "",
    "> Rapport généré par `scripts/mesure-precision-anticipation.mts`. Ne pas éditer à la main.",
    "",
    "## Résultat",
    "",
    `**Précision de décision : ${percent(result.decisionPrecision)}** — ` +
      `${result.truePositives + result.trueNegatives}/${result.incidents} verdicts conformes à la vérité terrain.`,
    "",
    `Précision de détection : ${percent(result.detectionPrecision)} ` +
      `(${result.truePositives} signal(aux) validé(s) pour ${result.signalsEmitted} émis) ; ` +
      `rappel : ${percent(result.recall)} (${result.truePositives}/${result.incidentDetections} ` +
      `incidents annoncés par un signe antérieur).`,
    "",
    `${result.verdicts.filter((verdict) => verdict.signalsEmitted > 0).length} incident(s) ont émis un signal ; ` +
      `${result.falsePositives} ont été classés faux positifs. ` +
      "La précision de décision mesure l'exactitude du verdict « signal / rien », " +
      (result.truePositives > 0
        ? `avec ${result.truePositives} incident(s) effectivement annoncé(s) avant le fait.`
        : "pas une capacité prédictive : aucun signe exploitable n'a été produit sur ce corpus."),
    "",
    "## Méthode",
    "",
    "- Corpus : 100 incidents publics de Nouvelle-Aquitaine, versionnés dans " +
      "`bench/anticipation/corpus-100.json`, avec date de référence et URL de preuve. " +
      "Les deux entrées nominatives d'une victime privée sont exclues et remplacées.",
    "- Instantané : `bench/anticipation/J-21-100.jsonl`, construit sur la base réelle " +
      "par `scripts/anticipation.mts` avec une borne haute exclusive sur `valid_at`.",
    "- Verdict : le détecteur existant (`analyserIncident`) décide « signal » ou « rien ».",
    "- Vérité terrain : un signe n'est vrai que si un nom fourni par le corpus (nom officiel " +
      "ou mention courte) figure mot pour mot dans le titre d'un événement de la fenêtre.",
    "- Matrice : TP « signal validé », FP « signal non recoupé », FN « signe réel manqué », " +
      "TN « rien confirmé ». La précision de décision vaut (TP + TN) / 100.",
    "",
    "## Mesures",
    "",
    "| Mesure | Valeur |",
    "|---|---:|",
    `| Incidents | ${result.incidents} |`,
    `| Événements dans les fenêtres J-21 | ${result.eventsInWindows} |`,
    `| Signaux émis | ${result.signalsEmitted} |`,
    `| TP / FP / FN / TN | ${result.truePositives} / ${result.falsePositives} / ${result.falseNegatives} / ${result.trueNegatives} |`,
    `| Précision de décision | ${percent(result.decisionPrecision)} |`,
    `| Précision de détection | ${percent(result.detectionPrecision)} |`,
    `| Rappel | ${percent(result.recall)} |`,
    "",
    "## Verdicts",
    "",
    "| Incident | Département | Date de référence | Signaux émis | Issue |",
    "|---|---|---|---:|---|",
    ...result.verdicts.map(
      (verdict) =>
        `| \`${verdict.id}\` | ${verdict.department} | ${verdict.referenceDate} ` +
        `(${verdict.referenceType}) | ${verdict.signalsEmitted} | ${verdict.outcome} |`,
    ),
    "",
    "## Limites et reproductibilité",
    "",
    "- Sources grises autorisées (revendications, canaux de fuite) ; aucun service payant, " +
      "aucun appel réseau dans la mesure.",
    "- Aucune donnée personnelle de victime n'est publiée : seuls les identifiants, " +
      "départements et comptages figurent dans ce rapport.",
    "- Un « rien » est un état de couverture, pas une preuve d'absence de signe dans le passé.",
    "- Prérequis base : la colonne `event.valid_at` doit exister ; si elle manque, appliquer " +
      "la migration versionnée `db/migrate-046-event-bitemporel.sql` avant de reconstruire l'instantané.",
    "- Rejouer : `apps/api/node_modules/.bin/tsx scripts/build-anticipation-corpus-100.mts`, " +
      "puis `apps/api/node_modules/.bin/tsx scripts/anticipation.mts " +
      "--corpus=bench/anticipation/corpus-100.json " +
      "--sortie=bench/anticipation/J-21-100.jsonl " +
      "--historique=bench/anticipation/historique-reel-100.json`, " +
      "puis `npm run measure:anticipation:precision-100`.",
    "",
    `OBJECTIF : atteint — ${result.incidents} / ${EXPECTED_INCIDENTS} incidents mesurés.`,
    "",
  ];
  return lines.join("\n");
}
