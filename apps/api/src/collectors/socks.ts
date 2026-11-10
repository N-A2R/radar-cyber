// Transport SOCKS5 pour les pages .onion (roadmap phase 3 : Tor en proxy).
// Aucune dépendance npm : handshake RFC 1928 minimal sur `node:net`, puis
// requête HTTP/1.1 via `node:http` sur le socket Tor déjà ouvert.
//
// Choix structurant : la commande CONNECT envoie TOUJOURS le nom d'hôte
// (ATYP = 0x03, adresse de type domaine), jamais une IP résolue localement.
// C'est la sémantique garantie par la forme `socks5h://` : la résolution DNS
// a lieu DANS Tor, il n'y a donc aucune fuite vers le résolveur du clearnet.
// Le schéma `socks5://` est accepté avec la même sémantique (ATYP domaine) :
// accepter puis résoudre localement une adresse .onion serait un échec muet.

import http from "node:http";
import net from "node:net";

export class SocksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocksError";
  }
}

export interface SocksProxy {
  host: string;
  port: number;
}

const ALLOWED_PROTOCOLS = new Set(["socks5h:", "socks5:"]);

/**
 * Parse `RADAR_TOR_SOCKS` (`socks5h://127.0.0.1:9050`).
 * Retourne `null` si la variable est absente ou vide ; lève une `SocksError`
 * explicite (message contenant le nom de la variable) sinon.
 */
export function parseSocksProxy(raw: string | null | undefined): SocksProxy | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (value === "") return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SocksError(
      `RADAR_TOR_SOCKS invalide (« ${value} ») : format attendu socks5h://hôte:port`
    );
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SocksError(
      `RADAR_TOR_SOCKS invalide (« ${value} ») : schéma ${parsed.protocol.replace(":", "")} non supporté, attendu socks5h://hôte:port`
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new SocksError(
      `RADAR_TOR_SOCKS invalide (« ${value} ») : authentification proxy non supportée (handshake sans auth uniquement)`
    );
  }

  // `URL.hostname` conserve les crochets d'une IPv6 littérale.
  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (host === "") {
    throw new SocksError(`RADAR_TOR_SOCKS invalide (« ${value} ») : hôte du proxy manquant`);
  }
  if (parsed.port === "") {
    throw new SocksError(`RADAR_TOR_SOCKS invalide (« ${value} ») : port du proxy manquant`);
  }
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SocksError(`RADAR_TOR_SOCKS invalide (« ${value} ») : port ${parsed.port} hors de 1..65535`);
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    throw new SocksError(
      `RADAR_TOR_SOCKS invalide (« ${value} ») : chemin ${parsed.pathname} inattendu, attendu socks5h://hôte:port`
    );
  }

  return { host, port };
}

export function torProxyFromEnv(env: NodeJS.ProcessEnv = process.env): SocksProxy | null {
  return parseSocksProxy(env.RADAR_TOR_SOCKS);
}

/** Suffixe `.onion` sur l'hôte seul (insensible à la casse et au point final). */
export function isOnionHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  return normalized.length > "onion".length && normalized.endsWith(".onion");
}

// --- Handshake SOCKS5 (RFC 1928) -------------------------------------------

const VERSION = 0x05;
const METHOD_NO_AUTH = 0x00;
const METHOD_NOT_ACCEPTABLE = 0xff;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;
const REPLY_OK = 0x00;

const REPLY_REASON: Record<number, string> = {
  1: "échec général du proxy",
  2: "connexion refusée par les règles du proxy",
  3: "réseau inaccessible",
  4: "hôte inaccessible (page .onion éteinte ou injoignable ?)",
  5: "connexion refusée par la cible",
  6: "TTL expiré",
  7: "commande non supportée",
  8: "type d'adresse non supporté",
};

function portBuffer(port: number): Buffer {
  const buf = Buffer.allocUnsafe(2);
  buf.writeUInt16BE(port, 0);
  return buf;
}

/**
 * Ouvre un tunnel SOCKS5 CONNECT vers `targetHost:targetPort` et retourne le
 * socket prêt à recevoir les octets de l'application.
 *
 * Déroulé : greeting `05 01 00` (UNE méthode : sans auth) → le proxy répond
 * `05 00` (ou `05 FF` = auth exigée, échec net) → requête
 * `05 01 00 03 <len> <hôte utf8> <port BE16>` → réponse `05 00 00 <atyp> …`.
 * Tout écart de protocole, code de retour non nul ou délai dépassé lève une
 * `SocksError` typée : jamais d'échec muet, jamais de repli clearnet.
 */
