#!/usr/bin/env node
/*
 * Serveur statique de production, sans dépendance : `dist/` + ce fichier
 * suffisent (le runtime Docker n'a ni vite ni node_modules).
 *
 * - `/api/*` est soit proxifié vers API_PROXY_TARGET, soit 404 : jamais de
 *   repli SPA sur une réponse d'API, pour ne pas masquer une panne upstream.
 * - Les autres chemins servent un fichier de `dist/`, avec repli sur
 *   `index.html` pour le routage par hash de l'application.
 * - Les traversées de chemin, y compris encodées, sont refusées avant tout
 *   accès au disque ; les liens symboliques sont vérifiés après realpath.
 */
import { createServer as createHttpServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const DIST_DEFAUT = resolve(ICI, "dist");
const MAX_CORPS_PROXY = 10 * 1024 * 1024;
const DELAI_PROXY_MS = 30_000;

const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".map", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

const EN_TETES_INTERDITS = new Set([
  "connection", "keep-alive", "proxy-connection", "transfer-encoding",
  "upgrade", "host", "content-length", "content-encoding", "te", "trailer",
]);

/** Cible de proxy : seulement une URL http(s) explicite, sans ouvrir de relais arbitraire. */
function cibleProxy(valeur) {
  if (!valeur) return null;
  let url;
  try {
    url = new URL(valeur);
  } catch {
    throw new Error("API_PROXY_TARGET doit être une URL http(s) valide");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_PROXY_TARGET doit utiliser http ou https");
  }
  if (url.username || url.password) {
    throw new Error("API_PROXY_TARGET ne doit pas contenir d'identifiants");
  }
  return url;
}

/** Chemin local validé : ni échappement hors de dist, ni NUL, ni anti-slash. */
function cheminLocal(racine, cheminUrl) {
  let decode;
  try {
    decode = decodeURIComponent(cheminUrl);
  } catch {
    return null;
  }
  if (decode.includes("\0") || decode.includes("\\")) return null;
  const candidat = resolve(racine, `.${decode}`);
  if (candidat !== racine && !candidat.startsWith(`${racine}${sep}`)) return null;
  return candidat;
}

function ecrireJson(res, statut, corps) {
  const charge = JSON.stringify(corps);
  res.writeHead(statut, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(charge),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(charge);
}

function entetesCommuns() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

/** Fichier existant sous la racine, ou null (chemin hors racine => null aussi). */
async function fichierServable(racineReelle, candidat) {
  if (!candidat || !candidat.startsWith(`${racineReelle}${sep}`)) return null;
  let reelle;
  try {
    reelle = await fs.realpath(candidat);
  } catch {
    return null;
  }
  if (reelle !== racineReelle && !reelle.startsWith(`${racineReelle}${sep}`)) return null;
  try {
    const info = await fs.stat(reelle);
    return info.isFile() ? reelle : null;
  } catch {
    return null;
  }
}

async function servirFichier(req, res, chemin, racineReelle) {
  const fichier = await fichierServable(racineReelle, chemin);
  if (!fichier) return false;
  const info = await fs.stat(fichier);
  const estIndex = fichier.endsWith(`${sep}index.html`);
  const type = TYPES.get(extname(fichier).toLowerCase()) ?? "application/octet-stream";
  res.writeHead(200, {
    ...entetesCommuns(),
    "Content-Type": type,
    "Content-Length": info.size,
    "Cache-Control": estIndex
      ? "no-store"
      : chemin.includes(`${sep}assets${sep}`)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  await pipeline(createReadStream(fichier), res);
  return true;
}

async function servirIndex(req, res, racineReelle) {
  const index = await fichierServable(racineReelle, resolve(racineReelle, "index.html"));
  if (!index) {
    ecrireJson(res, 503, { error: "Shell indisponible" });
    return;
  }
  const info = await fs.stat(index);
  res.writeHead(200, {
    ...entetesCommuns(),
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": info.size,
    "Cache-Control": "no-store",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  await pipeline(createReadStream(index), res);
}

async function proxyApi(req, res, url, cible) {
  if (!cible) {
    ecrireJson(res, 404, { error: "API non configurée" });
    return;
  }
  // `req.url` peut être une forme absolue : on ne la fait jamais passer telle
  // quelle à fetch (ce serait un relais ouvert).
  if (!req.url.startsWith("/") || req.url.startsWith("//")) {
    ecrireJson(res, 400, { error: "Chemin invalide" });
    return;
  }
  const morceaux = [];
  let taille = 0;
  for await (const morceau of req) {
    taille += morceau.length;
    if (taille > MAX_CORPS_PROXY) {
      ecrireJson(res, 413, { error: "Corps trop volumineux" });
      return;
    }
    morceaux.push(morceau);
  }
  const enTete = {};
  for (const [cle, valeur] of Object.entries(req.headers)) {
    if (EN_TETES_INTERDITS.has(cle.toLowerCase()) || cle.toLowerCase().startsWith("proxy-")) continue;
    if (valeur !== undefined) enTete[cle] = valeur;
  }
  const cibleUrl = new URL(cible.href);
  const prefixe = cibleUrl.pathname.replace(/\/$/, "");
  cibleUrl.pathname = `${prefixe}${url.pathname}`;
  cibleUrl.search = url.search;
  try {
  // SSE reste ouvert tant que le client est connecté ; lui appliquer le timeout
  // HTTP normal faisait exploser le processus sur un stream légitime.
  const fluxSse = url.pathname === "/api/stream"
    || String(req.headers.accept ?? "").includes("text/event-stream");
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  const signal = fluxSse
    ? controller.signal
    : AbortSignal.any([controller.signal, AbortSignal.timeout(DELAI_PROXY_MS)]);
    const reponse = await fetch(cibleUrl, {
      method: req.method,
      headers: enTete,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(morceaux),
      signal,
      redirect: "manual",
    });
    const sortie = {};
    for (const [cle, valeur] of reponse.headers) {
      if (!EN_TETES_INTERDITS.has(cle.toLowerCase())) sortie[cle] = valeur;
    }
    res.writeHead(reponse.status, sortie);
    if (req.method === "HEAD" || !reponse.body) {
      res.end();
      return;
    }
    const flux = Readable.fromWeb(reponse.body);
    flux.on("error", () => { /* pipeline propage l'erreur au catch */ });
    await pipeline(flux, res);
  } catch {
    if (!res.headersSent) ecrireJson(res, 502, { error: "API indisponible" });
    else res.destroy();
  }
}

/**
 * @param {{ distDir?: string, apiTarget?: string }} [options]
 * @returns {import("node:http").Server}
 */
export function createWebServer(options = {}) {
  const distDir = resolve(options.distDir ?? process.env.WEB_DIST ?? DIST_DEFAUT);
  const cible = cibleProxy(options.apiTarget ?? process.env.API_PROXY_TARGET);
  let racineReelle;
  return createHttpServer(async (req, res) => {
    try {
      let url;
      try {
        url = new URL(req.url ?? "/", "http://localhost");
      } catch {
        ecrireJson(res, 400, { error: "URL invalide" });
        return;
      }
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        await proxyApi(req, res, url, cible);
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        ecrireJson(res, 405, { error: "Méthode non autorisée" });
        return;
      }
      if (!racineReelle) {
        try {
          racineReelle = await fs.realpath(distDir);
        } catch {
          ecrireJson(res, 503, { error: `Build absent : ${distDir}` });
          return;
        }
      }
      const chemin = cheminLocal(racineReelle, url.pathname);
      if (!chemin) {
        ecrireJson(res, 400, { error: "Chemin invalide" });
        return;
      }
      if (await servirFichier(req, res, chemin, racineReelle)) return;
      // Une ressource manquante avec extension n'est pas une route SPA :
      // renvoyer du HTML casserait les imports et les types MIME.
      if (extname(url.pathname)) {
        ecrireJson(res, 404, { error: "Ressource introuvable" });
        return;
      }
      await servirIndex(req, res, racineReelle);
    } catch (erreur) {
      if (!res.headersSent) ecrireJson(res, 500, { error: "Erreur interne" });
      else res.destroy();
      console.error("[serve] erreur", erreur instanceof Error ? erreur.message : erreur);
    }
  });
}

const estEntree = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (estEntree) {
  const port = Number(process.env.WEB_PORT ?? 4173);
  const hote = process.env.WEB_HOST ?? "0.0.0.0";
  const serveur = createWebServer();
  serveur.listen(port, hote, () => {
    console.log(`[serve] dist=${process.env.WEB_DIST ?? DIST_DEFAUT} http://${hote}:${port}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => serveur.close(() => process.exit(0)));
  }
}
