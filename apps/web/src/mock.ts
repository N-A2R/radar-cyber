import type { Event, Graph, Health, Org, OrgDetail, Source, Stats } from "./api";

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
  { id: 1, name: "CHU de Bordeaux", domain: "chu-bordeaux.fr", slug: "chu-bordeaux", kind: "sante", sector: "santé", city: "Bordeaux", dept: "33", lat: 44.8378, lon: -0.5792, eventCount: 3 },
  { id: 2, name: "Région Nouvelle-Aquitaine", slug: "region-na", kind: "collectivite", sector: "gouvernance", city: "Bordeaux", dept: "33", lat: 44.84, lon: -0.58, eventCount: 1 },
  { id: 3, name: "Dassault Aviation", domain: "dassault-aviation.com", slug: "dassault", kind: "entreprise", sector: "aéronautique", city: "Mérignac", dept: "33", lat: 44.8422, lon: -0.6453, eventCount: 2 },
  { id: 4, name: "Université de Poitiers", domain: "univ-poitiers.fr", slug: "univ-poitiers", kind: "enseignement", sector: "enseignement", city: "Poitiers", dept: "86", lat: 46.5802, lon: 0.3404, eventCount: 0 },
  { id: 5, name: "Safran Helicopter Engines", domain: "safran-helicopter-engines.com", slug: "safran", kind: "entreprise", sector: "aéronautique", city: "Bordes", dept: "64", lat: 43.2333, lon: -0.2833, eventCount: 1 },
  { id: 6, name: "CHU de Limoges", slug: "chu-limoges", kind: "sante", sector: "santé", city: "Limoges", dept: "87", lat: 45.8336, lon: 1.2611, eventCount: 0 },
  { id: 7, name: "Port de La Rochelle", slug: "port-lr", kind: "operateur_critique", sector: "transport", city: "La Rochelle", dept: "17", lat: 46.1591, lon: -1.152, eventCount: 0 },
  { id: 8, name: "TotalEnergies CSTJF", slug: "total-cstjf", kind: "entreprise", sector: "énergie", city: "Pau", dept: "64", lat: 43.2951, lon: -0.3708, eventCount: 1 },
  { id: 9, name: "Université de Bordeaux", slug: "univ-bordeaux", kind: "enseignement", sector: "enseignement", city: "Bordeaux", dept: "33", lat: 44.8378, lon: -0.5792, eventCount: 2 },
  { id: 10, name: "CHU de Poitiers", slug: "chu-poitiers", kind: "sante", sector: "santé", city: "Poitiers", dept: "86", lat: 46.5802, lon: 0.3404, eventCount: 1 },
  { id: 11, name: "Mairie de Bordeaux", slug: "mairie-bordeaux", kind: "collectivite", sector: "gouvernance", city: "Bordeaux", dept: "33", lat: 44.8378, lon: -0.5792, eventCount: 1 },
  { id: 12, name: "Bordeaux Métropole", slug: "bordeaux-metropole", kind: "collectivite", sector: "gouvernance", city: "Bordeaux", dept: "33", lat: 44.8637, lon: -0.594, eventCount: 0 },
  { id: 13, name: "Grand Poitiers", slug: "grand-poitiers", kind: "collectivite", sector: "gouvernance", city: "Poitiers", dept: "86", lat: 46.5833, lon: 0.3333, eventCount: 0 },
  { id: 14, name: "Département de la Gironde", slug: "departement-33", kind: "collectivite", sector: "gouvernance", city: "Bordeaux", dept: "33", lat: 44.8412, lon: -0.58, eventCount: 0 },
  { id: 15, name: "Lectra", domain: "lectra.com", slug: "lectra", kind: "entreprise", sector: "industrie", city: "Cestas", dept: "33", lat: 44.7439, lon: -0.6817, eventCount: 1 },
  { id: 16, name: "Cdiscount", slug: "cdiscount", kind: "entreprise", sector: "distribution", city: "Bordeaux", dept: "33", lat: 44.8265, lon: -0.556, eventCount: 0 },
  { id: 17, name: "Ubisoft Bordeaux", slug: "ubisoft-bordeaux", kind: "entreprise", sector: "jeu vidéo", city: "Bordeaux", dept: "33", lat: 44.8497, lon: -0.5665, eventCount: 0 },
  { id: 18, name: "Cofinoga", slug: "cofinoga", kind: "entreprise", sector: "finance", city: "Mérignac", dept: "33", lat: 44.8422, lon: -0.6453, eventCount: 0 },
  { id: 19, name: "Covéa", slug: "covea", kind: "entreprise", sector: "assurance", city: "Niort", dept: "79", lat: 46.3239, lon: -0.4587, eventCount: 1 },
  { id: 20, name: "MAAF Assurances", slug: "maaf", kind: "entreprise", sector: "assurance", city: "Niort", dept: "79", lat: 46.325, lon: -0.46, eventCount: 0 },
  { id: 21, name: "Bordeaux INP", slug: "bordeaux-inp", kind: "enseignement", sector: "enseignement", city: "Talence", dept: "33", lat: 44.8078, lon: -0.5894, eventCount: 0 },
  { id: 22, name: "Inria Bordeaux", slug: "inria-bordeaux", kind: "recherche", sector: "recherche", city: "Talence", dept: "33", lat: 44.8065, lon: -0.59, eventCount: 0 },
  { id: 23, name: "CNRS Nouvelle-Aquitaine", slug: "cnrs-na", kind: "recherche", sector: "recherche", city: "Bordeaux", dept: "33", lat: 44.83, lon: -0.59, eventCount: 0 },
  { id: 24, name: "ARS Nouvelle-Aquitaine", slug: "ars-na", kind: "sante", sector: "santé publique", city: "Bordeaux", dept: "33", lat: 44.85, lon: -0.57, eventCount: 1 },
  { id: 25, name: "CCI Bordeaux Gironde", slug: "cci-bordeaux", kind: "collectivite", sector: "économie", city: "Bordeaux", dept: "33", lat: 44.86, lon: -0.57, eventCount: 0 },
  { id: 26, name: "Groupe Sud Ouest", slug: "sud-ouest", kind: "entreprise", sector: "presse", city: "Bordeaux", dept: "33", lat: 44.828, lon: -0.556, eventCount: 0 },
  { id: 27, name: "Aéroport de Bordeaux-Mérignac", slug: "aeroport-bordeaux", kind: "operateur", sector: "transport", city: "Mérignac", dept: "33", lat: 44.8283, lon: -0.7156, eventCount: 1 },
  { id: 28, name: "Keolis Bordeaux Métropole", slug: "keolis-tbm", kind: "operateur", sector: "transport", city: "Bordeaux", dept: "33", lat: 44.84, lon: -0.58, eventCount: 0 },
  { id: 29, name: "Enedis Nouvelle-Aquitaine", slug: "enedis-na", kind: "operateur", sector: "énergie", city: "Bordeaux", dept: "33", lat: 44.835, lon: -0.585, eventCount: 0 },
  { id: 30, name: "Orange Nouvelle-Aquitaine", slug: "orange-na", kind: "operateur", sector: "télécom", city: "Bordeaux", dept: "33", lat: 44.845, lon: -0.575, eventCount: 0 },
  { id: 31, name: "Atos Bordeaux", slug: "atos-bordeaux", kind: "entreprise", sector: "numérique", city: "Bordeaux", dept: "33", lat: 44.86, lon: -0.56, eventCount: 0 },
  { id: 32, name: "Solocal Atlantique", slug: "solocal-atlantique", kind: "entreprise", sector: "numérique", city: "La Rochelle", dept: "17", lat: 46.1603, lon: -1.1511, eventCount: 0 },
  { id: 33, name: "Coopérative Euralis", slug: "euralis", kind: "entreprise", sector: "agroalimentaire", city: "Lescar", dept: "64", lat: 43.3272, lon: -0.4322, eventCount: 0 },
  { id: 34, name: "Université de Limoges", slug: "univ-limoges", kind: "enseignement", sector: "enseignement", city: "Limoges", dept: "87", lat: 45.8336, lon: 1.2611, eventCount: 0 },
  { id: 35, name: "La Rochelle Université", slug: "univ-la-rochelle", kind: "enseignement", sector: "enseignement", city: "La Rochelle", dept: "17", lat: 46.1603, lon: -1.1511, eventCount: 0 },
  { id: 36, name: "Centre Hospitalier de Pau", slug: "ch-pau", kind: "sante", sector: "santé", city: "Pau", dept: "64", lat: 43.2951, lon: -0.3708, eventCount: 0 },
  { id: 37, name: "Thales Avionique", slug: "thales-avionique", kind: "entreprise", sector: "aéronautique", city: "Mérignac", dept: "33", lat: 44.8422, lon: -0.6453, eventCount: 0 },
  { id: 38, name: "Mairie de Poitiers", slug: "mairie-poitiers", kind: "collectivite", sector: "gouvernance", city: "Poitiers", dept: "86", lat: 46.5802, lon: 0.3404, eventCount: 0 },
];

