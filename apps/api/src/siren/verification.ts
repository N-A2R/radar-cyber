/**
 * Décision d'identité légale pour une organisation citée par un événement.
 *
 * Module pur : aucune base, aucun réseau. L'appelant fournit les réponses de
 * l'API nationale (recherche-entreprises, données SIRENE de l'INSEE) et ce
 * module décide, sans jamais deviner, si un SIREN peut être publié.
 *
 * Règles :
 *   - un nom de domaine n'est pas une personne morale : aucun SIREN ne lui est
 *     rattaché, même si une source le présentait comme une organisation ;
 *   - la correspondance de nom est exacte après normalisation (accent, casse,
 *     ponctuation, nom commercial entre parenthèses) ;
 *   - un alias n'est accepté que s'il est explicite et si la raison sociale
 *     attendue est effectivement renvoyée par la source officielle ;
 *   - plusieurs candidats restants = abstention, jamais un choix arbitraire.
 */
import { legalName } from "./audit.js";
import { nomNormalise } from "../referentiel/enrichissement.js";

export interface CandidatSirene {
  siren: string;
  /** Raison sociale officielle (`nom_raison_sociale` ou `nom_complet`). */
  nom: string;
  dept?: string | null;
  /** Date de fermeture SIRENE, si la source la fournit. */
  fermeLe?: string | null;
}

export interface AliasLegal {
  /** Nom normalisé tel qu'il figure dans notre référentiel (hors complément). */
  nom: string;
  /** Raison sociale exacte attendue, confirmée auprès de la source officielle. */
  raisonSociale: string;
  /** Requête à employer quand la dénomination courante ne retrouve pas la fiche. */
  recherche?: string;
}

/**
 * Alias documentés : la dénomination courante n'est pas la raison sociale.
 * Ces entrées ne créent aucun SIREN : elles contraignent la recherche et la
 * réponse officielle doit confirmer la raison sociale avant toute écriture.
 */
export const ALIAS_LEGAUX: readonly AliasLegal[] = [
  {
    nom: "communaute urbaine du grand poitiers",
    raisonSociale: "GRAND POITIERS COMMUNAUTE URBAINE",
  },
  {
    nom: "conseil departemental de lot et garonne",
    raisonSociale: "DEPARTEMENT DU LOT ET GARONNE",
  },
  {
    nom: "spsti16",
    raisonSociale: "SERVICE DE PREVENTION ET DE SANTE AU TRAVAIL INTERENTREPRISES 16",
    recherche: "SPSTI 16",
  },
];

/** Retire les noms commerciaux et les compléments rédactionnels d'un libellé. */
export function nomCandidat(valeur: string | null | undefined): string {
  return (valeur ?? "")
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/\s*\[\s*\.\.\.\s*\]\s*$/, " ")
    .replace(/\s+[—–]\s+.*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Un nom de domaine (avec extension) n'est pas une identité légale. */
export function estNomDeDomaine(valeur: string | null | undefined): boolean {
  const nom = (valeur ?? "").trim().toLowerCase();
  if (!nom || /\s/.test(nom)) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(nom);
}


/** Mots de liaison sans valeur distinctive dans une raison sociale française. */
const MOTS_VIDES: Record<string, true> = {
  d: true, de: true, des: true, du: true, et: true, en: true,
  la: true, le: true, les: true, l: true, sur: true,
};

/** Clé indépendante de l'ordre des mots (SIRENE renvoie souvent « Prénom Nom »). */
function cleLegal(valeur: string | null | undefined): string {
  return nomNormalise(nomCandidat(valeur))
    .split(" ")
    .filter((mot) => mot.length > 0 && !MOTS_VIDES[mot])
    .sort()
    .join(" ");
}

/** Nomme exactement la même personne morale, quelle que soit la présentation. */
export function correspondNomLegal(
  nomReferentiel: string | null | undefined,
  raisonSocialeOfficielle: string | null | undefined,
): boolean {
  const a = nomNormalise(nomCandidat(nomReferentiel));
  const b = nomNormalise(nomCandidat(raisonSocialeOfficielle));
  if (!a || !b) return false;
  return a === b || cleLegal(nomReferentiel) === cleLegal(raisonSocialeOfficielle);
}

/** Alias autorisé pour ce libellé, s'il existe. */
export function aliasLegal(nomReferentiel: string | null | undefined): AliasLegal | null {
  const cle = nomNormalise(nomCandidat(nomReferentiel));
  return ALIAS_LEGAUX.find((alias) => alias.nom === cle) ?? null;
}

/** Libellé à envoyer à l'API nationale pour retrouver l'entité. */
export function requeteRecherche(nomReferentiel: string | null | undefined): string | null {
  const alias = aliasLegal(nomReferentiel);
  if (alias) return alias.recherche ?? alias.raisonSociale;
  return nomCandidat(nomReferentiel) || null;
}

/** Raison sociale que la source officielle doit renvoyer pour ce libellé. */
export function raisonSocialeAttendue(nomReferentiel: string | null | undefined): string | null {
  const alias = aliasLegal(nomReferentiel);
  if (alias) return alias.raisonSociale;
  return nomCandidat(nomReferentiel) || null;
}

/**
 * Retient un unique candidat exploitable, ou aucun en cas de doute.
 *
 * Le filtre département n'écarte jamais une fiche sans siège renseigné, mais
 * écarte une fiche dont le siège est dans un autre département : plusieurs
 * homonymes dans le même département restent une ambiguïté, sauf si un seul
 * est encore ouvert.
 */
export function choisirCandidat(
  nomReferentiel: string | null | undefined,
  dept: string | null | undefined,
  candidats: readonly CandidatSirene[],
): CandidatSirene | null {
  const attendu = raisonSocialeAttendue(nomReferentiel);
  if (!attendu) return null;
  const deptReferentiel = /^\d{2}$/.test((dept ?? "").trim()) ? dept!.trim() : null;
  const retenus = new Map<string, CandidatSirene>();
  for (const candidat of candidats) {
    if (!/^\d{9}$/.test(candidat.siren)) continue;
    if (!correspondNomLegal(attendu, candidat.nom)) continue;
    if (deptReferentiel && candidat.dept && candidat.dept !== deptReferentiel) continue;
    if (!retenus.has(candidat.siren)) retenus.set(candidat.siren, candidat);
  }
  const distincts = [...retenus.values()];
  if (distincts.length === 0) return null;
  if (distincts.length === 1) return distincts[0] ?? null;
  const ouverts = distincts.filter((c) => !c.fermeLe);
  return ouverts.length === 1 ? (ouverts[0] ?? null) : null;
}

/** Vérifie qu'une réponse pour un SIREN déjà stocké confirme bien ce SIREN. */
export function confirmerParSiren(
  siren: string,
  nomReferentiel: string | null | undefined,
  reponse: CandidatSirene | null,
): boolean {
  if (!reponse || reponse.siren !== siren || !/^\d{9}$/.test(siren)) return false;
  // Un nom commercial peut apparaître dans la raison sociale renvoyée ; le
  // libellé historique reste valable s'il correspond à la partie légale.
  const legal = legalName(reponse.nom);
  return correspondNomLegal(nomReferentiel, legal) || correspondNomLegal(nomReferentiel, reponse.nom);
}
