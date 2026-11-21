/**
 * En-têtes de sécurité de toutes les réponses.
 *
 * Helmet fournit nosniff, frameguard, referrer-policy et HSTS. Le CSP est
 * posé ici, et non globalement : l'API ne sert que du JSON, mais le dist du
 * front est servi par le même processus. Un CSP global cassait soit le HTML,
 * soit les réponses JSON ; on distingue donc par type de contenu.
 */
import helmet from "@fastify/helmet";
import type { FastifyInstance } from "fastify";

/** Origines externes réellement utilisées par index.html. Toute autre est bloquée. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
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

export { CONTENT_SECURITY_POLICY };
