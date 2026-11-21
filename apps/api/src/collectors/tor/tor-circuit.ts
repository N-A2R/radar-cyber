/**
 * Rotation de circuit Tor et backoff par source, sans dépendance npm.
 *
 * Deux mécanismes complémentaires, tous deux sans écriture persistante :
 *  1. `IsolateSOCKSAuth` (actif par défaut dans Tor) isole chaque circuit
 *     selon les identifiants SOCKS5. On dérive des identifiants différents
 *     par source et par tentative : chaque source a son circuit, et chaque
 *     échec en ouvre un neuf — sans control port, sans NEWNYM, sans fuite.
 *  2. Un backoff gradué par cause : un circuit mort se retente vite (un
 *     nouveau circuit suffit), un blocage se retente très lentement, un
 *     contenu invalide laisse le temps au site de réparer sa page.
 *
 * Aucune donnée personnelle n'est stockée : le secret est aléatoire par
 * processus, les identifiants sont des empreintes sha256 tronquées.
 */

import { createHash, randomBytes } from "node:crypto";

export type TorCause = "circuit" | "timeout" | "blocked" | "invalid_content" | "unknown";

const PROCESS_SECRET = randomBytes(16).toString("hex");

/** Paliers par cause : circuit = rotation rapide, blocage = long repos. */
export const TOR_BACKOFF_DELAYS: Record<TorCause, readonly number[]> = {
  circuit: [5_000, 15_000, 60_000],
  timeout: [60_000, 300_000, 1_800_000],
  blocked: [21_600_000, 86_400_000],
  invalid_content: [1_800_000, 7_200_000],
  unknown: [60_000, 300_000],
};

interface TorState {
  failures: number;
  retryAt: number;
  cause: TorCause;
}

const state = new Map<string, TorState>();
let endpointCursor = 0;

/** Classifie une erreur réseau Tor sans jamais la confondre avec un parse. */
export function classifyTorCause(err: unknown): TorCause {
  const e = err as { name?: string; message?: string; permanent?: boolean } | null;
  const msg = `${e?.name ?? ""} ${e?.message ?? ""}`;
  if (e?.permanent || /blocked|403|bloqu/i.test(msg)) return "blocked";
  if (/timeout|timed out|etimedout|délai dépassé/i.test(msg)) return "timeout";
  if (/invalid_content|contenu invalide/i.test(msg)) return "invalid_content";
  if (/socks|connect|econnrefused|econnreset|circuit|onion|host unreachable|network/i.test(msg))
    return "circuit";
  return "unknown";
}

/** Points de sortie Tor : liste explicite, sinon le proxy unique historique. */
export function torEndpoints(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = env.RADAR_TOR_SOCKS_LIST?.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (list && list.length > 0) return list;
  const single = env.RADAR_TOR_SOCKS?.trim();
  return single ? [single] : [];
}

/** Nombre d'échecs consécutifs d'une source (sert de numéro de circuit). */
export function torFailureCount(source: string): number {
  return state.get(source)?.failures ?? 0;
}

/**
 * URL SOCKS à utiliser pour une source : tourne sur la liste de points de
 * sortie et change d'identifiants à chaque échec enregistré. Le suffixe est
 * stable pour un même (source, échec) afin qu'un run soit reproductible.
 */
export function rotatedTorSocks(source: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const endpoints = torEndpoints(env);
  if (endpoints.length === 0) return null;
  const failures = torFailureCount(source);
  const base = endpoints[(endpointCursor + failures) % endpoints.length]!;
  const url = new URL(base);
  const fingerprint = createHash("sha256")
    .update(`${PROCESS_SECRET}\u0000${source}\u0000${failures}`)
    .digest("hex")
    .slice(0, 20);
  url.username = `r${fingerprint}`;
  url.password = fingerprint;
  return url.toString();
}

/** Avance le curseur de points de sortie (rotation entre instances Tor). */
export function rotateEndpoint(): void {
  endpointCursor++;
}

/** Délai restant avant de retenter une source (0 si elle est disponible). */
export function torBackoffRemainingMs(source: string, now = Date.now()): number {
  const s = state.get(source);
  return s ? Math.max(0, s.retryAt - now) : 0;
}

/**
 * Enregistre un échec et renvoie le délai appliqué. Le circuit tourne à
 * chaque échec : l'appel suivant utilisera des identifiants différents.
 */
export function noteTorFailure(source: string, err: unknown, now = Date.now()): number {
  const cause = classifyTorCause(err);
  const failures = (state.get(source)?.failures ?? 0) + 1;
  const delays = TOR_BACKOFF_DELAYS[cause];
  const delay = delays[Math.min(failures, delays.length) - 1]!;
  state.set(source, { failures, retryAt: now + delay, cause });
  rotateEndpoint();
  return delay;
}

/** Succès : on remet le compteur à zéro, donc le circuit aussi. */
export function resetTorBackoff(source: string): void {
  state.delete(source);
}

/** État agrégé, exposé pour le rapport de mesure. */
export function torCircuitStats(): {
  endpoints: number;
  sources_en_backoff: number;
  par_source: Record<string, { failures: number; cause: TorCause; retry_after_s: number }>;
} {
  const par_source: Record<string, { failures: number; cause: TorCause; retry_after_s: number }> = {};
  for (const [source, s] of state) {
    par_source[source] = {
      failures: s.failures,
      cause: s.cause,
      retry_after_s: Math.ceil(Math.max(0, s.retryAt - Date.now()) / 1000),
    };
  }
  return {
    endpoints: torEndpoints().length,
    sources_en_backoff: state.size,
    par_source,
  };
}

/** Remise à zéro complète, uniquement pour les tests. */
export function resetTorState(): void {
  state.clear();
  endpointCursor = 0;
}
