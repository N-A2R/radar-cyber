/**
 * Périmètre public TLP:CLEAR — un seul prédicat SQL, partagé par toutes les
 * lectures exposées sans filtrage d'accès (API publique, flux, exports).
 *
 * Deux représentations coexistent en base : `event.tlp` (migration 014b) et
 * une déclaration optionnelle `event.evidence->>'tlp'`. Les deux doivent être
 * publiques : une déclaration restreinte ne peut pas être compensée par une
 * colonne restée à sa valeur par défaut.
 *
 * La migration `migrate-200-export-public-tlp.sql` canonise la déclaration
 * JSON à l'écriture (TLP:CLEAR et WHITE deviennent CLEAR) et durcit la colonne.
 * Le contrôle de sortie officiel compare exactement `evidence->>'tlp'` à
 * 'CLEAR' ; ce prédicat fait de même, pour qu'une ligne admise ici soit aussi
 * une ligne admise à l'export.
 *
 * Sur la colonne, `WHITE` (et `TLP:WHITE`) est l'alias historique de CLEAR,
 * celui que `export/trust-tags.ts` normalise déjà vers WHITE. Toute autre
 * valeur — AMBER, GREEN, RED, TLP:AMBER, etc. — est bloquée.
 *
 * `indicator.tlp` utilise historiquement `WHITE` pour « diffusion libre »
 * (migration 002) ; c'est un alias de CLEAR, pas un niveau de restriction.
 */

/** Colonnes acceptées comme « diffusion libre » : CLEAR et ses alias. */
const PUBLIC_COLUMN = "('CLEAR', 'TLP:CLEAR', 'WHITE', 'TLP:WHITE')";

const colonne = (alias: string): string =>
  `upper(btrim(coalesce(${alias}.tlp, 'CLEAR')))`;

/** Prédicat SQL pour un événement, avec alias de table explicite. */
export function evenementPublicSql(alias = "e"): string {
  return `(${colonne(alias)} IN ${PUBLIC_COLUMN} AND coalesce(${alias}.evidence->>'tlp', 'CLEAR') = 'CLEAR')`;
}

/** Prédicat SQL pour un indicateur, avec alias de table explicite. */
export function indicateurPublicSql(alias = "i"): string {
  return `${colonne(alias)} IN ${PUBLIC_COLUMN}`;
}

const PUBLIC_TLP: Record<string, true> = {
  CLEAR: true,
  "TLP:CLEAR": true,
  WHITE: true,
  "TLP:WHITE": true,
};

/**
 * Même règle en TypeScript, pour les flux déjà chargés en mémoire (SSE) :
 * le curseur doit avancer sur toutes les lignes, seules les publiques sortent.
 * `evidence` peut arriver comme objet JSONB ou comme chaîne JSON sérialisée :
 * dans les deux cas une déclaration restreinte doit être refusée, et une
 * chaîne illisible ne doit jamais être traitée comme publique.
 */
function declarationTlp(evidence: unknown): string {
  if (evidence === null || evidence === undefined) return "CLEAR";
  let objet: unknown = evidence;
  if (typeof evidence === "string") {
    try { objet = JSON.parse(evidence); } catch { return ""; }
  }
  if (!objet || typeof objet !== "object" || Array.isArray(objet)) return "";
  return String((objet as Record<string, unknown>).tlp ?? "CLEAR");
}

export function evenementPublic(row: {
  tlp?: unknown;
  evidence?: unknown;
}): boolean {
  const colonne = String(row.tlp ?? "CLEAR").trim().toUpperCase();
  return PUBLIC_TLP[colonne] === true && declarationTlp(row.evidence) === "CLEAR";
}

export function indicateurPublic(row: { tlp?: unknown }): boolean {
  return PUBLIC_TLP[String(row.tlp ?? "CLEAR").trim().toUpperCase()] === true;
}
