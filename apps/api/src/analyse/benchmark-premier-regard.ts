/**
 * Benchmark « premier regard » : compare, pour un incident, la première date
 * datée connue dans le radar et dans trois canaux externes.
 *
 * Module pur : il ne lit ni la base ni le disque. Les dates sont des dates
 * calendaires ISO (résolution jour) ; un écart est donc toujours un multiple
 * de 24 h. Les canaux sans date sont exclus du classement, jamais inventés.
 */

const JOUR_MS = 86_400_000;

export const CANAUX = ["radar", "presseLocale", "presseNationale", "certFr"] as const;
export type Canal = (typeof CANAUX)[number];
export type CanalMedia = Exclude<Canal, "radar">;

/** Préfixes de sources de presse locale/régionale, sans accents, en minuscules. */
const PRESSE_LOCALE = [
  "sud ouest",
  "charente libre",
  "france 3",
  "ici",
  "actu.fr",
  "la depeche",
  "la nouvelle republique",
  "la republique des pyrenees",
  "le democrate de bergerac",
  "nice-matin",
  "ouest-france",
  "dordogne libre",
  "haute saintonge",
  "les annonces landaises",
  "inf la rochelle",
  "wiclic",
  "petit bleu",
  "la montagne",
] as const;

/** Préfixes de sources de presse nationale, sans accents, en minuscules. */
const PRESSE_NATIONALE = [
  "le figaro",
  "clubic",
  "zataz",
  "franceinfo",
  "rtl",
  "tf1 info",
  "bfmtv",
  "01net",
  "egora",
  "ticsante",
  "reussir.fr",
  "legalplanet",
  "localtis",
] as const;

const DEPARTEMENTS: Readonly<Record<string, string>> = {
  charente: "16",
  "charente-maritime": "17",
  correze: "19",
  creuse: "23",
  dordogne: "24",
  gironde: "33",
  landes: "40",
  "lot-et-garonne": "47",
  "pyrenees-atlantiques": "64",
  "deux-sevres": "79",
  vienne: "86",
  "haute-vienne": "87",
};

export type IncidentDatum = {
  id: string;
  entite: string;
  codeDepartement: string;
  dates: Partial<Record<Canal, string>>;
};

export type LigneBenchmark = IncidentDatum & {
  /** Canaux portant la date la plus ancienne, parmi les canaux datés. */
  premier: Canal[];
  /** Canaux portant la date la plus récente, parmi les canaux datés. */
  dernier: Canal[];
  radarPremier: boolean;
  /** Radar premier alors qu'au moins un média est daté : le seul cas utile. */
  radarPremierFaceMedia: boolean;
  radarDernier: boolean;
  /** Média le plus précoce, tous médias confondus. */
  premierMedia: CanalMedia | null;
  /** Date du média le plus précoce, jamais inventée. */
  datePremierMedia: string | null;
  /** Heures entre le premier média daté et la première trace radar. */
  delaiHeures: number | null;
};

export type BilanBenchmark = {
  total: number;
  radarPremier: number;
  radarPremierFaceMedia: number;
  radarDernier: number;
  sansMediaDate: number;
  delaiHeures: {
    n: number;
    mediane: number | null;
    min: number | null;
    max: number | null;
    p25: number | null;
    p75: number | null;
  };
  lignes: LigneBenchmark[];
};

