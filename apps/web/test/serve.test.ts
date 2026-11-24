// @vitest-environment node
/**
 * Serveur de production : shell no-store, assets immuables, repli SPA sans
 * masquer les 404, traversées de chemin refusées et proxy /api borné.
 */
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWebServer } from "../serve.mjs";

let dist: string;
let secretFile: string;
let serveur: Server;
let port: number;
let api: Server;
let apiPort: number;
let apiPath: string;

function url(p: string): string {
  return `http://127.0.0.1:${port}${p}`;
}

/** Requête brute : le client HTTP normaliserait les segments encodés. */
type Brute = { statut: number; corps: string; entetes: Record<string, string | string[] | undefined> };

/** Requête brute : le client HTTP normaliserait les segments encodés. */
function brute(p: string, method = "GET"): Promise<Brute> {
  const attente = Promise.withResolvers<Brute>();
  const req = request({ host: "127.0.0.1", port, path: p, method }, (res) => {
    let corps = "";
    res.setEncoding("utf8");
    res.on("data", (morceau) => { corps += morceau; });
    res.on("end", () => attente.resolve({ statut: res.statusCode ?? 0, corps, entetes: res.headers }));
  });
  req.on("error", attente.reject);
  req.end();
  return attente.promise;
}

beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), "radar-serve-"));
  secretFile = resolve(dist, "..", `${dist.split("/").pop()}-secret.txt`);
  await mkdir(join(dist, "assets"), { recursive: true });
  await writeFile(join(dist, "index.html"), "<html>shell</html>");
  await writeFile(join(dist, "assets", "app.js"), "export const app = 1;");
  await writeFile(secretFile, "secret");
  api = createServer((req, res) => {
    apiPath = req.url ?? "";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: apiPath }));
  });
  const pretApi = Promise.withResolvers<void>();
  api.listen(0, "127.0.0.1", pretApi.resolve);
  await pretApi.promise;
  const adresseApi = api.address();
  if (!adresseApi || typeof adresseApi === "string") throw new Error("port API indisponible");
  apiPort = adresseApi.port;
  serveur = createWebServer({ distDir: dist, apiTarget: `http://127.0.0.1:${apiPort}` });
  const pretServeur = Promise.withResolvers<void>();
  serveur.listen(0, "127.0.0.1", pretServeur.resolve);
  await pretServeur.promise;
  const adresseServeur = serveur.address();
  if (!adresseServeur || typeof adresseServeur === "string") throw new Error("port web indisponible");
  port = adresseServeur.port;
});

afterAll(async () => {
  const fermeServeur = Promise.withResolvers<void>();
  serveur.close(() => fermeServeur.resolve());
  await fermeServeur.promise;
  const fermeApi = Promise.withResolvers<void>();
  api.close(() => fermeApi.resolve());
  await fermeApi.promise;
  await rm(dist, { recursive: true, force: true });
  await rm(secretFile, { force: true });
});

describe("serveur statique de production", () => {
  it("sert le shell avec no-store et les assets avec un cache immuable", async () => {
    const index = await fetch(url("/"));
    expect(index.status).toBe(200);
    expect(await index.text()).toBe("<html>shell</html>");
    expect(index.headers.get("cache-control")).toBe("no-store");
    expect(index.headers.get("x-content-type-options")).toBe("nosniff");

    const asset = await fetch(url("/assets/app.js"));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("repli SPA sans hash uniquement pour les routes sans extension", async () => {
    const route = await fetch(url("/graphe/42"));
    expect(route.status).toBe(200);
    expect(await route.text()).toBe("<html>shell</html>");
    expect(route.headers.get("cache-control")).toBe("no-store");
    const manquant = await fetch(url("/assets/absent.js"));
    expect(manquant.status).toBe(404);
    expect(manquant.headers.get("content-type")).toContain("application/json");
  });

  it("refuse les traversées de chemin encodées et ne divulgue pas le disque", async () => {
    const normalise = await brute("/%2e%2e/secret.txt");
    expect([400, 404]).toContain(normalise.statut);
    expect(normalise.corps).not.toContain("secret");
    const traverse = await brute("/assets/%2e%2e%2f%2e%2e%2fsecret.txt");
    expect(traverse.statut).toBe(400);
    expect(traverse.corps).not.toContain("secret");
  });

  it("n'autorise que GET/HEAD sur les fichiers", async () => {
    const post = await brute("/index.html", "POST");
    expect(post.statut).toBe(405);
    const head = await brute("/assets/app.js", "HEAD");
    expect(head.statut).toBe(200);
    expect(head.corps).toBe("");
  });

  it("proxifie seulement /api, en conservant chemin et requête", async () => {
    const reponse = await fetch(url("/api/stats?jours=7"));
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ ok: true, path: "/api/stats?jours=7" });
    expect(apiPath).toBe("/api/stats?jours=7");
  });

  it("ne renvoie jamais le shell pour une API non configurée", async () => {
    const cibleInitiale = process.env.API_PROXY_TARGET;
    delete process.env.API_PROXY_TARGET;
    const sansProxy = createWebServer({ distDir: dist });
    const pret = Promise.withResolvers<void>();
    sansProxy.listen(0, "127.0.0.1", pret.resolve);
    await pret.promise;
    try {
      const adresse = sansProxy.address();
      if (!adresse || typeof adresse === "string") throw new Error("port web indisponible");
      const reponse = await fetch(`http://127.0.0.1:${adresse.port}/api/health`);
      expect(reponse.status).toBe(404);
      expect(await reponse.text()).not.toContain("<html>");
    } finally {
      const ferme = Promise.withResolvers<void>();
      sansProxy.close(() => ferme.resolve());
      await ferme.promise;
      if (cibleInitiale === undefined) delete process.env.API_PROXY_TARGET;
      else process.env.API_PROXY_TARGET = cibleInitiale;
    }
  });
});
