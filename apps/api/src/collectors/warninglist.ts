/**
 * Dénylist d'indicateurs légitimement courants.
 *
 * Le collecteur générique extrait les hôtes trouvés dans le texte des articles
 * ; un article qui cite `cloudflare.com` ou une IP de datacenter produit un
 * « indicateur » qui n'en est pas un. Ce module charge
 * `db/indicator-denylist.json` (produit par `scripts/build-warninglist.mts`
 * depuis les warninglists MISP) et classe les valeurs en `legitimate` ou
 * `unknown`. Aucune connexion base : dégradation gracieuse en cas d'absence.
 */
import { readFileSync } from "node:fs";
import { BlockList, isIP } from "node:net";
import { fileURLToPath } from "node:url";

export type Verdict = "legitimate" | "unknown";

type DenylistState = {
  domains: Set<string>;
  /** Réseaux IPv4 et IPv6 regroupés dans un seul BlockList. */
  networks: BlockList;
};

type RawDenylist = { domains?: unknown; networks?: unknown };

const DENYLIST_PATH =
  process.env.INDICATOR_DENYLIST_PATH ??
  fileURLToPath(new URL("../../../../db/indicator-denylist.json", import.meta.url));

let state: DenylistState | null = null;
let warned = false;

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function loadOnce(): DenylistState | null {
  if (state) return state;
  try {
    const parsed = JSON.parse(readFileSync(DENYLIST_PATH, "utf8")) as RawDenylist;
    const domains = new Set<string>();
    for (const raw of stringArray(parsed.domains)) {
      const host = raw.trim().toLowerCase().replace(/\.$/, "");
      if (host) domains.add(host);
    }
    const networks = new BlockList();
    for (const raw of stringArray(parsed.networks)) {
      const cidr = raw.trim();
      const slash = cidr.indexOf("/");
      if (slash <= 0) continue;
      const address = cidr.slice(0, slash);
      const prefix = Number(cidr.slice(slash + 1));
      const family = isIP(address);
      if (family === 0 || !Number.isInteger(prefix)) continue;
      try {
        networks.addSubnet(address, prefix, family === 4 ? "ipv4" : "ipv6");
      } catch {
        // Entrée malformée : on ignore, le reste de la liste reste utilisable.
      }
    }
    state = { domains, networks };
    return state;
  } catch {
    if (!warned) {
      warned = true;
      console.warn(
        `warninglist : ${DENYLIST_PATH} illisible — aucun indicateur ne sera écarté (lancer scripts/build-warninglist.mts)`,
      );
    }
    return null;
  }
}

/** Normalise une valeur : domaine nu, minuscules, sans défang ni chemin. */
function normalize(value: string): string {
  let host = value.trim().toLowerCase();
  host = host.replace(/\[\.\]/g, ".").replace(/^hxxps?:\/\//, "http://").replace(/^[a-z]+:\/\//, "");
  const pathStart = host.search(/[/?#]/);
  if (pathStart !== -1) host = host.slice(0, pathStart);
  const portStart = host.lastIndexOf(":");
  if (portStart > 0 && host.indexOf(":") === portStart) host = host.slice(0, portStart);
  return host.replace(/\.$/, "");
}

/** Correspondance exacte, ou suffixe sur frontière de label (`a.b.example.com` ⊃ `example.com`). */
function matchesDomain(host: string, domains: Set<string>): boolean {
  if (domains.has(host)) return true;
  let dot = host.indexOf(".");
  while (dot !== -1) {
    const suffix = host.slice(dot + 1);
    // Un suffixe à label unique est un TLD : jamais un indicateur en soi.
    if (!suffix.includes(".")) return false;
    if (domains.has(suffix)) return true;
    dot = host.indexOf(".", dot + 1);
  }
  return false;
}

function matchesNetwork(value: string, networks: BlockList): boolean {
  const family = isIP(value);
  if (family === 0) return false;
  return networks.check(value, family === 4 ? "ipv4" : "ipv6");
}

/**
 * `legitimate` : la valeur figure dans les listes de valeurs populaires ou
 * appartient à un réseau de datacenter — ce n'est pas un indicateur d'attaque.
 * `unknown` : rien à signaler, l'appelant décide.
 */
export function classifyIndicator(kind: string, value: string): Verdict {
  const loaded = loadOnce();
  if (!loaded) return "unknown";
  const host = normalize(value);
  if (!host) return "unknown";
  if (matchesNetwork(host, loaded.networks)) return "legitimate";
  if (/domain|host|url|uri|fqdn/i.test(kind) || host.includes(".")) {
    if (matchesDomain(host, loaded.domains)) return "legitimate";
  }
  return "unknown";
}

/** Écarte les indicateurs légitimes d'un lot, en conservant l'ordre et l'identité des éléments. */
export function filterIndicators<T extends { kind: string; value: string }>(
  items: T[],
): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  let dropped = 0;
  for (const item of items) {
    if (classifyIndicator(item.kind, item.value) === "legitimate") dropped++;
    else kept.push(item);
  }
  return { kept, dropped };
}
