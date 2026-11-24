/**
 * En-têtes de sécurité de toutes les réponses.
 *
 * Helmet fournit nosniff, frameguard, referrer-policy et HSTS. Le CSP est
 * posé ici, et non globalement : l'API ne sert que du JSON, mais le dist du
 * front est servi par le même processus. Un CSP global cassait soit le HTML,
 * soit les réponses JSON ; on distingue donc par type de contenu.
 */
import helmet from "@fastify/helmet";
import type { FastifyInstance, FastifyReply } from "fastify";

/** Origines externes réellement utilisées par index.html. Toute autre est bloquée. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  // MapLibre pose ses styles par attribut : sans 'unsafe-inline', la carte 3D
  // se charge mais reste invisible.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // Fonds de carte vectoriels : le style JSON et les tuiles viennent du même
  // hôte public, en lecture seule.
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "connect-src 'self' https://tiles.openfreemap.org https://s3.amazonaws.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

export async function installSecurityHeaders(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
  });

  app.addHook("onSend", async (req, reply, payload) => {
    // Une requête annulée par le client (préchargement abandonné, navigation
    // interrompue) a déjà ses en-têtes écrits : y toucher lèverait une erreur
    // et remplacerait une réponse par un 500.
    if (reply.raw.headersSent) return payload;
    const type = String(reply.getHeader("content-type") ?? "");
    if (type.includes("text/html")) {
      reply.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    }
    // Les réponses d'API peuvent contenir des données personnelles : ni cache
    // partagé, ni historique disque. Les fichiers statiques du front restent
    // libres d'être mis en cache par le navigateur.
    if ((req.routeOptions?.url ?? req.url).startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
    }
    reply.header("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.header("X-Permitted-Cross-Domain-Policies", "none");
    return payload;
  });
}


/**
 * Les flux SSE appellent `reply.hijack()` : les hooks `onSend` ne s'exécutent
 * pas et les en-têtes posés par Fastify ne sont pas écrits automatiquement.
 * On reprend donc les en-têtes déjà calculés (X-Request-Id, version, Helmet)
 * et on ajoute explicitement ceux que `installSecurityHeaders` posait en
 * `onSend` — dont `no-store`, indispensable quand un jeton a pu transiter
 * dans l'URL (E7).
 */
export function ecrireEntetesSse(reply: FastifyReply): void {
  const existants: Record<string, string> = {};
  for (const [nom, valeur] of Object.entries(reply.getHeaders())) {
    if (valeur === undefined || valeur === null) continue;
    if (["content-length", "transfer-encoding", "connection", "cache-control", "pragma", "content-type"].includes(nom.toLowerCase())) continue;
    existants[nom] = Array.isArray(valeur) ? valeur.join(", ") : String(valeur);
  }
  reply.raw.writeHead(200, {
    ...existants,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
}
