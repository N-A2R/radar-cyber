/**
 * Vérification HTTP exhaustive des sources en base.
 *
 * Chaque source reçoit un GET réel, une seule fois, avec un User-Agent qui
 * dit qui nous sommes. Pour chaque réponse on relève le code HTTP, le type de
 * contenu, le nombre d'items décodés par le parser du format déclaré, la date
 * du dernier item lu dans la réponse et le temps de réponse mesuré. Le tout
 * est écrit dans `source_verification` (historique : une ligne par passage),
 * puis agrégé dans un rapport Markdown et un JSON.
 *
 * Usage :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     RADAR_TOR_SOCKS=socks5h://127.0.0.1:9050 \
 *     apps/api/node_modules/.bin/tsx scripts/verifier-sources-http.mts
 */
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { ingestQuery, closePools, query } from "../apps/api/src/db.js";
import { decodeBody } from "../apps/api/src/collectors/parsers/decode.js";
import { parseRssItems } from "../apps/api/src/collectors/parsers/xml.js";
import { parseJsonItems } from "../apps/api/src/collectors/parsers/json.js";
import { parseHtmlLinks } from "../apps/api/src/collectors/parsers/html.js";

type Etat = "ok200" | "muette" | "morte" | "lente";

interface SourceRow {
  id: string;
  name: string;
  url: string;
  format: string;
  parser: Record<string, unknown> | null;
  statut: string | null;
  enabled: boolean;
}

interface Probe {
  code_http: number | null;
  content_type: string | null;
  corps: string;
  ms: number;
  transport: "direct" | "tor";
  erreur: string | null;
}

interface Resultat extends Probe {
  source: SourceRow;
  items: number;
  derniere_item_at: string | null;
  etat: Etat;
  motif: string;
  verifie_at: string;
}

const USER_AGENT =
  "radar-cyber-source-verification/1.0 (+https://github.com/j0ltdevv/radar-cyber; ops@radar-cyber.local)";
const TIMEOUT_DIRECT_MS = 15_000;
const TIMEOUT_TOR_MS = 25_000;
const LENTE_MS = 5_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const CONCURRENCE_DIRECTE = 12;
const CONCURRENCE_TOR = 3;
const SORTIE_JSON = "bench/results/source-verification.json";
const SORTIE_MD = "docs/sources-verification.md";
const TOR_SOCKS = process.env.RADAR_TOR_SOCKS?.trim() || "socks5h://127.0.0.1:9050";

const requireFromApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
const SocksProxyAgent = requireFromApi("socks-proxy-agent").SocksProxyAgent as new (url: string) => unknown;

function estOnion(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "").endsWith(".onion");
  } catch {
    return false;
  }
}

function estHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function decrireErreur(erreur: unknown): string {
  if (erreur instanceof Error) {
    const cause = erreur.cause;
    let code = "";
    if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
      code = `${cause.code}: `;
    }
    const nom = erreur.name === "AbortError" ? "timeout" : code + erreur.name;
    return `${nom}: ${erreur.message}`.slice(0, 200);
  }
  return String(erreur).slice(0, 200);
}

async function lireCorps(body: ReadableStream<Uint8Array> | null, content_type: string | null): Promise<string> {
  if (!body) return "";
  const chunks: Buffer[] = [];
  let octets = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    octets += value.byteLength;
    if (octets > MAX_BODY_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(Buffer.from(value));
  }
  return decodeBody(Buffer.concat(chunks), content_type).text;
}

