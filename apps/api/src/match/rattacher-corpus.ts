/**
 * Rattachement d'un incident du corpus de couverture à une organisation.
 *
 * Le corpus ne fournit pas un texte libre mais une fiche : `organisation`,
 * `departement`, parfois `commune` ou `domaine`. On ne peut donc pas réutiliser
 * tel quel le moteur de texte (`gazetteer.ts`), qui cherche des alias dans une
 * phrase. Ici la décision est déterministe et se fait par critères, du plus
 * fort au plus faible : nom normalisé, alias, domaine, commune.
 *
 * Deux garde-fous, appris sur le corpus :
 *  - un département connu des deux côtés qui diverge interdit le rattachement,
 *    même quand le nom est identique (homonymes « Mairie de Berson ») ;
 *  - la commune seule ne prouve rien : elle n'est acceptée que si un mot
 *    distinctif du nom de l'incident se retrouve dans l'organisation.
 *
 * Le cœur (`rattacherCorpus`) est pur et reçoit les lignes : c'est ce qui est
 * testé. `rattacherCorpusEnBase` fait la lecture PostgreSQL puis lui délègue.
 * Aucun des deux ne devine : une ambiguïté restante rend `orgId: null`.
 */
import { query } from "../db.js";
import { normalize } from "./core.js";
import { codeDepartement } from "./dept.js";
import { domainFromHint, domaineRacine, normalizeDomainValue } from "./domaine.js";
import { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } from "./generique.js";

/** Fiche d'incident du corpus (les deux champs obligatoires suffisent). */
export type IncidentCorpus = {
  organisation: string;
  departement?: string | null;
  commune?: string | null;
  domaine?: string | null;
};

/** Organisation telle qu'elle est lue dans `org` / `org_alias`. */
export type OrganisationCorpus = {
  id: number;
  name: string;
  nameNorm?: string | null;
  slug?: string | null;
  dept?: string | null;
  city?: string | null;
  domain?: string | null;
  website?: string | null;
  aliases?: readonly string[];
};

export type MotifRattachement =
  | "nom-exact"
  | "alias"
  | "domaine"
  | "commune"
  | "ambigu"
  | "absent"
  | "faux-positif"
  | "organisation-vide";

export type ResultatRattachement = {
  orgId: number | null;
  motif: MotifRattachement;
};

/** Mots qui ne désignent pas l'organisation : ils ne fondent pas la commune. */
const GENERIQUES = new Set<string>([
  ...MOTS_GENERIQUES,
  ...MOTS_GENERIQUES_ENTREPRISE,
  "mairie", "ville", "commune", "municipal", "municipale", "municipaux",
  "agglomeration", "metropole", "departement", "conseil", "prefecture",
]);

/** Jetons propres d'un nom, utiles seulement à titre de garde-fou. */
function jetonsDistinctifs(texte: string): string[] {
  return normalize(texte)
    .split(" ")
    .filter((jeton) => jeton.length >= 4 && !/^\d+$/.test(jeton) && !GENERIQUES.has(jeton));
}

/**
 * Domaines reconnus pour une organisation : la valeur normalisée **et** sa
 * racine, afin qu'un `www.sous.exemple.com` retrouve `exemple.com` porté par
 * `org.domain` ou par un alias de type domaine.
 */
function domainesDe(org: OrganisationCorpus): string[] {
  const valeurs = [org.domain, org.website, ...(org.aliases ?? [])];
  const domaines = new Set<string>();
  for (const valeur of valeurs) {
    const domaine = normalizeDomainValue(valeur);
    if (domaine) domaines.add(domaine);
    const racine = domaineRacine(valeur);
    if (racine) domaines.add(racine);
  }
  return [...domaines];
}

/**
 * départager ne tranche qu'à preuve supplémentaire : département déclaré
 * concordant, puis commune concordante. À égalité, on rend tous les rescapés
 * et l'appelant prononce l'ambiguïté.
 */
function departager(
  candidats: readonly OrganisationCorpus[],
  deptIncident: string | null,
  communeIncident: string,
): OrganisationCorpus[] {
  let meilleur = -1;
  const notes = candidats.map((org) => {
    let note = 0;
    if (deptIncident && codeDepartement(org.dept) === deptIncident) note += 2;
    if (communeIncident && normalize(org.city ?? "") === communeIncident) note += 1;
    meilleur = Math.max(meilleur, note);
    return { org, note };
  });
  return notes.filter(({ note }) => note === meilleur).map(({ org }) => org);
}

/**
 * Rattache une fiche du corpus à une organisation parmi `orgs`.
 *
 * Le motif distingue le critère gagnant du motif de refus ; `faux-positif`
 * signifie qu'une correspondance existait mais que le département la contredit.
 */
