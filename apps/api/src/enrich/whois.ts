import { assertPublicDomain, fetchBoundedJson } from "../security/network.js";
// Enrichissement WHOIS/RDAP pour un domaine — radar-cyber.
// API publique : https://rdap.org/domain/<domaine> (redirection vers le registre RDAP du TLD). HTTP 200 + JSON.

const TIMEOUT_MS = 8000;

export interface WhoisResult {
  registrar?: string;
  created?: string;
  expires?: string;
  updated?: string;
  nameServers: string[];
  status: string[];
}

interface RdapNameServer {
  ldhName?: string;
  name?: string;
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapVcardEntry {
  0: string;
  3?: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, RdapVcardEntry[]];
}

interface RdapResponse {
  nameservers?: RdapNameServer[];
  status?: string[];
  events?: RdapEvent[];
  entities?: RdapEntity[];
}

/** Nom du registraire : premier entité dont les rôles incluent « registrar ». */
function registrarOf(entities: RdapEntity[] | undefined): string | undefined {
  for (const entity of entities ?? []) {
    if (!entity.roles?.includes("registrar")) continue;
    const vcard = entity.vcardArray?.[1];
    const fn = vcard?.find((v) => v[0] === "fn")?.["3"];
    if (fn) return fn;
  }
  return undefined;
}

function eventDate(events: RdapEvent[] | undefined, action: string): string | undefined {
  return events?.find((e) => e.eventAction === action)?.eventDate;
}

export async function enrichDomain(domain: string): Promise<WhoisResult> {
  const cible = assertPublicDomain(domain);
  const j = await fetchBoundedJson<RdapResponse>(`https://rdap.org/domain/${encodeURIComponent(cible)}`, {
    timeoutMs: TIMEOUT_MS,
    maxBytes: 256_000,
    headers: { Accept: "application/rdap+json" },
  });
  const nameServers = (j.nameservers ?? [])
    .map((n) => (n.ldhName ?? n.name ?? "").toLowerCase())
    .filter(Boolean);
  return {
    registrar: registrarOf(j.entities),
    created: eventDate(j.events, "registration"),
    expires: eventDate(j.events, "expiration"),
    updated: eventDate(j.events, "last changed"),
    nameServers,
    status: j.status ?? [],
  };
}
