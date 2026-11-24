/**
 * Palette et couleur des arcs (org → hébergement/événement).
 *
 * `Map3D.tsx` consomme `FAMILY_HEX`, `FAMILY_HEX_FALLBACK`, `arcHex` et le type
 * `FlowArc`. Les helpers de rendu animé ont été supprimés : le rendu
 * des arcs est fait directement dans Map3D.
 */

import { tokenVar } from "@astryxdesign/core/theme";

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

/** MapLibre ne sait pas lire `var(...)` dans une paint property : on résout le
 * jeton du thème gothic actif via le CSS. Sans DOM (SSR, tests), on garde la
 * référence `var(...)`, que le CSS sait consommer. */
function resoudre(jeton: string, styles?: CSSStyleDeclaration): string {
  const feuilles = styles ?? (typeof document === "undefined" ? undefined : getComputedStyle(document.documentElement));
  return feuilles?.getPropertyValue(jeton.slice(4, -1)).trim() || jeton;
}

function palette(jetons: Record<string, string>): Record<string, string> {
  const styles = typeof document === "undefined" ? undefined : getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(jetons).map(([nom, jeton]) => [nom, resoudre(jeton, styles)]),
  );
}

/** Palette unique des familles : jetons de données du pont gothic (styles.css). */
export const FAMILY_HEX: Record<string, string> = palette({
  ransomware: tokenVar("--family-ransomware"),
  vuln: tokenVar("--family-vuln"),
  phishing: tokenVar("--family-phishing"),
  malware: tokenVar("--family-malware"),
  cert: tokenVar("--family-cert"),
  cert_fr: tokenVar("--family-cert-fr"),
  typosquat: tokenVar("--family-typosquat"),
  reputation: tokenVar("--family-reputation"),
  cti: tokenVar("--family-cti"),
  presse: tokenVar("--family-presse"),
  presse_locale: tokenVar("--family-presse-locale"),
});

/** Famille inconnue : cyan clair du pont de données. */
export const FAMILY_HEX_FALLBACK = resoudre(tokenVar("--family-cert-fr"));

/**
 * Palette des natures d'organisation : jetons `--org-*` du pont gothic.
 * `ess` reste neutre via `--sev-1`. `operateur_critique` est un alias
 * normalisé de la valeur OSM `opérateur critique`.
 */
const NATURE_HEX: Record<string, string> = palette({
  sante: tokenVar("--org-sante"),
  collectivite: tokenVar("--org-collectivite"),
  entreprise: tokenVar("--org-entreprise"),
  enseignement: tokenVar("--org-enseignement"),
  recherche: tokenVar("--org-recherche"),
  "opérateur critique": tokenVar("--org-operateur"),
  operateur_critique: tokenVar("--org-operateur"),
  ess: tokenVar("--sev-1"),
});

/** Couleur d'un arc : nature d'organisation si connue, sinon famille. */
export function arcHex(family: string, nature?: string | null): string {
  if (nature && NATURE_HEX[nature]) return NATURE_HEX[nature]
  return FAMILY_HEX[family] ?? FAMILY_HEX_FALLBACK
}
