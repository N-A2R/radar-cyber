import type { Event, Graph, Health, Org, Source, Stats } from "./api";

/**
 * Données simulées — exclusivement pour la démonstration.
 * Aucune de ces données ne provient d'une source réelle.
 */

const now = Date.now();

/** Date UTC figurant un instant survenu il y a `minutes` minutes. */
function ago(minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

const MOCK_ORGS: Org[] = [
  { id: 1, name: "CHU de Bordeaux", slug: "chu-bordeaux", kind: "sante", sector: "santé", city: "Bordeaux", dept: "33", lat: 44.8378, lon: -0.5792, eventCount: 3 },
  { id: 2, name: "Région Nouvelle-Aquitaine", slug: "region-na", kind: "collectivite", sector: "gouvernance", city: "Bordeaux", dept: "33", lat: 44.84, lon: -0.58, eventCount: 1 },
  { id: 3, name: "Dassault Aviation", slug: "dassault", kind: "entreprise", sector: "aéronautique", city: "Mérignac", dept: "33", lat: 44.8422, lon: -0.6453, eventCount: 2 },
  { id: 4, name: "Université de Poitiers", slug: "univ-poitiers", kind: "enseignement", sector: "enseignement", city: "Poitiers", dept: "86", lat: 46.5802, lon: 0.3404, eventCount: 0 },
  { id: 5, name: "Safran Helicopter Engines", slug: "safran", kind: "entreprise", sector: "aéronautique", city: "Bordes", dept: "64", lat: 43.2333, lon: -0.2833, eventCount: 1 },
  { id: 6, name: "CHU de Limoges", slug: "chu-limoges", kind: "sante", sector: "santé", city: "Limoges", dept: "87", lat: 45.8336, lon: 1.2611, eventCount: 0 },
  { id: 7, name: "Port de La Rochelle", slug: "port-lr", kind: "operateur_critique", sector: "transport", city: "La Rochelle", dept: "17", lat: 46.1591, lon: -1.152, eventCount: 0 },
  { id: 8, name: "TotalEnergies CSTJF", slug: "total-cstjf", kind: "entreprise", sector: "énergie", city: "Pau", dept: "64", lat: 43.2951, lon: -0.3708, eventCount: 1 },
];

const MOCK_EVENTS: Event[] = [
  {
    id: "m1", dedupKey: "mock:m1", family: "ransomware", assertionType: "third_party_claim",
    title: "Revendication non confirmée visant un établissement de santé régional", summary: null,
    observedAt: "2026-11-09T14:00:00Z", severity: 4, confidence: "C3", sourceId: "mock", sourceUrl: null,
    geoType: "claimed_origin", lat: 44.8378, lon: -0.5792, orgId: 1,
  },
  {
    id: "m2", dedupKey: "mock:m2", family: "vuln", assertionType: "confirmed_incident",
    title: "CVE-2026-24713 (BeanUtils) exploitée — KEV", summary: null,
    observedAt: "2026-11-08T09:00:00Z", severity: 5, confidence: "A1", sourceId: "cisa_kev", sourceUrl: null,
    geoType: "unknown", lat: null, lon: null, orgId: 3,
  },
  {
    id: "m3", dedupKey: "mock:m3", family: "phishing", assertionType: "technical_indicator",
    title: "Domaine typosquatté détecté : chu-bordeaux.fr", summary: null,
    observedAt: "2026-11-07T11:00:00Z", severity: 3, confidence: "C3", sourceId: "mock", sourceUrl: null,
    geoType: "hosting_estimate", lat: 51.5074, lon: -0.1278, orgId: 1,
  },
  {
    id: "m4", dedupKey: "mock:m4", family: "cert_fr", assertionType: "ambient_signal",
    title: "Avis CERT-FR : campagne d'hameçonnage ciblant les collectivités", summary: null,
    observedAt: "2026-11-06T08:00:00Z", severity: 3, confidence: "A1", sourceId: "cert_fr", sourceUrl: null,
    geoType: "unknown", lat: null, lon: null, orgId: null,
  },
  {
    id: "m5", dedupKey: "mock:m5", family: "malware", assertionType: "technical_indicator",
    title: "Hash associé à un infostealer observé dans un flux CTI", summary: null,
    observedAt: "2026-11-05T16:00:00Z", severity: 3, confidence: "C3", sourceId: "mock", sourceUrl: null,
    geoType: "unknown", lat: null, lon: null, orgId: 5,
  },
];

// Couvre les trois états de santé : ok, erreur, jamais collecté.
const MOCK_SOURCES: Source[] = [
  {
    id: "mock", name: "Source simulée (démo)", family: "cti", url: "https://example.invalid",
    kind: "narrative", format: "json", enabled: true, intervalSec: 3600,
    lastOkAt: ago(3), lastErrorAt: null, lastError: null, itemsTotal: 5, lastItems: 1, ok: true,
  },
  {
    id: "cert_fr", name: "CERT-FR", family: "cert_fr", url: "https://www.cert.ssi.gouv.fr/feed/",
    kind: "narrative", format: "rss", enabled: true, intervalSec: 900,
    lastOkAt: ago(12), lastErrorAt: null, lastError: null, itemsTotal: 486, lastItems: 2, ok: true,
  },
  {
    id: "cisa_kev", name: "CISA KEV", family: "vuln", url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    kind: "indicator", format: "json", enabled: true, intervalSec: 3600,
    lastOkAt: ago(48), lastErrorAt: null, lastError: null, itemsTotal: 1287, lastItems: 9, ok: true,
  },
  {
    id: "epss", name: "EPSS", family: "vuln", url: "https://api.first.org/data/v1/epss",
    kind: "indicator", format: "json", enabled: true, intervalSec: 3600,
    lastOkAt: ago(31), lastErrorAt: null, lastError: null, itemsTotal: 5421, lastItems: 23, ok: true,
  },
  {
    id: "ransomlook", name: "Ransomlook", family: "ransomware", url: "https://www.ransomlook.io/feed",
    kind: "narrative", format: "json", enabled: true, intervalSec: 1800,
    lastOkAt: ago(2880), lastErrorAt: ago(26), lastError: "HTTP 503 — service indisponible",
    itemsTotal: 93, lastItems: 0, ok: false,
  },
  {
    id: "hermes", name: "Hermès (flux régional)", family: "cti", url: "https://hermes.example.invalid/rss",
    kind: "narrative", format: "rss", enabled: true, intervalSec: 3600,
    lastOkAt: null, lastErrorAt: null, lastError: null, itemsTotal: null, lastItems: null, ok: false,
  },
  {
    id: "typosquat", name: "Typosquatting NA", family: "typosquat", url: "https://typosquat.example.invalid/api",
    kind: "indicator", format: "json", enabled: true, intervalSec: 1800,
    lastOkAt: ago(5), lastErrorAt: null, lastError: null, itemsTotal: 214, lastItems: 4, ok: true,
  },
  {
    id: "nvd", name: "NVD", family: "vuln", url: "https://services.nvd.nist.gov/json/cves/2.0",
    kind: "indicator", format: "json", enabled: true, intervalSec: 7200,
    lastOkAt: ago(4320), lastErrorAt: ago(120), lastError: "délai d'attente dépassé après 30000 ms",
    itemsTotal: 80412, lastItems: 0, ok: false,
  },
  {
    id: "abuse_ch", name: "abuse.ch Feodo", family: "malware", url: "https://feodo-tracker.abuse.ch/downloads/hostlist/",
    kind: "indicator", format: "json", enabled: true, intervalSec: 3600,
    lastOkAt: ago(72), lastErrorAt: null, lastError: null, itemsTotal: 3310, lastItems: 15, ok: true,
  },
  {
    id: "openphish", name: "OpenPhish", family: "phishing", url: "https://openphish.com/feed.txt",
    kind: "indicator", format: "text", enabled: true, intervalSec: 3600,
    lastOkAt: ago(9), lastErrorAt: null, lastError: null, itemsTotal: 1204, lastItems: 6, ok: true,
  },
  {
    id: "regional_na", name: "Veille régionale NA (à activer)", family: "cert", url: "https://veille.example.invalid/rss",
    kind: "narrative", format: "rss", enabled: false, intervalSec: 3600,
    lastOkAt: null, lastErrorAt: null, lastError: null, itemsTotal: null, lastItems: null, ok: false,
  },
];

const MOCK_STATS: Stats = {
  orgs: MOCK_ORGS.length,
  events: MOCK_EVENTS.length,
  indicators: 0,
  sources: { total: 11, active: 9, ok: 7, err: 2 },
  byFamily: [
    { family: "ransomware", n: 1 },
    { family: "vuln", n: 1 },
    { family: "phishing", n: 1 },
    { family: "cert_fr", n: 1 },
    { family: "malware", n: 1 },
  ],
  byAssertion: [
    { assertion_type: "third_party_claim", n: 1 },
    { assertion_type: "confirmed_incident", n: 1 },
    { assertion_type: "technical_indicator", n: 2 },
    { assertion_type: "ambient_signal", n: 1 },
  ],
};

const MOCK_GRAPH: Graph = {
  nodes: [
    { id: "org:1", label: "CHU de Bordeaux", kind: "org" },
    { id: "org:3", label: "Dassault Aviation", kind: "org" },
    { id: "org:5", label: "Safran Helicopter Engines", kind: "org" },
    { id: "family:ransomware", label: "rançongiciel", kind: "family" },
    { id: "family:vuln", label: "vulnérabilité", kind: "family" },
    { id: "family:phishing", label: "hameçonnage", kind: "family" },
  ],
  links: [
    { source: "org:1", target: "family:ransomware", type: "has_event" },
    { source: "org:1", target: "family:phishing", type: "has_event" },
    { source: "org:3", target: "family:vuln", type: "has_event" },
    { source: "org:5", target: "family:ransomware", type: "has_event" },
  ],
};

const MOCK_HEALTH: Health = {
  ok: true,
  sources: MOCK_SOURCES.map((s) => s.id),
};

export const mockData = {
  orgs: MOCK_ORGS,
  events: MOCK_EVENTS,
  sources: MOCK_SOURCES,
  stats: MOCK_STATS,
  graph: MOCK_GRAPH,
  health: MOCK_HEALTH,
};
