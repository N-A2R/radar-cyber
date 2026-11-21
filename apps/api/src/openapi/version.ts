/** Version sémantique de l'API, exposée dans la spec et l'en-tête `X-API-Version`. */
export const API_VERSION = "1.0.0";
export const CURRENT_PREFIX = "/api/v1";
export const LEGACY_PREFIX = "/api";

/** Accepte `/api/...` et `/api/v1/...` sans dupliquer les règles d'accès. */
export function withoutVersion(path: string): string {
  return path.startsWith(`${CURRENT_PREFIX}/`)
    ? path.slice(CURRENT_PREFIX.length)
    : path.startsWith(`${LEGACY_PREFIX}/`)
      ? path.slice(LEGACY_PREFIX.length)
      : path;
}
