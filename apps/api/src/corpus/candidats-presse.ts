/**
 * Extraction déterministe des candidats incidents cyber du corpus presse.
 *
 * Le score n'est pas une vérité : c'est une priorité de revue, calculée une
 * seule fois à l'import, expliquée par `signaux` et rejouable depuis l'article.
 * Les articles de prévention sont volontairement pénalisés : ils portent les
 * mêmes mots-clés que les incidents mais n'en sont pas.
 */
import { createHash } from "node:crypto";

export type ArticlePresse = {
  titre?: string;
  url?: string;
  date?: string;
  date_source?: string;
  extrait?: string;
  commune?: string;
  departement?: string;
  nom_source?: string;
  mots_cyber?: string[];
  cyber?: boolean;
};

export type CandidatPresse = {
  cle: string;
  titre: string;
  extrait: string;
  url: string;
  datePublication: string | null;
  source: string | null;
  commune: string | null;
  departement: string | null;
  orgProposee: string | null;
  scoreConfiance: number;
  signaux: string[];
};

const INCIDENT: ReadonlyArray<readonly [string, RegExp]> = [
  ["cyberattaque", /cyberattaque/i],
  ["rancongiciel", /rancongiciel|ransomware/i],
  ["piratage", /piratage|pirat[ée]\w*/i],
  ["fuite-de-donnees", /fuite de donn|donn[ée]es (?:personnelles |de sant[ée] )?(?:expos|vol|compromis|pirat)/i],
  ["incident-informatique", /incident informatique|panne informatique|perturb\w*/i],
  ["victime", /victime|cible de|touch[ée]\w*/i],
  ["intervention", /\bamende\b|écrou|interpell|arrestation|enquête/i],
];

const CONTEXTE: ReadonlyArray<readonly [string, RegExp]> = [
  ["prevention", /pr[ée]vention|sensibilis|pr[ée]caution/i],
  ["formation", /formation|apprendre|jeu de cartes|atelier|salon/i],
  ["conseils", /conseils?|bonnes pratiques|r[ée]flexes|passeport/i],
  ["campagne", /lutter contre|s.armer|campagne|exercice|conf[ée]rence|webinaire/i],
];

const ORGANISATIONS: ReadonlyArray<readonly [string, RegExp]> = [
  ["LDLC", /\bLDLC\b/i],
  ["Commission européenne", /Commission europ[ée]enne/i],
  ["Ministère de l'Agriculture", /minist[èe]re de l.Agriculture/i],
  ["FBI", /\bFBI\b|police f[ée]d[ée]rale am[ée]ricaine/i],
  ["La Poste", /La Poste/i],
  ["Académie de Toulouse", /acad[ée]mie de Toulouse/i],
  ["Mairie d'Angoulême", /mairie d.Angoul[êe]me/i],
  ["Organisation des Nations unies", /Nations unies|\bONU\b/i],
];

const ORGANISATION_GENERIQUE: ReadonlyArray<readonly [string, RegExp]> = [
  ["mairie", /\b(?:mairie|commune|municipalit[ée]) de ([A-ZÀ-Ÿ][\w'’-]+(?:\s+[A-ZÀ-Ÿ][\w'’-]+){0,2})/],
  ["hopital", /\b(?:h[ôo]pital|centre hospitalier|clinique|CHU) (?:de |d')([A-ZÀ-Ÿ][\w'’-]+(?:\s+[A-ZÀ-Ÿ][\w'’-]+){0,2})/],
  ["universite", /\buniversit[ée] (?:de |d')([A-ZÀ-Ÿ][\w'’-]+(?:\s+[A-ZÀ-Ÿ][\w'’-]+){0,2})/],
];

function signauxPresets(texte: string, regles: ReadonlyArray<readonly [string, RegExp]>): string[] {
  return regles.filter(([, regex]) => regex.test(texte)).map(([nom]) => nom);
}

export function cleDepuisUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 20);
}

/** Organisation proposée : jamais inventée, uniquement extraite du texte. */
export function organisationProposee(titre: string, extrait: string): string | null {
  const texte = `${titre} ${extrait}`;
  for (const [nom, regex] of ORGANISATIONS) {
    if (regex.test(texte)) return nom;
  }
  for (const [prefixe, regex] of ORGANISATION_GENERIQUE) {
    const found = texte.match(regex);
    if (found?.[1]) {
      const lieu = found[1].replace(/[’]/g, "'");
      if (prefixe === "mairie") return `Mairie de ${lieu}`;
      if (prefixe === "hopital") return `Hôpital de ${lieu}`;
      return `Université de ${lieu}`;
    }
  }
  return null;
}

/** Score de priorité entre 0 et 1, avec les raisons de ce score. */
export function scoreCandidat(article: ArticlePresse, orgProposee: string | null): { score: number; signaux: string[] } {
  const titre = article.titre ?? "";
  const extrait = article.extrait ?? "";
  const incidentTitre = signauxPresets(titre, INCIDENT);
  const incidentExtrait = signauxPresets(extrait, INCIDENT);
  const contexte = signauxPresets(`${titre} ${extrait}`, CONTEXTE);

  let score = 0.25;
  if (incidentTitre.length > 0) score += 0.30;
  if (incidentExtrait.length > 0) score += 0.12;
  if ((article.mots_cyber ?? []).length >= 2) score += 0.08;
  if (orgProposee) score += 0.10;
  if (article.date_source === "page") score += 0.05;
  score -= Math.min(0.35, contexte.length * 0.15);

  return {
    score: Math.round(Math.min(0.95, Math.max(0.05, score)) * 1000) / 1000,
    signaux: [
      ...incidentTitre.map((s) => `incident-titre:${s}`),
      ...incidentExtrait.filter((s) => !incidentTitre.includes(s)).map((s) => `incident-extrait:${s}`),
      ...contexte.map((s) => `contexte:${s}`),
      ...(orgProposee ? ["organisation:nommee"] : []),
      ...(article.date_source === "page" ? ["date:page"] : []),
    ],
  };
}

export function candidatDepuisArticle(article: ArticlePresse): CandidatPresse | null {
  if (article.cyber !== true || !article.url) return null;
  const titre = (article.titre ?? "").trim();
  const extrait = (article.extrait ?? "").trim();
  const orgProposee = organisationProposee(titre, extrait);
  const { score, signaux } = scoreCandidat(article, orgProposee);
  return {
    cle: cleDepuisUrl(article.url),
    titre,
    extrait,
    url: article.url,
    datePublication: /^\d{4}-\d{2}-\d{2}$/.test(article.date ?? "") ? article.date! : null,
    source: article.nom_source?.trim() || null,
    commune: article.commune?.trim() || null,
    departement: article.departement?.trim() || null,
    orgProposee,
    scoreConfiance: score,
    signaux,
  };
}

/** Un URL = un candidat, même si le corpus la répète. Ordre préservé. */
export function candidatsDepuisArticles(articles: ArticlePresse[]): CandidatPresse[] {
  const vus = new Set<string>();
  const candidats: CandidatPresse[] = [];
  for (const article of articles) {
    const candidat = candidatDepuisArticle(article);
    if (!candidat || vus.has(candidat.url)) continue;
    vus.add(candidat.url);
    candidats.push(candidat);
  }
  return candidats;
}
