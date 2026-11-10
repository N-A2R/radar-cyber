/**
 * Construit `db/indicator-denylist.json` depuis le dépôt MISP warninglists
 * cloné dans /tmp/oss-warninglists.
 *
 * Objectif : ne plus créer d'indicateurs pour des valeurs légitimement
 * courantes (domaines populaires, réseaux de datacenters). Le collecteur
 * générique cite des hôtes trouvés dans le texte des articles ; sans cette
 * liste, un article mentionnant `cloudflare.com` produit un « indicateur ».
 *
 * Sélection :
 *   - domaines : listes dont le nom contient « Top » (Tranco, Cloudflare
 *     Radar, NetAPI, Cisco Umbrella, Alexa, Majestic, Moz) et dont le type
 *     est `hostname` ou `string` ; seules les entrées ressemblant à un nom
 *     d'hôte sont retenues (les listes Moz/Cloudflare mêlent pages et
 *     entrées malformées).
 *   - réseaux : listes `datacenter-ipv4` / `datacenter-ipv6` (type `cidr`).
 *
 * Sortie : { domains: string[], networks: string[] }, domaines minuscules,
 * triés, dédupliqués, plafonnés à MAX_DOMAINS.
 *
 * Usage : node scripts/build-warninglist.mts [--source /tmp/oss-warninglists/lists]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_SOURCE = "/tmp/oss-warninglists/lists";
const OUT_PATH = join(import.meta.dirname ?? new URL("..", import.meta.url).pathname, "..", "db", "indicator-denylist.json");
const MAX_DOMAINS = 200_000;
/** Un nom d'hôte plausible : labels alphanumériques pointés, TLD alphabétique. */
const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IPV4_CIDR_RE = /^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/;
const IPV6_CIDR_RE = /^[0-9a-f:]+\/\d{1,3}$/i;

type WarningList = {
  name?: unknown;
  type?: unknown;
  list?: unknown;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function listDirs(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name));
}

function cleanHostname(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/^\.+/, "").replace(/\.$/, "");
  return HOSTNAME_RE.test(host) ? host : null;
}

function isValidNetwork(raw: string, family: "ipv4" | "ipv6"): boolean {
  return family === "ipv4" ? IPV4_CIDR_RE.test(raw) : IPV6_CIDR_RE.test(raw);
}

function main(): void {
  const sourceArg = process.argv.indexOf("--source");
  const root = sourceArg >= 0 && process.argv[sourceArg + 1] ? process.argv[sourceArg + 1] : DEFAULT_SOURCE;
  console.log(`warninglists : ${root}`);

  // Meilleur rang atteint dans une liste « Top » : un plafond alphabétique
  // écraserait les domaines populaires (google.com, microsoft.com…), donc le
  // plafond garde d'abord les mieux classés.
  const domainRanks = new Map<string, number>();
  const networks = new Set<string>();
  const usedDomainLists: string[] = [];
  const usedNetworkLists: string[] = [];

  for (const dir of listDirs(root)) {
    let parsed: WarningList;
    try {
      parsed = JSON.parse(readFileSync(join(dir, "list.json"), "utf8")) as WarningList;
    } catch {
      continue;
    }
    const name = typeof parsed.name === "string" ? parsed.name : dir;
    const type = typeof parsed.type === "string" ? parsed.type : "";
    const entries = asStringArray(parsed.list);

    if (/top/i.test(name) && (type === "hostname" || type === "string")) {
      let kept = 0;
      for (let rank = 0; rank < entries.length; rank++) {
        const host = cleanHostname(entries[rank]);
        if (!host) continue;
        const previous = domainRanks.get(host);
        if (previous === undefined || rank < previous) domainRanks.set(host, rank);
        kept++;
      }
      if (kept > 0) usedDomainLists.push(`${name} (${kept})`);
      continue;
    }

    if (type === "cidr" && /datacenter/i.test(name)) {
      const family = /ipv6/i.test(name) ? "ipv6" : "ipv4";
      let kept = 0;
      for (const entry of entries) {
        const cidr = entry.trim();
        if (isValidNetwork(cidr, family)) {
          networks.add(cidr);
          kept++;
        }
      }
      if (kept > 0) usedNetworkLists.push(`${name} (${kept})`);
    }
  }

  const ranked = [...domainRanks.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const cappedDomains = ranked.slice(0, MAX_DOMAINS).map(([host]) => host).sort();
  const sortedNetworks = [...networks].sort();

  writeFileSync(OUT_PATH, `${JSON.stringify({ domains: cappedDomains, networks: sortedNetworks }, null, 2)}\n`, "utf8");

  console.log(`listes de domaines (${usedDomainLists.length}) :`);
  for (const entry of usedDomainLists) console.log(`  - ${entry}`);
  console.log(`listes de réseaux (${usedNetworkLists.length}) :`);
  for (const entry of usedNetworkLists) console.log(`  - ${entry}`);
  console.log(`domaines : ${domainRanks.size} dédupliqués, ${cappedDomains.length} écrits${domainRanks.size > MAX_DOMAINS ? ` (plafond ${MAX_DOMAINS}, meilleurs rangs conservés)` : ""}`);
  console.log(`réseaux  : ${sortedNetworks.length} écrits`);
  console.log(`sortie   : ${OUT_PATH}`);
}

main();