async function sondeDirecte(url: string): Promise<Probe> {
  const debut = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_DIRECT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
      signal: controller.signal,
      cache: "no-store",
    });
    const content_type = res.headers.get("content-type");
    const corps = await lireCorps(res.body, content_type);
    return {
      code_http: res.status,
      content_type,
      corps,
      ms: Date.now() - debut,
      transport: "direct",
      erreur: null,
    };
  } catch (erreur) {
    return {
      code_http: null,
      content_type: null,
      corps: "",
      ms: Date.now() - debut,
      transport: "direct",
      erreur: decrireErreur(erreur),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** GET .onion via le SOCKS de Tor, redirections manuelles, même budget global. */
function sondeTor(url: string): Promise<Probe> {
  const debut = Date.now();
  const agent = new SocksProxyAgent(TOR_SOCKS);
  const budget = () => Math.max(1, TIMEOUT_TOR_MS - (Date.now() - debut));

  function saut(
    cible: string,
    redirections: number,
  ): Promise<{ code: number; content_type: string | null; corps: string }> {
    return new Promise((resolve, reject) => {
      const u = new URL(cible);
      const envoyer = u.protocol === "https:" ? httpsRequest : httpRequest;
      const req = envoyer(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: `${u.pathname}${u.search}`,
          method: "GET",
          headers: { host: u.host, "user-agent": USER_AGENT, accept: "*/*" },
          agent: agent as never,
          timeout: budget(),
        },
        (res) => {
          const code = res.statusCode ?? 0;
          const location = res.headers.location;
          if (code >= 300 && code < 400 && location && redirections < 3) {
            res.resume();
            saut(new URL(location, u).toString(), redirections + 1).then(resolve, reject);
            return;
          }
          const chunks: Buffer[] = [];
          let octets = 0;
          res.on("data", (chunk: Buffer) => {
            octets += chunk.length;
            if (octets <= MAX_BODY_BYTES) chunks.push(chunk);
            else res.destroy();
          });
          res.on("end", () =>
            resolve({
              code,
              content_type: (res.headers["content-type"] as string | undefined) ?? null,
              corps: decodeBody(Buffer.concat(chunks), (res.headers["content-type"] as string | undefined) ?? null).text,
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("timeout", () => req.destroy(new Error(`timeout après ${TIMEOUT_TOR_MS} ms via Tor`)));
      req.on("error", reject);
      req.end();
    });
  }

  return saut(url, 0).then(
    (r) => ({
      code_http: r.code,
      content_type: r.content_type,
      corps: r.corps,
      ms: Date.now() - debut,
      transport: "tor" as const,
      erreur: null,
    }),
    (erreur) => ({
      code_http: null,
      content_type: null,
      corps: "",
      ms: Date.now() - debut,
      transport: "tor" as const,
      erreur: decrireErreur(erreur),
    }),
  );
}

/** Le dernier item est copié des champs reçus, jamais deviné. */
function dernierItem(items: Record<string, unknown>[]): string | null {
  let max: string | null = null;
  const cles = [
    "published", "pubDate", "pub_date", "date", "updated", "time", "created",
    "collected_at", "first_seen", "last_seen", "observed_at",
  ];
  for (const item of items) {
    for (const cle of cles) {
      const valeur = item[cle];
      let horodatage: number = Number.NaN;
      if (typeof valeur === "string" && valeur.length >= 8 && /(?:19|20)\d{2}/.test(valeur)) {
        horodatage = Date.parse(valeur);
      } else if (typeof valeur === "number" && valeur > 10 ** 9 && valeur < 10 ** 11) {
        horodatage = valeur * 1000;
      }
      if (!Number.isNaN(horodatage) && (max === null || horodatage > Date.parse(max))) {
        max = new Date(horodatage).toISOString();
      }
    }
  }
  return max;
}

function itemsParses(source: SourceRow, corps: string): { items: number; derniere_item_at: string | null } {
  const chemin = (source.parser as { itemsPath?: string } | null)?.itemsPath;
  let items: Record<string, unknown>[] = [];
  try {
    if (["rss", "atom", "xml"].includes(source.format.toLowerCase())) {
      items = parseRssItems(corps, chemin);
    } else if (source.format.toLowerCase() === "json") {
      items = parseJsonItems(corps, chemin);
    } else if (["txt", "text"].includes(source.format.toLowerCase())) {
      items = corps
        .split(/\r?\n/)
        .filter((ligne) => ligne.trim().length > 0 && !ligne.trimStart().startsWith("#"))
        .map((ligne) => ({ value: ligne }));
    } else if (source.format.toLowerCase() === "html") {
      items = parseHtmlLinks(corps, source.url);
    }
  } catch {
    // Un corps non parsable est une mesure : 0 item, sans faire échouer le lot.
  }
  return { items: items.length, derniere_item_at: dernierItem(items) };
}

/** Règles disjointes, du plus grave au moins grave : une source = un état. */
function classer(probe: Probe, items: number, source: SourceRow): { etat: Etat; motif: string } {
  const code = probe.code_http;
  if (source.statut === "morte") return { etat: "morte", motif: "source déclarée morte en base" };
  if (!estHttp(source.url)) return { etat: "morte", motif: "URL non HTTP(S)" };
  if (probe.erreur) {
    const timeout = /timeout|AbortError|ETIMEDOUT/i.test(probe.erreur);
    return { etat: "morte", motif: timeout ? `timeout (${probe.ms} ms)` : `erreur réseau : ${probe.erreur}` };
  }
  if (code === null) return { etat: "morte", motif: "aucun code HTTP reçu" };
  if (code === 404 || code === 410) return { etat: "morte", motif: `HTTP ${code} — ressource disparue` };
  if (code >= 400) return { etat: "morte", motif: `HTTP ${code}` };
  if (code < 200 || code >= 300) return { etat: "morte", motif: `HTTP ${code} (redirection non suivie)` };
  if (items === 0) return { etat: "muette", motif: `HTTP ${code} mais 0 item parsé` };
  if (probe.ms > LENTE_MS) return { etat: "lente", motif: `HTTP ${code}, ${items} item(s) en ${probe.ms} ms` };
  return { etat: "ok200", motif: `HTTP ${code}, ${items} item(s)` };
}

async function verifier(source: SourceRow): Promise<Resultat> {
  const sonde: Probe = !estHttp(source.url)
    ? {
        code_http: null,
        content_type: null,
        corps: "",
        ms: 0,
        transport: "direct",
        erreur: "URL non HTTP(S)",
      }
    : estOnion(source.url)
      ? await sondeTor(source.url)
      : await sondeDirecte(source.url);
  const { items, derniere_item_at } = itemsParses(source, sonde.corps);
  const { etat, motif } = classer(sonde, items, source);
  return { source, ...sonde, items, derniere_item_at, etat, motif, verifie_at: new Date().toISOString() };
}

async function pool(sources: SourceRow[], concurrence: number, surProgres: () => void): Promise<Resultat[]> {
  const resultats: Resultat[] = new Array(sources.length);
  let suivant = 0;
  const travailleur = async () => {
    for (;;) {
      const index = suivant++;
      if (index >= sources.length) return;
      resultats[index] = await verifier(sources[index]!);
      surProgres();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrence, sources.length) }, travailleur));
  return resultats;
}

async function ecrire(resultats: Resultat[]): Promise<void> {
  const colonnes = [
    "source_id", "url", "code_http", "content_type", "items", "derniere_item_at",
    "ms", "verifie_at", "user_agent", "etat", "motif",
  ];
  for (let debut = 0; debut < resultats.length; debut += 50) {
    const lot = resultats.slice(debut, debut + 50);
    const valeurs = colonnes.map((_, i) =>
      lot.map((r) => {
        switch (i) {
          case 0: return r.source.id;
          case 1: return r.source.url;
          case 2: return r.code_http;
          case 3: return r.content_type?.slice(0, 200) ?? null;
          case 4: return r.items;
          case 5: return r.derniere_item_at;
          case 6: return r.ms;
          case 7: return r.verifie_at;
          case 8: return USER_AGENT;
          case 9: return r.etat;
          default: return r.motif;
        }
      }),
    );
    await ingestQuery(
      `INSERT INTO source_verification (${colonnes.join(", ")})
       SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::int[],
                            $6::timestamptz[], $7::int[], $8::timestamptz[],
                            $9::text[], $10::text[], $11::text[])`,
      valeurs,
    );
  }
}

async function chargerSources(): Promise<SourceRow[]> {
  return (await query<SourceRow>(
    `SELECT id, name, url, format, parser, statut, enabled FROM source ORDER BY id`,
  )).rows;
}

async function main(): Promise<void> {
  let sources = await chargerSources();
  console.log(`${sources.length} sources à vérifier (GET réel, User-Agent honnête)`);
  const deja = new Set<string>();
  const resultats: Resultat[] = [];
  let traitees = 0;
  const progres = () => {
    traitees += 1;
    if (traitees % 25 === 0) console.log(`  ${traitees} GET effectués`);
  };

  // La source est partagée : d'autres collectes peuvent ajouter des sources
  // pendant le passage. On reboucle jusqu'à ce qu'aucune nouvelle ligne ne
  // manque, pour livrer 100 % de la population finale.
  for (let passe = 0; passe < 3; passe++) {
    const aFaire = sources.filter((s) => !deja.has(s.id));
    if (aFaire.length === 0) break;
    for (const s of aFaire) deja.add(s.id);
    const directes = aFaire.filter((s) => !estOnion(s.url));
    const onions = aFaire.filter((s) => estOnion(s.url));
    if (passe > 0) console.log(`  passe ${passe + 1} : ${aFaire.length} source(s) ajoutée(s) entre-temps`);
    console.log(`  ${directes.length} HTTP(S) direct, ${onions.length} .onion via Tor`);
    const [a, b] = await Promise.all([
      pool(directes, CONCURRENCE_DIRECTE, progres),
      pool(onions, CONCURRENCE_TOR, progres),
    ]);
    resultats.push(...a, ...b);
    sources = await chargerSources();
    if (sources.every((s) => deja.has(s.id))) break;
    if (passe === 2) {
      throw new Error("des sources continuent d'être ajoutées : mesure non exhaustive");
    }
  }
  if (resultats.length !== deja.size || resultats.some((r) => r === undefined) ||
      sources.some((s) => !deja.has(s.id))) {
    throw new Error("vérification incomplète : au moins une source n'a pas de résultat");
  }
  await ecrire(resultats);

  const compte = (etat: Etat) => resultats.filter((r) => r.etat === etat).length;
  const resume = {
    "200": compte("ok200"),
    muettes: compte("muette"),
    mortes: compte("morte"),
    lentes: compte("lente"),
  };
  const aDebrancher = resultats
    .filter((r) => r.etat === "morte" || r.etat === "muette")
    .sort((x, y) => x.source.id.localeCompare(y.source.id))
    .map((r) => ({
      id: r.source.id,
      nom: r.source.name,
      url: r.source.url,
      etat: r.etat,
      motif: r.motif,
      code_http: r.code_http,
      items: r.items,
      ms: r.ms,
    }));

  const rapportJson = {
    genere_le: new Date().toISOString(),
    user_agent: USER_AGENT,
    methode: {
      portee: `toutes les sources de la table source (${sources.length})`,
      requete: "un GET par source, redirections suivies, corps lu jusqu'à 8 Mio, code/type/items/dernier item/temps mesurés",
      onion: `GET via Tor (${TOR_SOCKS}), timeout ${TIMEOUT_TOR_MS} ms ; direct ${TIMEOUT_DIRECT_MS} ms`,
      regles: "morte (statut base, erreur réseau, HTTP >= 400) > muette (0 item parsé) > lente (> 5000 ms) > ok200",
      definition_200: "code HTTP 200, au moins un item parsé, réponse en 5 s ou moins",
    },
    total_sources: sources.length,
    verifiees: resultats.length,
    couverture_pct: sources.length === 0 ? 0 : Math.round((10000 * resultats.length) / sources.length) / 100,
    resume,
    a_debrancher: aDebrancher,
    sources: resultats.map((r) => ({
      id: r.source.id,
      nom: r.source.name,
      url: r.source.url,
      format: r.source.format,
      code_http: r.code_http,
      content_type: r.content_type,
      items: r.items,
      derniere_item_at: r.derniere_item_at,
      ms: r.ms,
      verifie_at: r.verifie_at,
      transport: r.transport,
      etat: r.etat,
      motif: r.motif,
    })),
  };
  await writeFile(SORTIE_JSON, `${JSON.stringify(rapportJson, null, 2)}\n`, "utf8");

  const lignes = [
    "# Vérification HTTP des sources",
    "",
    `Mesure du ${rapportJson.genere_le} — ${rapportJson.verifiees}/${rapportJson.total_sources} sources vérifiées (${rapportJson.couverture_pct} %).`,
    `User-Agent : \`${USER_AGENT}\`. Un GET par source ; .onion via Tor.`,
    "",
    "| État | Sources |",
    "| --- | ---: |",
    `| 200 (item parsé, ≤ 5 s) | ${resume["200"]} |`,
    `| muettes (200, 0 item parsé) | ${resume.muettes} |`,
    `| mortes (erreur réseau ou HTTP ≥ 400) | ${resume.mortes} |`,
    `| lentes (> 5 s, items parsés) | ${resume.lentes} |`,
    `| **total vérifié** | **${resultats.length}** |`,
    "",
    "Règles disjointes : morte > muette > lente > 200. Une source muette répond mais ne produit aucun item exploitable ; une source morte ne répond pas ou répond par une erreur HTTP.",
    "",
    `## Sources à débrancher (${aDebrancher.length})`,
    "",
    "| Source | Nom | URL | État | Motif |",
    "| --- | --- | --- | --- | --- |",
    ...aDebrancher.map((s) => `| ${s.id} | ${s.nom.replace(/\|/g, "\\|")} | ${s.url.replace(/\|/g, "\\|")} | ${s.etat} | ${s.motif.replace(/\|/g, "\\|")} |`),
    "",
    "La liste couvre les sources mortes et les sources muettes : elles consomment une cadence de collecte sans produire d'item vérifiable. Les sources lentes sont conservées et signalées dans le JSON.",
    "",
  ];
  await writeFile(SORTIE_MD, lignes.join("\n"), "utf8");

  console.log(`\n${resultats.length}/${sources.length} vérifiées (${rapportJson.couverture_pct} %)`);
  console.log(`200=${resume["200"]} muettes=${resume.muettes} mortes=${resume.mortes} lentes=${resume.lentes}`);
  console.log(`à débrancher : ${aDebrancher.length} — ${SORTIE_MD} et ${SORTIE_JSON}`);
}

main()
  .catch((erreur: unknown) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => {
    void closePools();
  });
