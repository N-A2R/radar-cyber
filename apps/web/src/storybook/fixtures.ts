/**
 * Synthetic fixtures shared by the Storybook catalog.
 *
 * Every record is invented for documentation: Nouvelle-Aquitaine departments
 * only, gray-listed sources are fine, and no victim-related personal data is
 * present. The base figures quoted in the report come from the live database,
 * not from these fixtures.
 */
import type {
  Alert,
  CollecteMetrics,
  CouvertureResponse,
  CorpusStats,
  HealthCauses,
  HealthDetail,
  JournalDecision,
  LiveAlert,
  NaFil,
  NaOverview,
  RectificationsOrg,
  TodayResponse,
} from "../api";
import { mockData, mockOrgDetail } from "../mock";

const at = "2026-11-21T09:00:00Z";

export const orgs = mockData.orgs;
export const events = mockData.events;
export const sources = mockData.sources;
export const stats = mockData.stats;
export const graph = mockData.graph;
export const health = mockData.health;
export const orgDetail = mockOrgDetail(1)!;
export const rectifications: RectificationsOrg = orgDetail.rectifications ?? { total: 0, items: [] };

export const today: TodayResponse = {
  compteurs: { evenements24h: 12, organisations7j: 8, derniereCollecte: at },
  evenements: mockData.events.slice(0, 3).map((event, index) => ({
    id: index + 1,
    titre: event.title,
    famille: event.family,
    severite: event.severity,
    date: event.observedAt,
    dateSource: "observee" as const,
    source: event.sourceId,
    url: event.sourceUrl,
    orgId: event.orgId,
    organisation: orgs.find((org) => org.id === event.orgId)?.name ?? null,
    dept: orgs.find((org) => org.id === event.orgId)?.dept ?? null,
  })),
};

export const departements = [
  { dept: "33", evenements: 6, organisations: 1 },
  { dept: "86", evenements: 3, organisations: 1 },
  { dept: "64", evenements: 2, organisations: 1 },
];

export const coverage: CouvertureResponse = {
  dateCalcul: "2026-11-21",
  hashCorpus: "fixture-storybook-na",
  fenetre: { debut: "2025-11-21", fin: "2026-11-21" },
  global: { vus: 18, total: 20, taux: 0.9 },
  parMotif: [
    { motif: "vu", incidents: 18, part: 0.9 },
    { motif: "pas_rattache", incidents: 2, part: 0.1 },
  ],
  parDepartement: [
    { departement: "33", vus: 9, total: 10, taux: 0.9 },
    { departement: "86", vus: 5, total: 6, taux: 0.83 },
    { departement: "64", vus: 4, total: 4, taux: 1 },
  ],
  parType: [
    { type: "sante", vus: 7, total: 7, taux: 1 },
    { type: "gouvernance", vus: 11, total: 13, taux: 0.85 },
  ],
  stale: false,
};

export const corpus: CorpusStats = {
  generatedAt: at,
  windowHours: 24,
  totals: { sources: 312, sourcesLocalised: 26, organisations: 1673151, incidents: 60 },
  families: ["ransomware", "vuln", "phishing"],
  byDepartment: [
    { department: "33", label: "Gironde", total: 8, families: { ransomware: 5, vuln: 3 } },
    { department: "86", label: "Vienne", total: 4, families: { phishing: 4 } },
  ],
  domainCoverage: { withDomain: 88, organisations: 1673151, percent: 0.01 },
  sinceLastReport: {
    windowHours: 24,
    newEvents: 12,
    previousEvents: 10,
    change: 2,
    percentChange: 20,
    comparedTo: "previous 24 h",
  },
  recentIncidents: mockData.events.slice(0, 3).map((event, index) => ({
    id: `fixture-${index}`,
    title: event.title,
    organisation: orgs.find((org) => org.id === event.orgId)?.name ?? null,
    department: orgs.find((org) => org.id === event.orgId)?.dept ?? null,
    date: event.observedAt,
    type: event.assertionType,
    family: event.family,
    sourceName: event.sourceId,
    sourceUrl: event.sourceUrl,
  })),
};

export const naOverview: NaOverview = {
  depts: [
    { dept: "33", orgs: 700000, orgsAvecEvenement: 12, evenements: 20 },
    { dept: "86", orgs: 200000, orgsAvecEvenement: 4, evenements: 6 },
  ],
  derniereCollecte: at,
  total: { orgs: 1673151, orgsAvecEvenement: 16, evenements: 26, deptsSansEvenement: [] },
};

