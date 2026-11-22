/**
 * Palette et couleur des arcs (org → hébergement/événement).
 *
 * `Map3D.tsx` consomme `FAMILY_HEX`, `FAMILY_HEX_FALLBACK`, `arcHex` et le type
 * `FlowArc`. Les helpers de rendu animé ont été supprimés : le rendu
 * des arcs est fait directement dans Map3D.
 */

export type FlowArc = {
  id: string
  from: { lat: number; lon: number; label: string }
  to: { lat: number; lon: number; label: string }
  family: string
  /** Nature d'organisation (arcs « orgs ») ; prioritaire sur `family` pour la couleur. */
  nature?: string | null
  severity: number
  observedAt?: string | null
  title?: string
  sourceUrl?: string | null
}

/** Palette unique des familles, alignée sur la maquette et `FAMILY_COLORS` de Map3D. */
export const FAMILY_HEX: Record<string, string> = {
  ransomware: '#e0483c',
  vuln: '#e8833a',
  phishing: '#e0b341',
  malware: '#c964b0',
  cert: '#4a90d9',
  cert_fr: '#67e8f9',
  typosquat: '#a855f7',
  reputation: '#22c55e',
  cti: '#3b82f6',
  presse: '#94a3b8',
  presse_locale: '#7d8ea3',
}

export const FAMILY_HEX_FALLBACK = '#7dd3fc'

/**
 * Palette des natures d'organisation, alignée sur `--org-*` de styles.css /
 * `ORG_KIND_COLORS` de Map3D. `ess` reste neutre. `operateur_critique` est un
 * alias normalisé de la valeur OSM `opérateur critique`.
 */
const NATURE_HEX: Record<string, string> = {
  sante: '#f05545',
  collectivite: '#4a90d9',
  entreprise: '#f0a63c',
  enseignement: '#a855f7',
  recherche: '#22c55e',
  'opérateur critique': '#e0483c',
  operateur_critique: '#e0483c',
  ess: '#8b93a1',
}

/** Couleur d'un arc : nature d'organisation si connue, sinon famille. */
export function arcHex(family: string, nature?: string | null): string {
  if (nature && NATURE_HEX[nature]) return NATURE_HEX[nature]
  return FAMILY_HEX[family] ?? FAMILY_HEX_FALLBACK
}