const MOCK_EVENTS: Event[] = [
  {
    id: "m1", dedupKey: "mock:m1", family: "ransomware", assertionType: "third_party_claim",
    title: "Revendication non confirmée visant un établissement de santé régional", summary: null,
    observedAt: "2026-11-09T14:00:00Z", severity: 4, confidence: "C3", sourceId: "mock", sourceUrl: null,
    geoType: "claimed_origin", lat: 44.8378, lon: -0.5792, orgId: 1, regional: true,
  },
  {
    id: "m2", dedupKey: "mock:m2", family: "vuln", assertionType: "confirmed_incident",
    title: "CVE-2026-24713 (BeanUtils) exploitée — KEV", summary: null,
    observedAt: "2026-11-08T09:00:00Z", severity: 5, confidence: "A1", sourceId: "cisa_kev", sourceUrl: null,
    geoType: "unknown", lat: null, lon: null, orgId: 3, regional: true,
  },
  {
    id: "m3", dedupKey: "mock:m3", family: "phishing", assertionType: "technical_indicator",
    title: "Domaine typosquatté détecté : chu-bordeaux.fr", summary: null,
    observedAt: "2026-11-07T11:00:00Z", severity: 3, confidence: "C3", sourceId: "mock", sourceUrl: null,
    geoType: "hosting_estimate", lat: 51.5074, lon: -0.1278, orgId: 1, regional: true,
  },
  {
    id: "m4", dedupKey: "mock:m4", family: "cert_fr", assertionType: "ambient_signal",
    title: "Avis CERT-FR : campagne d'hameçonnage ciblant les collectivités", summary: null,
    observedAt: "2026-11-06T08:00:00Z", severity: 3, confidence: "A1", sourceId: "cert_fr", sourceUrl: null,
    geoType: "unknown", lat: null, lon: null, orgId: null, regional: false,
  },
  {
    id: "m5", dedupKey: "mock:m5", family: "malware", assertionType: "technical_indicator",
    title: "Hash associé à un infostealer observé dans un flux CTI", summary: null,
    observedAt: "2026-11-05T16:00:00Z", severity: 3, confidence: "C3", sourceId: "mock", sourceUrl: null,
    geoType: "unknown", lat: null, lon: null, orgId: 5, regional: true,
  },
];