export const naFil: NaFil = {
  dept: "33",
  events: mockData.events.slice(0, 3).map((event, index) => ({
    id: index + 1,
    title: event.title,
    family: event.family,
    observedAt: event.observedAt,
    collectedAt: at,
    source: event.sourceId,
    orgId: event.orgId ?? 1,
    orgName: orgs.find((org) => org.id === event.orgId)?.name ?? "Regional organisation",
  })),
};

export const healthDetail: HealthDetail = {
  ok: false,
  generatedAt: at,
  windowDays: 7,
  sources: {
    declared: 312,
    enabled: 11,
    actives7j: 9,
    muettes7j: 2,
  },
  events24h: 12,
  orgs7j: 8,
  queues: { pending: 14, reviewed: 90, promoted: 31 },
  families: ["ransomware", "vuln", "phishing"].map((family) => ({
    family,
    lastEventAt: at,
    ageHours: 3,
    ageDays: 0,
    tone: "green" as const,
  })),
};

export const healthCauses: HealthCauses = {
  ok: true,
  generatedAt: at,
  rouges: 2,
  sansTrace: 1,
  stockage: {
    causeStockee: false,
    explication: "No stored cause for this run.",
    champPropose: { table: "source_run", colonne: "cause", definition: "Failure reason" },
  },
  causes: [
    {
      code: "404",
      libelle: "Not found",
      sources: 1,
      exemples: [{ source: "regional_na", detail: "Fixture feed returned 404" }],
      origine: "message_erreur",
      regle: "HTTP 404 on the last run",
    },
  ],
};

export const collecte: CollecteMetrics = {
  generatedAt: at,
  fenetreHeures: 24,
  resume: {
    cycles: 24,
    cyclesEchoues: 1,
    dureeMoyenneMs: 4200,
    dureeMaxMs: 9100,
    sourcesOk: 10,
    sourcesError: 1,
    itemsIn: 3200,
    itemsNew: 26,
    memoireMaxOctets: 134000000,
  },
  cycles: [
    {
      id: 1,
      startedAt: at,
      finishedAt: "2026-11-21T09:00:04Z",
      dureeMs: 4200,
      statut: "ok",
      sourcesOk: 10,
      sourcesError: 0,
      itemsIn: 180,
      itemsNew: 3,
      memoireRssOctets: 120000000,
      memoireHeapOctets: 45000000,
      memoireDeltaOctets: 1200000,
      erreur: null,
    },
  ],
  alertes: [
    {
      id: 1,
      ruleId: "collecte.sources-rouges",
      titre: "One source is red",
      severite: 3,
      statut: "open",
      sourceId: "regional_na",
      cycleId: 1,
      createdAt: at,
    },
  ],
};

export const alerts: Alert[] = [
  {
    id: 1,
    rule_id: "ransomware.claim",
    title: "Regional claim awaiting review",
    severity: 4,
    status: "open",
    event_id: 1,
    indicator_id: null,
    org_id: 1,
    evidence: null,
    scope: "organization_incident",
    created_at: at,
    updated_at: at,
    acked_at: null,
    acked_by: null,
    event_title: mockData.events[0]!.title,
    event_family: "ransomware",
    indicator_type: null,
    indicator_value: null,
    org_name: orgs[0]!.name,
  },
];

export const liveAlerts: LiveAlert[] = alerts.map((alert) => ({
  id: alert.id,
  rule_id: alert.rule_id,
  title: alert.title,
  severity: alert.severity,
  status: alert.status,
  event_id: alert.event_id,
  indicator_id: alert.indicator_id,
  org_id: alert.org_id,
  scope: alert.scope ?? null,
  created_at: alert.created_at,
}));

export const journalRows: JournalDecision[] = [
  {
    id: 1,
    kind: "review.decided",
    sujet: "Fixture claim",
    acteur: "moteur:triage",
    horodatage: at,
    decision: "accepter",
    indice: "Regional organisation",
    raison: "Corroborated by two synthetic sources",
    resume: "Fixture decision for the design system",
    preuve: { source: "mock", family: "ransomware" },
  },
];

export const orgsLiees = {
  semaine: 45,
  total: 312,
  enAttente: 18,
  examinees: 294,
  parDepartement: [
    { dept: "33", n: 140 },
    { dept: "86", n: 42 },
  ],
};

export const historiqueLiees = [
  { jour: "2026-11-18", semaine: 47, total: 300, enAttente: 20, examinees: 280 },
  { jour: "2026-11-19", semaine: 46, total: 306, enAttente: 19, examinees: 287 },
  { jour: "2026-11-20", semaine: 45, total: 310, enAttente: 18, examinees: 292 },
];