export function socksConnect(
  proxy: SocksProxy,
  targetHost: string,
  targetPort: number,
  timeoutMs = 20000
): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port });
    let stage: "greeting" | "reply" = "greeting";
    let buf = Buffer.alloc(0);
    let settled = false;

    const timer = setTimeout(() => {
      fail(
        new SocksError(
          `Timeout SOCKS5 (${timeoutMs} ms) via ${proxy.host}:${proxy.port} vers ${targetHost}:${targetPort}`
        )
      );
    }, timeoutMs);

    function detach(): void {
      socket.off("connect", onConnect);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    }

    function fail(err: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      detach();
      socket.destroy();
      reject(err);
    }

    function succeed(): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      detach();
      // Les erreurs ultérieures appartiennent à `http.ClientRequest` ; ce
      // listener no-op évite qu'un `error` émis avant la prise en charge du
      // socket ne fasse planter le process (un « error » sans listener).
      socket.on("error", () => {});
      socket.setNoDelay(true);
      resolve(socket);
    }

    function onConnect(): void {
      socket.write(Buffer.from([VERSION, 0x01, METHOD_NO_AUTH]));
    }

    function onData(chunk: Buffer): void {
      buf = Buffer.concat([buf, chunk]);

      if (stage === "greeting") {
        if (buf.length < 2) return;
        if (buf[0] !== VERSION) {
          fail(new SocksError(`Réponse SOCKS5 invalide : version 0x${buf[0].toString(16)} au lieu de 0x05`));
          return;
        }
        if (buf[1] === METHOD_NOT_ACCEPTABLE) {
          fail(new SocksError("Proxy SOCKS5 exige une authentification (aucune méthode sans auth acceptée)"));
          return;
        }
        if (buf[1] !== METHOD_NO_AUTH) {
          fail(new SocksError(`Méthode SOCKS5 0x${buf[1].toString(16)} non supportée (seule la méthode 0x00 l'est)`));
          return;
        }
        buf = buf.subarray(2);
        stage = "reply";

        const hostBytes = Buffer.from(targetHost, "utf8");
        if (hostBytes.length === 0 || hostBytes.length > 255) {
          fail(new SocksError(`Hôte cible inutilisable pour SOCKS5 : « ${targetHost} »`));
          return;
        }
        socket.write(
          Buffer.concat([
            Buffer.from([VERSION, CMD_CONNECT, 0x00, ATYP_DOMAIN, hostBytes.length]),
            hostBytes,
            portBuffer(targetPort),
          ])
        );
      }

      if (stage === "reply") {
        if (buf.length < 5) return;
        if (buf[0] !== VERSION) {
          fail(new SocksError(`Réponse CONNECT SOCKS5 invalide : version 0x${buf[0].toString(16)} au lieu de 0x05`));
          return;
        }
        const rep = buf[1];
        const atyp = buf[3];
        let addrLen: number;
        if (atyp === ATYP_IPV4) addrLen = 4;
        else if (atyp === ATYP_IPV6) addrLen = 16;
        else if (atyp === ATYP_DOMAIN) {
          if (buf.length < 5) return;
          addrLen = 1 + buf[4];
        } else {
          fail(new SocksError(`Réponse CONNECT SOCKS5 : type d'adresse 0x${atyp.toString(16)} inconnu`));
          return;
        }
        const replyLen = 4 + addrLen + 2;
        if (buf.length < replyLen) return;

        if (rep !== REPLY_OK) {
          const reason = REPLY_REASON[rep] ?? "code inconnu";
          fail(
            new SocksError(
              `CONNECT SOCKS5 refusé pour ${targetHost}:${targetPort} (code ${rep} : ${reason})`
            )
          );
          return;
        }

        buf = buf.subarray(replyLen);
        succeed();
      }
    }

    function onError(err: Error): void {
      fail(
        new SocksError(
          `Proxy SOCKS5 ${proxy.host}:${proxy.port} injoignable : ${err.message}`
        )
      );
    }

    function onClose(): void {
      fail(
        new SocksError(
          `Proxy SOCKS5 ${proxy.host}:${proxy.port} a fermé la connexion pendant le handshake (${targetHost}:${targetPort})`
        )
      );
    }

    socket.on("connect", onConnect);
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

// --- Requête HTTP sur le tunnel -------------------------------------------

export interface SocksResponse {
  status: number;
  header(name: string): string | null;
  text(): Promise<string>;
}

export interface SocksFetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * GET HTTP/1.1 sur une URL `http:` via le proxy SOCKS5. HTTPS/TLS au travers
 * du tunnel n'est pas implémenté (les certificats .onion sont hors PKI) : on
 * échoue explicitement plutôt que de retomber sur un accès clearnet.
 */
export async function socksFetch(
  url: string,
  proxy: SocksProxy,
  opts: SocksFetchOpts = {}
): Promise<SocksResponse> {
  const target = new URL(url);
  if (target.protocol !== "http:") {
    throw new SocksError(
      `TLS/HTTPS au travers de SOCKS non supporté (${url}) : seule la collecte http:// via Tor est implémentée`
    );
  }
  const hostname = target.hostname.replace(/^\[/, "").replace(/\]$/, "");
  const port = target.port === "" ? 80 : Number(target.port);
  const timeoutMs = opts.timeoutMs ?? 20000;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const socket = await socksConnect(proxy, hostname, port, timeoutMs);
  const path = `${target.pathname === "" ? "/" : target.pathname}${target.search}`;

  return new Promise<SocksResponse>((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    let total = 0;

    function fail(err: Error): void {
      if (settled) return;
      settled = true;
      req.destroy();
      socket.destroy();
      reject(err);
    }

    function succeed(res: SocksResponse): void {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(res);
    }

    const req = http.request({
      host: hostname,
      port,
      method: "GET",
      path,
      agent: false,
      headers: {
        ...(opts.headers ?? {}),
        Host: target.host,
        Connection: "close",
      },
      createConnection: () => socket,
    });

    req.setTimeout(timeoutMs, () => {
      fail(new SocksError(`Timeout HTTP via SOCKS (${timeoutMs} ms) pour ${url}`));
    });
    req.on("error", fail);

    req.on("response", (res) => {
      const headerMap = new Map<string, string>();
      for (const [name, value] of Object.entries(res.headers)) {
        if (value === undefined) continue;
        headerMap.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
      }
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          res.destroy();
          fail(new SocksError(`Réponse via SOCKS trop volumineuse (> ${maxBytes} octets) pour ${url}`));
          return;
        }
        chunks.push(chunk);
      });
      res.on("error", fail);
      res.on("end", () => {
        succeed({
          status: res.statusCode ?? 0,
          header: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
          text: async () => Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    req.end();
  });
}
