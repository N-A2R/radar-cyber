/**
 * Limiteur de débit en mémoire, à fenêtre glissante exacte.
 *
 * Chaque clé garde les instants des appels acceptés ; un appel est refusé
 * quand la fenêtre contient déjà `max` instants. Contrairement à une fenêtre
 * fixe, un pic chevauchant deux fenêtres ne laisse pas passer le double.
 * L'état reste local au processus (pas de Redis) : chaque instance de l'API
 * compte ses propres appels.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "../errors.js";

export interface RateLimitOptions {
  /** Nombre d'appels acceptés par fenêtre et par clé. */
  max: number;
  /** Durée de la fenêtre, en millisecondes. */
  windowMs: number;
}

/**
 * Adresse retenue pour le quota. Fastify ne remplit `req.ips` que lorsque
 * `trustProxy` est configuré : dans ce cas `req.ip` est déjà l'adresse client
 * validée par la chaîne X-Forwarded-For de confiance. Sans configuration, on ne
 * lit jamais l'en-tête fourni par le client — sinon chacun changerait de clé
 * à volonté pour épuiser ou contourner son quota.
 */
export function adresseClient(req: FastifyRequest): string {
  const ips = (req as FastifyRequest & { ips?: readonly string[] }).ips;
  return (ips?.length ? ips[ips.length - 1] : req.ip) ?? req.socket?.remoteAddress ?? "inconnue";
}

/** Une clé par utilisateur authentifié, sinon par IP de confiance. */
export function clientKey(req: FastifyRequest): string {
  return req.user ? `user:${req.user.id}` : `ip:${adresseClient(req)}`;
}

export function rateLimit({ max, windowMs }: RateLimitOptions) {
  if (!Number.isInteger(max) || max < 1) throw new RangeError("rateLimit: max doit être un entier >= 1");
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError("rateLimit: windowMs doit être > 0");

  const hits = new Map<string, number[]>();
  let calls = 0;

  return async function rateLimitPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const now = Date.now();
    const cutoff = now - windowMs;
    const key = clientKey(req);
    const timestamps = hits.get(key) ?? [];

    // On ne garde que les appels encore dans la fenêtre glissante.
    let expired = 0;
    while (expired < timestamps.length && timestamps[expired]! <= cutoff) expired++;
    if (expired > 0) timestamps.splice(0, expired);

    if (timestamps.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((timestamps[0]! + windowMs - now) / 1000));
      reply.header("Retry-After", String(retryAfter));
      throw new ApiError(429, "too many requests", { details: { retryAfter } });
    }

    timestamps.push(now);
    hits.set(key, timestamps);

    // Nettoyage paresseux des clés inactives, sans minuteur qui survit au serveur.
    if (++calls % 1000 === 0) {
      for (const [k, times] of hits) {
        if (times.length === 0 || times[times.length - 1]! <= cutoff) hits.delete(k);
      }
    }
  };
}