export function rattacherCorpus(
  incident: IncidentCorpus,
  orgs: readonly OrganisationCorpus[],
): ResultatRattachement {
  const nom = normalize(incident.organisation ?? "");
  const commune = normalize(incident.commune ?? "");
  const domaineBrut = normalizeDomainValue(incident.domaine) ?? domainFromHint(incident.organisation ?? "");
  const racine = domaineBrut ? domaineRacine(domaineBrut) : null;
  const domainesIncident = [...new Set([domaineBrut, racine].filter((d): d is string => d !== null))];
  if (nom === "" && domainesIncident.length === 0) return { orgId: null, motif: "organisation-vide" };

  const dept = codeDepartement(incident.departement);
  const jetonsIncident = jetonsDistinctifs(nom);
  const exact: OrganisationCorpus[] = [];
  const alias: OrganisationCorpus[] = [];
  const domaines: OrganisationCorpus[] = [];
  const communes: OrganisationCorpus[] = [];
  const incoherents: OrganisationCorpus[] = [];

  for (const org of orgs) {
    const nomOrg = normalize(org.nameNorm ?? org.name);
    const aliasOrgs = (org.aliases ?? []).map(normalize);
    const nomTrouve = nom !== "" && nomOrg === nom;
    const aliasTrouve = nom !== "" && !nomTrouve && aliasOrgs.includes(nom);
    const domaineTrouve = domainesIncident.some((d) => domainesDe(org).includes(d));
    const jetonsOrg = new Set([
      ...jetonsDistinctifs(nomOrg),
      ...(org.aliases ?? []).flatMap(jetonsDistinctifs),
    ]);
    const communeTrouve =
      commune !== "" &&
      normalize(org.city ?? "") === commune &&
      jetonsIncident.some((jeton) => jetonsOrg.has(jeton));

    if (!nomTrouve && !aliasTrouve && !domaineTrouve && !communeTrouve) continue;

    const deptOrg = codeDepartement(org.dept);
    // Un département inconnu n'accuse personne ; deux départements connus et
    // différents rendent la correspondance fausse par construction.
    if (dept && deptOrg && dept !== deptOrg) {
      incoherents.push(org);
      continue;
    }

    if (nomTrouve) exact.push(org);
    else if (aliasTrouve) alias.push(org);
    if (domaineTrouve) domaines.push(org);
    if (communeTrouve) communes.push(org);
  }

  for (const [critere, candidats] of [
    ["nom-exact", exact],
    ["alias", alias],
    ["domaine", domaines],
    ["commune", communes],
  ] as const) {
    if (candidats.length === 0) continue;
    const retenus = departager(candidats, dept, commune);
    if (retenus.length === 1) return { orgId: retenus[0]!.id, motif: critere };
    return { orgId: null, motif: "ambigu" };
  }

  if (incoherents.length > 0) return { orgId: null, motif: "faux-positif" };
  return { orgId: null, motif: "absent" };
}

type LigneOrg = OrganisationCorpus & {
  id: number;
  name: string;
  aliases: string[];
};

/**
 * Préfiltre SQL : on ne rapatrie que les organisations susceptibles de
 * correspondre, pas les 40 000 lignes du référentiel. Le préfiltre est un
 * sur-ensemble — la décision reste entièrement dans `rattacherCorpus`.
 */
export async function chargerOrganisationsCorpus(
  incident: IncidentCorpus,
): Promise<OrganisationCorpus[]> {
  const nom = normalize(incident.organisation ?? "");
  const motifs = jetonsDistinctifs(nom).map((jeton) => `%${jeton}%`);
  const domaine = normalizeDomainValue(incident.domaine) ?? domainFromHint(incident.organisation ?? "") ?? "";
  const racine = domaine ? domaineRacine(domaine) ?? "" : "";
  const commune = normalize(incident.commune ?? "");

  const { rows } = await query<LigneOrg>(
    `SELECT o.id, o.name, o.name_norm, o.slug, o.dept, o.city, o.domain, o.website,
            COALESCE(a.aliases, '{}'::text[]) AS aliases
       FROM org o
       LEFT JOIN LATERAL (
         SELECT array_agg(al.alias ORDER BY al.alias) AS aliases
           FROM org_alias al
          WHERE al.org_id = o.id AND al.status = 'active' AND al.valid_to IS NULL
       ) a ON true
      WHERE o.name_norm = $1
         OR o.name_norm ILIKE ANY($2::text[])
         OR lower(COALESCE(o.domain, '')) = $3
         OR lower(COALESCE(o.website, '')) = $3
         OR lower(COALESCE(o.domain, '')) LIKE '%.' || $5
         OR lower(COALESCE(o.website, '')) LIKE '%.' || $5
         OR $5 LIKE '%.' || lower(COALESCE(o.domain, ''))
         OR $5 LIKE '%.' || lower(COALESCE(o.website, ''))
         OR lower(COALESCE(o.city, '')) = $4
         OR EXISTS (
           SELECT 1 FROM org_alias al2
            WHERE al2.org_id = o.id AND al2.status = 'active' AND al2.valid_to IS NULL
              AND (lower(al2.alias) = $1 OR al2.alias ILIKE ANY($2::text[])
                   OR lower(al2.alias) = $3 OR lower(al2.alias) = $5
                   OR lower(al2.alias) LIKE '%.' || $5 OR $5 LIKE '%.' || lower(al2.alias))
         )
      ORDER BY o.id
      LIMIT 1000`,
    [nom, motifs, domaine, commune, racine],
  );
  return rows;
}

/** Lecture en base puis décision déterministe. */
export async function rattacherCorpusEnBase(
  incident: IncidentCorpus,
): Promise<ResultatRattachement> {
  return rattacherCorpus(incident, await chargerOrganisationsCorpus(incident));
}