function sansAccents(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Renvoie le canal de presse, ou null pour une source officielle / grise. */
export function classerSourcePresse(source: string): CanalMedia | null {
  const nom = sansAccents(source);
  if (PRESSE_LOCALE.some((prefixe) => nom.startsWith(prefixe))) return "presseLocale";
  if (PRESSE_NATIONALE.some((prefixe) => nom.startsWith(prefixe))) return "presseNationale";
  return null;
}

export function codeDepartement(departement: string): string {
  const nom = sansAccents(departement);
  return /^\d{2}$/.test(nom) ? nom : (DEPARTEMENTS[nom] ?? nom);
}

function jours(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return null;
  return ms / JOUR_MS;
}


export function calculerBenchmark(incidents: IncidentDatum[]): BilanBenchmark {
  const lignes: LigneBenchmark[] = incidents.map((incident) => {
    const dates = Object.entries(incident.dates)
      .filter((entry): entry is [Canal, string] => jours(entry[1]) !== null)
      .sort(([a], [b]) => CANAUX.indexOf(a) - CANAUX.indexOf(b));
    const datables = dates.map(([canal, date]) => ({ canal, date, j: jours(date) ?? 0 }));
    const plusAncien = Math.min(...datables.map((d) => d.j));
    const plusRecent = Math.max(...datables.map((d) => d.j));
    const medias = datables.filter((d) => d.canal !== "radar");
    const plusAncienMedia = medias.length > 0
      ? medias.reduce((a, b) => (b.j < a.j ? b : a))
      : null;
    const radar = datables.find((d) => d.canal === "radar");
    const delaiJours = radar && plusAncienMedia ? radar.j - plusAncienMedia.j : null;

    return {
      ...incident,
      premier: datables.filter((d) => d.j === plusAncien).map((d) => d.canal),
      dernier: datables.filter((d) => d.j === plusRecent).map((d) => d.canal),
      radarPremier: datables.some((d) => d.canal === "radar" && d.j === plusAncien),
      radarPremierFaceMedia: Boolean(radar && medias.length > 0 && radar.j === plusAncien),
      radarDernier: datables.some((d) => d.canal === "radar" && d.j === plusRecent),
      premierMedia: plusAncienMedia ? (plusAncienMedia.canal as CanalMedia) : null,
      datePremierMedia: plusAncienMedia?.date ?? null,
      delaiHeures: delaiJours === null ? null : delaiJours * 24,
    };
  });

  const delais = lignes
    .map((ligne) => ligne.delaiHeures)
    .filter((delai): delai is number => delai !== null)
    .sort((a, b) => a - b);
  const mediane = delais.length === 0 ? null
    : delais.length % 2 === 1 ? (delais[(delais.length - 1) / 2] ?? 0)
    : ((delais[delais.length / 2 - 1] ?? 0) + (delais[delais.length / 2] ?? 0)) / 2;

  return {
    total: lignes.length,
    radarPremier: lignes.filter((l) => l.radarPremier).length,
    radarPremierFaceMedia: lignes.filter((l) => l.radarPremierFaceMedia).length,
    radarDernier: lignes.filter((l) => l.radarDernier).length,
    sansMediaDate: lignes.filter((l) => l.premierMedia === null).length,
    delaiHeures: {
      n: delais.length,
      mediane,
      min: delais[0] ?? null,
      max: delais[delais.length - 1] ?? null,
      p25: delais.length ? (delais[Math.floor((delais.length - 1) * 0.25)] ?? 0) : null,
      p75: delais.length ? (delais[Math.floor((delais.length - 1) * 0.75)] ?? 0) : null,
    },
    lignes,
  };
}

export type IncidentReference = {
  id: string;
  entite: string;
  departement: string;
  dateIncident: string | null;
  datePublique: string;
  preuve: { editeur: string; consulteLe: string };
};

export type IncidentDepartemental = {
  id: string;
  organisation: string;
  departement: string;
  date_incident?: string | null;
  date_publication: string;
  source: string;
  verifie_le: string;
};

function cleDedup(entite: string, date: string | null): string {
  const nom = sansAccents(entite).replace(/[^a-z0-9]/g, "");
  return `${nom}:${date ?? ""}`;
}

/**
 * Sélection déterministe : tout le corpus témoin (60 incidents), puis les
 * incidents départementaux dans l'ordre des fichiers, en sautant les doublons
 * de nom normalisé + date de survenue (ou de publication à défaut).
 */
export function construireIncidents(
  reference: { incidents: IncidentReference[] },
  departementaux: IncidentDepartemental[],
  limite = 100,
): IncidentDatum[] {
  const vus = new Set<string>();
  const incidents: IncidentDatum[] = [];

  for (const incident of reference.incidents) {
    const cle = cleDedup(incident.entite, incident.dateIncident ?? incident.datePublique);
    if (vus.has(cle)) continue;
    vus.add(cle);
    const canal = classerSourcePresse(incident.preuve.editeur);
    incidents.push({
      id: incident.id,
      entite: incident.entite,
      codeDepartement: codeDepartement(incident.departement),
      dates: {
        radar: incident.preuve.consulteLe,
        ...(canal ? { [canal]: incident.datePublique } : {}),
      },
    });
  }

  for (const incident of departementaux) {
    if (incidents.length >= limite) break;
    const cle = cleDedup(incident.organisation, incident.date_incident ?? incident.date_publication);
    if (vus.has(cle)) continue;
    vus.add(cle);
    const canal = classerSourcePresse(incident.source);
    incidents.push({
      id: incident.id,
      entite: incident.organisation,
      codeDepartement: codeDepartement(incident.departement),
      dates: {
        radar: incident.verifie_le,
        ...(canal ? { [canal]: incident.date_publication } : {}),
      },
    });
  }

  return incidents.slice(0, limite);
}
