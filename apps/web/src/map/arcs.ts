/**
 * Palette et couleur des arcs (org → hébergement/événement).
 *
 * `Map3D.tsx` consomme `FAMILY_HEX`, `familyHexFallback`, `arcHex` et le type
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

const tokenCache = new Map<string, string>()

/** Le thème peut changer : le cache est invalidé au rechargement du style. */
export function clearTokenCache(): void {
  tokenCache.clear()
}

/** MapLibre ne sait pas lire `var(...)` ni `light-dark(...)` dans une paint
 * property : on résout le jeton Stone actif en couleur concrète. Sans DOM
 * (SSR, tests), on garde la référence `var(...)`, que le CSS sait consommer. */
function resoudre(jeton: string, styles?: CSSStyleDeclaration): string {
  if (styles === undefined) {
    const connu = tokenCache.get(jeton)
    if (connu !== undefined) return connu
  }
  const feuilles = styles ?? (typeof document === "undefined" ? undefined : getComputedStyle(document.documentElement));
  let valeur = jeton;
  for (let passe = 0; passe < 4 && valeur.includes("var("); passe += 1) {
    valeur = valeur.replace(/var\((--[\w-]+)\)/g, (_, nom: string) => feuilles?.getPropertyValue(nom).trim() ?? "");
  }
  const lightDark = valeur.trim().match(/^light-dark\(([^,]+),\s*([^)]+)\)$/);
  if (lightDark) {
    const sombre = typeof document !== "undefined" && document.documentElement.dataset.theme !== "light";
    valeur = (sombre ? lightDark[2] : lightDark[1]).trim();
  }
  const resolu = valeur || jeton;
  tokenCache.set(jeton, resolu);
  return resolu;
}

/** Couleur concrète d'un jeton du pont, pour MapLibre et le canvas. */
export function resolveTokenColor(nom: string): string {
  return resoudre(tokenVar(nom));
}

function dynamicPalette(tokens: Record<string, string>): Record<string, string> {
  return new Proxy(tokens, {
    get: (target, name: string) => {
      const token = target[name];
      return token ? resoudre(tokenVar(token)) : undefined;
    },
  });
}

const FAMILY_TOKENS: Record<string, string> = {
  ransomware: "--family-ransomware",
  vuln: "--family-vuln",
  phishing: "--family-phishing",
  malware: "--family-malware",
  cert: "--family-cert",
  cert_fr: "--family-cert-fr",
  typosquat: "--family-typosquat",
  reputation: "--family-reputation",
  cti: "--family-cti",
  presse: "--family-presse",
  presse_locale: "--family-presse-locale",
};

/** Palette dynamique : le CSS peut être injecté après l'import du module. */
export const FAMILY_HEX = dynamicPalette(FAMILY_TOKENS);

/** Famille inconnue : teinte de repli du pont de données. */
export function familyHexFallback(): string {
  return resoudre(tokenVar("--family-cert-fr"));
}

/**
 * Palette des natures d'organisation : jetons `--org-*` du pont Stone.
 * `ess` reste neutre via `--sev-1`; `operateur_critique` est un alias
 * normalisé de la valeur OSM `opérateur critique`.
 */
const NATURE_HEX = dynamicPalette({
  sante: "--org-sante",
  collectivite: "--org-collectivite",
  entreprise: "--org-entreprise",
  enseignement: "--org-enseignement",
  recherche: "--org-recherche",
  "opérateur critique": "--org-operateur",
  operateur_critique: "--org-operateur",
  ess: "--sev-1",
});

/** Couleur d'un arc : nature d'organisation si connue, sinon famille. */
export function arcHex(family: string, nature?: string | null): string {
  if (nature && NATURE_HEX[nature]) return NATURE_HEX[nature]
  return FAMILY_HEX[family] ?? familyHexFallback()
}