// Couvre les trois états de santé : ok, erreur, jamais collecté.
/** Une source de démonstration n'a pas d'historique de rendement : inconnu. */
const MOCK_MEASURE = {
  disabledAt: null,
  disabledReason: null,
  entrees: null,
  rejets: null,
  evenements30j: 0,
  evenementsTotal: 0,
  dernierRun: null,
  dernierRunStatut: null,
  rendement: null,
  motifs: null,
  motifDominant: null,
} as const;

const MOCK_SOURCES: Source[] = [
  {
    id: "mock", name: "Source simulée (démo)", family: "cti", url: "https://example.invalid",
    ...MOCK_MEASURE,
    kind: "narrative", format: "json", enabled: true, intervalSec: 3600,
    lastOkAt: ago(3), lastErrorAt: null, lastError: null, itemsTotal: 5, lastItems: 1, ok: true,
  },
  {
    id: "cert_fr", name: "CERT-FR", family: "cert_fr", url: "https://www.cert.ssi.gouv.fr/feed/",
    ...MOCK_MEASURE,
    kind: "narrative", format: "rss", enabled: true, intervalSec: 900,
    lastOkAt: ago(12), lastErrorAt: null, lastError: null, itemsTotal: 486, lastItems: 2, ok: true,
  },
  {
    id: "cisa_kev", name: "CISA KEV", family: "vuln", url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    ...MOCK_MEASURE,
    kind: "indicator", format: "json", enabled: true, intervalSec: 3600,
    lastOkAt: ago(48), lastErrorAt: null, lastError: null, itemsTotal: 1287, lastItems: 9, ok: true,
  },
  {
    id: "epss", name: "EPSS", family: "vuln", url: "https://api.first.org/data/v1/epss",
    ...MOCK_MEASURE,
    kind: "indicator", format: "json", enabled: true, intervalSec: 3600,
    lastOkAt: ago(31), lastErrorAt: null, lastError: null, itemsTotal: 5421, lastItems: 23, ok: true,
  },
  {
    id: "ransomlook", name: "Ransomlook", family: "ransomware", url: "https://www.ransomlook.io/feed",
    ...MOCK_MEASURE,
    kind: "narrative", format: "json", enabled: true, intervalSec: 1800,
    lastOkAt: ago(2880), lastErrorAt: ago(26), lastError: "HTTP 503 — service indisponible",
    itemsTotal: 93, lastItems: 0, ok: false,
  },
  {
    id: "hermes", name: "Hermès (flux régional)", family: "cti", url: "https://hermes.example.invalid/rss",
    ...MOCK_MEASURE,
    kind: "narrative", format: "rss", enabled: true, intervalSec: 3600,
    lastOkAt: null, lastErrorAt: null, lastError: null, itemsTotal: null, lastItems: null, ok: false,
  },
  {
    id: "typosquat", name: "Typosquatting NA", family: "typosquat", url: "https://typosquat.example.invalid/api",
    ...MOCK_MEASURE,
    kind: "indicator", format: "json", enabled: true, intervalSec: 1800,
    lastOkAt: ago(5), lastErrorAt: null, lastError: null, itemsTotal: 214, lastItems: 4, ok: true,
  },
  {
    id: "nvd", name: "NVD", family: "vuln", url: "https://services.nvd.nist.gov/json/cves/2.0",
    ...MOCK_MEASURE,
    kind: "indicator", format: "json", enabled: true, intervalSec: 7200,
    lastOkAt: ago(4320), lastErrorAt: ago(120), lastError: "délai d'attente dépassé après 30000 ms",
    itemsTotal: 80412, lastItems: 0, ok: false,
  },
  {
    id: "abuse_ch", name: "abuse.ch Feodo", family: "malware", url: "https://feodo-tracker.abuse.ch/downloads/hostlist/",
    ...MOCK_MEASURE,
    kind: "indicator", format: "json", enabled: true, intervalSec: 3600,
    lastOkAt: ago(72), lastErrorAt: null, lastError: null, itemsTotal: 3310, lastItems: 15, ok: true,
  },
  {
    id: "openphish", name: "OpenPhish", family: "phishing", url: "https://openphish.com/feed.txt",
    ...MOCK_MEASURE,
    kind: "indicator", format: "text", enabled: true, intervalSec: 3600,
    lastOkAt: ago(9), lastErrorAt: null, lastError: null, itemsTotal: 1204, lastItems: 6, ok: true,
  },
  {
    id: "regional_na", name: "Veille régionale NA (à activer)", family: "cert", url: "https://veille.example.invalid/rss",
    ...MOCK_MEASURE,
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
    { id: "dept:33", label: "Gironde", kind: "dept" },
    { id: "dept:64", label: "Pyrénées-Atlantiques", kind: "dept" },
    { id: "family:ransomware", label: "rançongiciel", kind: "family" },
    { id: "family:vuln", label: "vulnérabilité", kind: "family" },
    { id: "family:phishing", label: "hameçonnage", kind: "family" },
  ],
  links: [
    // Sans `rattache`, la matrice famille × département n'a pas de colonne :
    // la vue par défaut serait vide dans la démonstration.
    { source: "org:1", target: "dept:33", type: "rattache" },
    { source: "org:3", target: "dept:33", type: "rattache" },
    { source: "org:5", target: "dept:64", type: "rattache" },
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

/**
 * Fiche organisation simulée : construite à partir des données ci-dessus,
 * pour que la démonstration reste complète sans API (fiche, actifs,
 * exposition). Aucune donnée réelle, aucun appel réseau.
 */
export function mockOrgDetail(orgId: number): OrgDetail | null {
  const org = MOCK_ORGS.find((o) => o.id === orgId);
  if (!org) return null;
  const events = MOCK_EVENTS.filter((e) => e.orgId === orgId);
  const byFamily = [...events.reduce((m, e) => m.set(e.family, (m.get(e.family) ?? 0) + 1), new Map<string, number>())]
    .map(([family, n]) => ({ family, n }));
  const domain = `${org.slug}.example`;
  const months: { month: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now - i * 30 * 86_400_000);
    const month = d.toISOString().slice(0, 7);
    months.push({ month, count: events.filter((e) => (e.observedAt ?? "").startsWith(month)).length });
  }
  return {
    org,
    aliases: [...new Set([org.slug, org.name.toLowerCase()])].filter((a) => a !== org.name),
    domains: [...new Set([org.domain, domain, `www.${domain}`]
      .filter((v): v is string => typeof v === "string" && v.length > 0))],
    relatedOrgs: MOCK_ORGS
      .filter((o) => o.id !== orgId && (o.dept === org.dept || o.kind === org.kind))
      .slice(0, 3)
      .map((o) => ({ id: o.id, name: o.name, kind: o.kind, relation: "etablissement" as const })),
    sourceCount: new Set(events.map((e) => e.sourceId)).size,
    assets: {
      total: org.lat === null ? 0 : 3,
      byKind: [{ kind: "domain", n: 1 }, { kind: "subdomain", n: 2 }],
      recent: [
        { value: domain, kind: "domain", firstSeen: ago(60 * 24 * 30), source: "mock" },
        { value: `www.${domain}`, kind: "subdomain", firstSeen: ago(60 * 24 * 20), source: "mock" },
        { value: `vpn.${domain}`, kind: "subdomain", firstSeen: ago(60 * 24 * 12), source: "mock" },
      ],
    },
    // Démonstration : un historique court pour que la fiche montre des barres.
    historique: {
      premier: ago(60 * 24 * 300),
      dernier: events[0]?.observedAt ?? ago(60 * 24 * 3),
      faits: Math.max(1, byFamily.length),
      parMois: Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now - (11 - i) * 30 * 86_400_000);
        return { mois: d.toISOString().slice(0, 7), faits: i >= 9 ? 1 : 0 };
      }),
      tendance: "nouveau" as const,
      familles: byFamily.map((f) => ({ family: f.family, faits: f.n })),
      sources: [...new Set(events.map((e) => e.sourceId))],
    },
    // Démonstration : deux événements de la même famille et du même jour sont
    // un seul fait corroboré, pas deux faits.
    corroboration: {
      resume: {
        faits: Math.max(1, byFamily.length),
        evenements: events.length,
        sources: new Set(events.map((e) => e.sourceId)).size,
        corrobores: events.length > 1 ? 1 : 0,
        isoles: Math.max(0, byFamily.length - 1),
        desaccords: 0,
      },
      groupes: events.slice(0, 5).map((e, i) => ({
        cle: `${e.family}:${(e.observedAt ?? "").slice(0, 10)}:${i}`,
        family: e.family,
        orgId,
        titre: e.title,
        debut: e.observedAt ?? new Date(now).toISOString(),
        fin: e.observedAt ?? new Date(now).toISOString(),
        sourcesDistinctes: 1,
        force: "isole" as const,
        sources: [
          {
            sourceId: e.sourceId,
            premiereDate: e.observedAt ?? new Date(now).toISOString(),
            estPremier: true,
            delaiHeures: 0,
            evenements: 1,
            graviteMax: e.severity,
            assertion: e.assertionType,
          },
        ],
      })),
      desaccords: [],
    },
    events: { total: events.length, byFamily, recent: events },
    claims: { total: 0, recent: [] },
    exposure: months,
  };
}
