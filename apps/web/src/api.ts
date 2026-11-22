const BASE = "/api";

/** Clé de stockage du jeton de session. */
const TOKEN_KEY = "radar_token";

export function getAuthToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function authHeaders(): HeadersInit {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Erreur d'API portant le code HTTP, pour distinguer 401 de 500 dans l'UI. */
export type ApiError = Error & { status?: number };

function apiError(path: string, status: number): ApiError {
  const err = new Error(`${path} → ${status}`) as ApiError;
  err.status = status;
  return err;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(BASE + path, { headers: authHeaders(), signal });
  if (!res.ok) throw apiError(path, res.status);
  return res.json() as Promise<T>;
}

/** POST authentifié (ack / resolve) : le token est relu à chaque appel. */
async function post<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: "POST", headers: authHeaders() });
  if (!res.ok) throw apiError(path, res.status);
  return res.json() as Promise<T>;
}

/** POST avec corps JSON ; le jeton est joint quand il existe (login : aucun). */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw apiError(path, res.status);
  return res.json() as Promise<T>;
}

/** Utilisateur renvoyé par `POST /auth/login`. */
export type AuthUser = {
  id: number;
  email: string;
  role: string;
  displayName: string | null;
};

/** Réponse de `POST /auth/login`. */
export type LoginResponse = { token: string; user: AuthUser };

/** Mémorise le jeton de session (même clé que `getAuthToken`). */
export function setAuthToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* stockage indisponible */ }
}

/** Oublie le jeton de session. */
export function clearAuthToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* stockage indisponible */ }
}

export type Org = {
  id: number;
  name: string;
  slug: string;
  kind: string;
  sector: string | null;
  city: string | null;
  dept: string | null;
  /** Domaine officiel, quand il est connu : sert de lien de vérification. */
  domain?: string | null;
  lat: number | null;
  lon: number | null;
  eventCount: number;
};

export type Event = {
  id: string;
  dedupKey: string;
  family: string;
  assertionType: string;
  title: string;
  summary: string | null;
  observedAt: string | null;
  severity: number;
  confidence: string | null;
  sourceId: string;
  sourceUrl: string | null;
  evidence?: unknown;
  geoType: string;
  lat: number | null;
  lon: number | null;
  orgId: number | null;
  /** Vrai si l'événement touche une organisation ou une entité de la région. */
  regional: boolean;
  /**
   * Quand cela s'est passé, et à quel point on le sait. Séparé de la confiance
   * à dessein : un fait peut être récent et incertain, ou ancien et certain.
   */
  fraicheur?: Fraicheur;
  /** À quel point on peut y croire, et pourquoi. */
  confiance?: Confiance;
};

/** Précision de la date : publiée par la source, déduite du texte, ou collecte. */
export type PrecisionDate = "certaine" | "deduite" | "collecte";

export type Fraicheur = {
  ageJours: number | null;
  precision: PrecisionDate;
  classe: "frais" | "recent" | "ancien" | "inconnu";
  /** Phrase courte : « il y a 3 j », « aujourd'hui · date de collecte ». */
  libelle: string;
};

export type Confiance = {
  note: number;
  niveau: "etabli" | "plausible" | "fragile";
  raisons: string[];
  sourcesDistinctes: number;
  libelle: string;
};

export type Source = {
  id: string;
  name: string;
  family: string;
  url: string;
  kind: "narrative" | "indicator";
  format: string;
  enabled: boolean;
  intervalSec: number;
  lastOkAt: string | null;
  /** Dernier fait produit (ISO) ; absent sur un serveur antérieur à ce champ. */
  lastEventAt?: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  itemsTotal: number | null;
  lastItems: number | null;
  ok: boolean;
  /** Désactivation : datée et motivée, ou jamais désactivée. */
  disabledAt: string | null;
  disabledReason: string | null;
  /** Entrées lues par le collecteur sur 30 jours ; `null` = aucune mesure. */
  entrees: number | null;
  /** Entrées écartées par la porte ou le contrat, sur 30 jours. */
  rejets: number | null;
  /** Événements attribués à la source sur 30 jours. */
  evenements30j: number;
  /** Événements attribués à la source, tout l'historique. */
  evenementsTotal: number;
  /** Dernier passage du collecteur, quel qu'en soit le résultat. */
  dernierRun: string | null;
  dernierRunStatut: string | null;
  /** Part des entrées lues devenues un événement ; `null` = jamais mesuré. */
  rendement: number | null;
  /** Motifs de rejet agrégés du dernier run : `{ hors_sujet: 34, presse: 6 }`. */
  motifs: Record<string, number> | null;
  /** Motif qui coûte le plus d'entrées — celui qui explique le silence. */
  motifDominant: string | null;
  /** Faits distincts où la source apparaît (180 j, organisations rattachées). */
  faits?: number;
  /** Faits où elle est la seule à parler : sa contribution propre. */
  faitsUniques?: number;
  /** Part de ses faits qu'elle porte seule, en pourcentage. */
  partUniquesPct?: number;
  /** Heures médianes d'arrivée après le premier signalement. */
  retardMedianHeures?: number | null;
  /** Faits où elle a parlé la première. */
  primeurs?: number;
};

/**
 * Ce que vaut une source, au-delà de « elle répond ».
 *
 * - `productive` : elle a rendu au moins un événement sur la fenêtre ;
 * - `vide`       : elle lit des entrées et n'en retient aucune — la porte ou
 *                  le parseur est en cause, pas la source ;
 * - `muette`     : elle est passée au collecteur sans rien lire ;
 * - `inconnue`   : aucun passage mesurable. À ne surtout pas lire comme « nulle ».
 */
export type SourceYield = "productive" | "vide" | "muette" | "inconnue";

export function sourceYield(source: Pick<Source, "entrees" | "evenements30j" | "evenementsTotal" | "lastOkAt" | "dernierRun">): SourceYield {
  if (source.evenements30j > 0) return "productive";
  if (source.entrees !== null && source.entrees > 0) return "vide";
  if (source.dernierRun !== null) return "muette";
  if (source.evenementsTotal > 0) return "inconnue";
  return source.lastOkAt ? "muette" : "inconnue";
}

/**
 * Traduction des motifs de rejet du collecteur.
 *
 * Le motif brut est technique (`contrat:famille-inconnue`, `hors_sujet`) : sur
 * un écran, il doit dire ce qu'il coûte. Un motif inconnu est affiché tel quel,
 * en dernier recours — mieux vaut un mot bizarre qu'un silence.
 */
export const MOTIF_LABEL: Record<string, string> = {
  hors_sujet: "hors sujet (porte de pertinence)",
  presse: "non cyber (classé presse)",
  menu_path: "entrée de menu (lien de navigation)",
  menu_token: "entrée de menu (libellé seul)",
  menu_source: "entrée de menu (nom de la source)",
  warninglist: "indicateur légitime (warninglist)",
  non_actionnable: "indicateur non actionnable pour nos actifs",
  doublon: "doublon dans le même flux",
};

/** Libellé lisible d'un motif de rejet. Tolère l'absence : un serveur plus
 * ancien ne renvoie pas ce champ, et l'écran doit rester lisible. */
export function motifLabel(motif: string | null | undefined): string {
  if (typeof motif !== "string" || motif === "") return "non mesuré";
  if (motif.startsWith("contrat:")) return `refusé par le contrat (${motif.slice(8)})`;
  return MOTIF_LABEL[motif] ?? motif;
}

/** État de santé d'une source, dérivé de ses dates de succès et d'erreur. */
export type SourceStatus = "ok" | "error" | "pending";

/**
 * Détermine l'état d'une source :
 * - "error"   : une erreur est renseignée (la plus récente) ;
 * - "pending" : jamais collectée (ni succès ni erreur) ;
 * - "ok"      : un succès sans erreur.
 */
export function sourceStatus(source: Pick<Source, "lastOkAt" | "lastErrorAt">): SourceStatus {
  if (source.lastErrorAt) return "error";
  if (source.lastOkAt) return "ok";
  return "pending";
}

/** Vue Nouvelle-Aquitaine : agrégats par département (GET /api/na/overview). */
export type NaOverview = {
	depts: { dept: string; orgs: number; orgsAvecEvenement: number; evenements: number }[];
	/** Dernier passage de collecte (ISO) — « il y a X » se calcule côté client. */
	derniereCollecte: string | null;
	total: { orgs: number; orgsAvecEvenement: number; evenements: number; deptsSansEvenement: string[] };
};

/** Une ligne du fil d'événements d'un département (GET /api/na/events?dept=NN). */
export type NaEvenement = {
	id: number;
	title: string;
	family: string;
	observedAt: string | null;
	collectedAt: string;
	source: string;
	orgId: number;
	orgName: string;
};

export type NaFil = {
	dept: string;
	events: NaEvenement[];
};

export type Stats = {
  orgs: number;
  events: number;
  indicators: number;
  sources: { total: number; active: number; ok: number; err: number };
  byFamily: { family: string; n: number }[];
  byAssertion: { assertion_type: string; n: number }[];
};

/** Ligne de l'écran « Aujourd'hui » (GET /api/today). */
export type TodayEvent = {
  id: number | string;
  titre: string;
  famille: string;
  severite: number;
  date: string | null;
  dateSource: "observee" | "collecte";
  source: string;
  url: string | null;
  orgId: number | null;
  organisation: string | null;
  dept: string | null;
};

/** Compteurs et fil de GET /api/today : une seule vérité, côté serveur. */
export type TodayResponse = {
  compteurs: {
    evenements24h: number;
    organisations7j: number;
    derniereCollecte: string | null;
  };
  evenements: TodayEvent[];
};

/** Département du fil « Aujourd'hui » (GET /api/today/departements). */
export type DeptStat = { dept: string; evenements: number; organisations: number };

/** Réponse de GET /api/today/departements : un département = un filtre utile. */
export type StatsDepartements = { departements: DeptStat[] };

/** Response of GET /api/couverture: a frozen measurement and its breakdowns. */
export type CouverturePublique = {
  dateCalcul: string;
  hashCorpus: string;
  fenetre: { debut: string; fin: string };
  global: CouvertureLigne;
  parMotif: Array<{ motif: string; incidents: number; part: number }>;
  parDepartement: Array<CouvertureLigne & { departement: string }>;
  parSecteur: Array<CouvertureLigne & { secteur: string }>;
};

/** Une ligne de barre empilée : un département, réparti par famille. */
export type CorpusDepartment = {
  /** Code INSEE, ou "" pour les sources sans département inférable. */
  department: string;
  label: string;
  total: number;
  families: Record<string, number>;
};
export type CorpusIncident = {
  id: string;
  title: string;
  organisation: string | null;
  department: string | null;
  date: string | null;
  type: string;
  family: string;
  sourceName: string;
  sourceUrl: string | null;
};

/** Réponse de GET /api/corpus/stats : un seul appel pour tout l'écran Corpus. */
export type CorpusStats = {
  generatedAt: string;
  windowHours: number;
  totals: { sources: number; sourcesLocalised: number; organisations: number; incidents: number };
  families: string[];
  byDepartment: CorpusDepartment[];
  domainCoverage: { withDomain: number; organisations: number; percent: number | null };
  /** Croissance des événements ingérés sur 24 h vs les 24 h précédentes. */
  sinceLastReport: {
    windowHours: number;
    newEvents: number;
    previousEvents: number;
    change: number;
    percentChange: number | null;
    comparedTo: string;
  };
  recentIncidents: CorpusIncident[];
};

/** Privacy-safe projection of GET /api/press-only/incidents. */
export type PressOnlySummary = {
  scope: "Nouvelle-Aquitaine";
  definition: "rapporte";
  corpusTotal: number;
  count: number;
  withGreySource: number;
  byDepartment: { department: string; count: number }[];
  byPublisherKind: { press: number; grey: number };
  incidents: {
    id: string;
    department: string;
    publicationDate: string | null;
    publisherKind: "press" | "grey" | "official" | "unknown";
    incidentType: string | null;
  }[];
};

/** Privacy-safe projection of GET /api/unconfirmed-claims/incidents. */
export type UnconfirmedClaimsSummary = {
  scope: "Nouvelle-Aquitaine";
  definition: "declare";
  corpusTotal: number;
  count: number;
  withGreySource: number;
  byDepartment: { department: string; count: number }[];
  byPublisherKind: { press: number; grey: number; unknown: number };
  incidents: {
    id: string;
    department: string;
    publicationDate: string | null;
    publisherKind: "press" | "grey" | "official" | "unknown";
    incidentType: string | null;
  }[];
};

/** Privacy-safe projection of GET /api/confirmed-incidents/incidents. */
export type ConfirmedIncidentsSummary = {
  scope: "Nouvelle-Aquitaine";
  definition: "etabli";
  corpusTotal: number;
  count: number;
  withGreySource: number;
  byDepartment: { department: string; count: number }[];
  byPublisherKind: { press: number; grey: number; official: number; unknown: number };
  incidents: {
    id: string;
    department: string;
    publicationDate: string | null;
    publisherKind: "press" | "grey" | "official" | "unknown";
    incidentType: string | null;
  }[];
};

/** Nature d'un nœud du graphe relationnel (GET /api/graph). */
export type GraphNodeKind =
  | "org"
  | "event"
  | "source"
  | "family"
  | "dept"
  | "group"
  | "asset"
  | "ip";

/**
 * Nœud du graphe. Les champs optionnels sont portés par l'API quand ils sont
 * mesurés en base (jamais inférés par correspondance de texte).
 */
export type GraphNode = {
  id: string;
  label: string;
  kind: GraphNodeKind | string;
  family?: string;
  severity?: number;
  observedAt?: string | null;
  sourceId?: string;
  sourceUrl?: string | null;
  assertionType?: string;
  orgKind?: string;
  city?: string | null;
  dept?: string | null;
  url?: string | null;
  /** Période de validité portée par GET /api/graph/temporal. */
  validFrom?: string;
  validTo?: string | null;
};

/** Types de liens : structurelle (`rattache`), rattachement mesuré
 *  (`has_event`, `targeted_by`, `reported_by`) ou relation enregistrée
 *  (`exploits`, `uses_infra`, `owned_by`, …). */
export type GraphLink = {
  source: string;
  target: string;
  type: string;
  validFrom?: string;
  validTo?: string | null;
};

export type Graph = { nodes: GraphNode[]; links: GraphLink[] };

/** Réponse de GET /api/health : vitalité du backend et id des sources connues. */
export type Health = {
  ok: boolean;
  sources: string[];
};

/** Réponse de GET /api/health/detail : état du système en une requête. */
export type HealthDetail = {
  ok: boolean;
  generatedAt: string;
  windowDays: 7;
  sources: {
    declared: number;
    enabled: number;
    actives7j: number;
    muettes7j: number;
    bySource: {
      id: string;
      name: string;
      family: string;
      enabled: boolean;
      lastCollectedAt: string | null;
      lastEventAt: string | null;
      ageHours: number | null;
      tone: "green" | "orange" | "red";
    }[];
  };
  events24h: number;
  orgs7j: number;
  queues: { pending: number; reviewed: number; promoted: number };
  families: {
    family: string;
    lastEventAt: string | null;
    ageHours: number | null;
    ageDays: number | null;
    tone: "green" | "orange" | "red";
  }[];
};

/** Réponse de GET /api/health/causes : répartition réelle des causes de rougeur. */
export type HealthCauses = {
  ok: true;
  generatedAt: string;
  rouges: number;
  sansTrace: number;
  stockage: {
    causeStockee: boolean;
    explication: string;
    champPropose: { table: string; colonne: string; definition: string };
  };
  causes: {
    code: "404" | "403" | "5xx" | "timeout" | "parse" | "vide";
    libelle: string;
    sources: number;
    exemples: { source: string; detail: string }[];
    origine: "message_erreur" | "compteur_run";
    regle: string;
  }[];
};

/** Réponse de GET /api/collecte/metrics : supervision des cycles de collecte. */
export type CollecteResume = {
  cycles: number;
  cyclesEchoues: number;
  dureeMoyenneMs: number;
  dureeMaxMs: number;
  sourcesOk: number;
  sourcesError: number;
  itemsIn: number;
  itemsNew: number;
  memoireMaxOctets: number;
};

export type CycleCollecte = {
  id: number;
  startedAt: string;
  finishedAt: string;
  dureeMs: number;
  statut: "ok" | "degraded" | "error";
  sourcesOk: number;
  sourcesError: number;
  itemsIn: number;
  itemsNew: number;
  memoireRssOctets: number;
  memoireHeapOctets: number;
  memoireDeltaOctets: number;
  erreur: string | null;
};

export type AlerteSupervision = {
  id: number;
  ruleId: string;
  titre: string;
  severite: number;
  statut: string;
  sourceId: string | null;
  cycleId: number | null;
  createdAt: string;
};

export type CollecteMetrics = {
  generatedAt: string;
  fenetreHeures: 24;
  resume: CollecteResume;
  cycles: CycleCollecte[];
  alertes: AlerteSupervision[];
};

/** Arc géographique pour la carte 3D (GET /api/flows). */
export type FlowArc = {
  id: string;
  from: { lat: number; lon: number; label: string };
  to: { lat: number; lon: number; label: string };
  family: string;
  severity: number;
  observedAt: string | null;
  title: string;
  sourceUrl: string | null;
};

/** Réponse de GET /api/flows. */
export type Flows = {
  arcs: FlowArc[];
  total: number;
  truncated: boolean;
};

export type AlertStatus = "open" | "ack" | "resolved";

/** Note de confiance d'une alerte (roadmap phase 2), calculée côté API. */
export type AlertConfidence = {
  score: number;
  status: "verifie" | "a_verifier";
  components: {
    source_reliability: number;
    assertion_strength: number;
    attachment_quality: number;
    corroboration: number;
  };
};

/** Ligne de `GET /api/alerts` : alerte + jointures événement / indicateur / org. */
export type Alert = {
  id: number;
  rule_id: string;
  title: string;
  severity: number;
  status: AlertStatus;
  event_id: number | null;
  indicator_id: number | null;
  org_id: number | null;
  evidence: unknown;
  scope?: "organization_incident" | "regional_advisory";
  confidence?: AlertConfidence;
  created_at: string;
  updated_at: string;
  acked_at: string | null;
  acked_by: number | null;
  event_title: string | null;
  event_family: string | null;
  indicator_type: string | null;
  indicator_value: string | null;
  org_name: string | null;
};

/** Ligne de `GET /api/alerts/stats` : une entrée par couple statut × sévérité. */
export type AlertStatRow = {
  status: AlertStatus;
  severity: number;
  count: string;
};

export type AlertQuery = {
  status?: AlertStatus;
  severity?: number;
  limit?: number;
};

/** Branches enrichies d'un indicateur (whois, DNS, certificats, réputation…). */
export type Enrichment = {
  errors: string[];
  domain?: {
    registrar?: string;
    created?: string;
    expires?: string;
    updated?: string;
    nameServers?: string[];
    status?: string[];
  } | null;
  dns?: { a?: string[]; aaaa?: string[] } | null;
  certs?: { name: string; issuer: string; notBefore: string; notAfter: string }[] | null;
  reverse?: string[] | null;
  reputation?: unknown;
};

/** Réponse de `GET /api/enrich/indicator/:id`. */
export type IndicatorEnrichment = {
  indicator: {
    id: string;
    type: string;
    value: string;
    confidence?: string | null;
    first_seen?: string | null;
    source_id?: string;
  } | null;
  enrichment: Enrichment;
  score: number;
  error?: string;
};

/** Événement brut tel que renvoyé par `GET /api/enrich/events/:id`. */
export type EnrichedEvent = {
  id: string;
  dedup_key: string;
  family: string;
  assertion_type: string;
  title: string;
  summary: string | null;
  observed_at: string | null;
  collected_at: string | null;
  severity: number;
  confidence: string | null;
  source_id: string;
  source_url: string | null;
  evidence?: unknown;
  geo_type: string;
  lat: number | null;
  lon: number | null;
  org_id: number | null;
  fraicheur?: Fraicheur;
  confiance?: Confiance;
};

/**
 * Pourquoi l'événement a été rattaché à cette organisation — ou pas.
 *
 * `motif` est la valeur brute du moteur, `libelle` sa traduction. On garde les
 * deux : le libellé change avec la langue de l'interface, le motif se rejoue.
 * `indecis` est vrai quand le moteur n'a pas pu essayer (référentiel
 * indisponible) : l'absence de rattachement n'est alors pas un verdict.
 */
export type RattachementExplication = {
  motif: string;
  libelle: string;
  alias: string | null;
  confiance: number;
  moteur: string;
  candidats: { id: number; name: string }[];
  indecis: boolean;
};

/** Réponse de `GET /api/enrich/events/:id`. */
export type EventEnrichment = {
  event: EnrichedEvent | null;
  indicators: { id: string; type: string; value: string }[];
  org: Org | null;
  enrichment: Enrichment | null;
  /** Absent des événements ingérés avant que le pourquoi soit conservé. */
  rattachement?: RattachementExplication | null;
  error?: string;
};

/** Actif (domaine, sous-domaine, IP…) rattaché à une organisation. */
export type OrgAsset = {
  value: string;
  kind: string;
  /** Première observation renvoyée par GET /api/orgs/:id (champ SQL first_seen). */
  firstSeen: string | null;
  source: string | null;
};

/** Compteur d'actifs par type. */
export type OrgAssetKind = { kind: string; n: number };

/** Compteur d'événements par famille. */
export type OrgEventFamily = { family: string; n: number };

/** Revendication (ligne de quarantaine) rattachée à une organisation. */
export type OrgClaim = {
  id: number;
  source: string;
  orgHint: string | null;
  groupe: string | null;
  tlp: string;
  claimedAt: string | null;
};

/** Point de la courbe d'exposition : un mois et son nombre d'événements. */
export type OrgExposurePoint = { month: string; count: number };

/** Organisation reliée à la fiche par un rattachement hiérarchique. */
export type OrgLien = {
  id: number;
  name: string;
  kind: string;
  relation: "mere" | "etablissement";
};

/** Ligne d'événement telle que renvoyée par la fiche (20 plus récents). */
export type OrgEventRecent = {
  id: string;
  title: string;
  family: string;
  severity: number;
  observedAt: string | null;
};

/** Réponse de `GET /api/orgs/:id` : fiche complète d'une organisation. */
/** Une source qui a parlé d'un fait, et quand. */
export type SourceGroupe = {
  sourceId: string;
  premiereDate: string;
  /** Vrai pour la source qui a révélé le fait. */
  estPremier: boolean;
  /** Heures après le premier signalement. */
  delaiHeures: number;
  evenements: number;
  /** `null` = la source ne se prononce pas sur la gravité. */
  graviteMax: number | null;
  assertion: string;
};

/** Un fait, reconstitué à partir de plusieurs lignes d'événements. */
export type FaitGroupe = {
  cle: string;
  family: string;
  orgId: number | null;
  titre: string;
  debut: string;
  fin: string;
  sources: SourceGroupe[];
  sourcesDistinctes: number;
  force: "isole" | "corrobore" | "etabli";
};

/** Deux sources qui ne disent pas la même chose du même fait. */
export type Desaccord = {
  cle: string;
  orgId: number | null;
  family: string;
  objet: "gravite" | "nature";
  description: string;
  positions: { sourceId: string; valeur: string }[];
};

export type Historique = {
  premier: string | null;
  dernier: string | null;
  faits: number;
  parMois: { mois: string; faits: number }[];
  tendance: "nouveau" | "en hausse" | "stable" | "en baisse" | "ancien";
  familles: { family: string; faits: number }[];
  sources: string[];
};

export type Corroboration = {
  resume: {
    faits: number;
    evenements: number;
    sources: number;
    corrobores: number;
    isoles: number;
    desaccords: number;
  };
  groupes: FaitGroupe[];
  desaccords: Desaccord[];
};

export type OrgDetail = {
  org: Org;
  /** Noms alternatifs actifs (table org_alias). */
  aliases: string[];
  /** Domaines et sous-domaines connus, dédupliqués. */
  domains: string[];
  /** Organisations mère / établissements rattachés. */
  relatedOrgs: OrgLien[];
  /** Nombre de sources distinctes ayant produit un événement rattaché. */
  sourceCount: number;
  assets: { total: number; byKind: OrgAssetKind[]; recent: OrgAsset[] };
  events: { total: number; byFamily: OrgEventFamily[]; recent: OrgEventRecent[] };
  claims: { total: number; recent: OrgClaim[] };
  exposure: OrgExposurePoint[];
  /** Absent des serveurs antérieurs à l'analyse multi-sources. */
  corroboration?: Corroboration;
  /** Absent des serveurs antérieurs au profil historique. */
  historique?: Historique;
  /** Réponses publiées au titre du droit de réponse (serveur récent). */
  rectifications?: RectificationsOrg;
};

/** Motif d'une demande de rectification (droit de réponse, RGPD). */
export type MotifRectification = "inexactitude" | "omission" | "suppression" | "autre";

/** Réponse publiée, affichée sur la fiche de l'organisation. */
export type RectificationPubliee = {
  id: number;
  reference: string;
  organisation: string;
  motif: MotifRectification;
  message: string;
  publishedAt: string | null;
  decisionMotif: string | null;
};

export type RectificationsOrg = { total: number; items: RectificationPubliee[] };

/** Corps envoyé par une organisation nommée pour demander une rectification. */
export type DemandeRectification = {
  orgId: number;
  organisation: string;
  contactNom?: string;
  email: string;
  domaine?: string;
  motif: MotifRectification;
  message: string;
  pieceJointeRef?: string;
};

export type AccuseRectification = {
  id: number;
  reference: string;
  statut: string;
  createdAt: string;
  prochaineEtape: string;
};

/** Alerte poussée par le flux SSE (`event: alert`). */
export type LiveAlert = {
  id: number;
  rule_id: string;
  title: string;
  severity: number;
  status: string;
  event_id: number | null;
  indicator_id: number | null;
  org_id: number | null;
  scope: string | null;
  created_at: string;
};

/** Réponse de `GET /api/search` : trois natures, plafonnées à 20 chacune. */
export type SearchResponse = {
  orgs: Array<Pick<Org, "id" | "name" | "slug" | "kind" | "city" | "dept"> & { domain: string | null }>;
  events: Event[];
  indicators: Array<{
    id: number;
    type: string;
    value: string;
    firstSeen: string | null;
    lastSeen: string | null;
    tlp: string;
    confidence: string | null;
    sourceId: string;
  }>;
};

/** Une facette : valeur et nombre d'organisations, hors filtre de sa dimension. */
export type DirectoryFacet = { value: string; count: number };

export type DirectoryQuery = {
  q?: string;
  kind?: string | null;
  sector?: string | null;
  dept?: string | null;
  withEvents?: boolean;
  withoutEvents?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
};

/** Une ligne d'annuaire, avec la trace de la correspondance quand on cherche. */
export type DirectoryRow = Org & {
  /** Identifiant officiel (FINESS, UAI, SIREN) et sa source. */
  entityCode?: string | null;
  entitySource?: string | null;
  website?: string | null;
  domain?: string | null;
  score?: number;
  reason?: "exact-code" | "exact" | "exact-alias" | "prefix" | "prefix-alias" | "tokens" | "substring" | "fuzzy";
  matchedAlias?: string | null;
};

export type DirectoryResponse = {
  rows: DirectoryRow[];
  total: number;
  page: number;
  limit: number;
  facets: { kind: DirectoryFacet[]; sector: DirectoryFacet[]; dept: DirectoryFacet[] };
  /** Présélection plafonnée : totaux et facettes approchés, l'UI doit le dire. */
  truncated: boolean;
  tookMs: number;
};

/** Un fait de quarantaine, priorisé, avec la trace de son score. */
export type ReviewRow = {
  id: number;
  source: string;
  sourceUrl: string;
  groupe: string | null;
  orgHint: string | null;
  claimedAt: string | null;
  receivedAt: string;
  tlp: string;
  status: string;
  promoted: boolean;
  promotedBy: string | null;
  promotedAt: string | null;
  hasDescription: boolean;
  triage: {
    score: number;
    bucket: "chaud" | "tiede" | "froid";
    suggested: "promote" | "review" | "reject";
    reasons: Array<{ label: string; weight: number }>;
    declaredCountry: string | null;
    domainOnly: boolean;
    disagreement: boolean;
    referentialGap: boolean;
  };
  org: { id: number; name: string; kind: string; city: string | null } | null;
  orgConfidence: number | null;
  review: Array<{ at: string; by: string; action: string; reason: string | null }>;
};

export type ReviewQueueResponse = {
  rows: ReviewRow[];
  total: number;
  page: number;
  limit: number;
  window: number;
  truncated: boolean;
  facets: {
    source: DirectoryFacet[];
    groupe: DirectoryFacet[];
    bucket: DirectoryFacet[];
    status: DirectoryFacet[];
  };
  counts: { pending: number; reviewed: number; rejected: number; promoted: number };
  tookMs: number;
};

/** One auditable entry: every journal kind, with its proof (raw payload). */
export type JournalDecision = {
  id: number;
  /** Exact journal kind: review.decided, org.created, org.changed, alert.changed… */
  kind: string;
  sujet: string;
  /** Raw author from the journal: `humain:email`, `moteur:triage`… */
  acteur: string;
  /** Recording timestamp (recorded_at), ISO or PostgreSQL text. */
  horodatage: string;
  decision: "accepter" | "refuser" | "creer" | null;
  /** Claim hint, or the subject when there is none. */
  indice: string | null;
  raison: string | null;
  /** Human-readable summary written at the time of the fact. */
  resume: string | null;
  /** Raw payload: the evidence and context of the entry. */
  preuve: Record<string, unknown>;
};

export type JournalReviewParams = {
  limite?: number;
  avant?: number | null;
  /** "all" (default), "review", "publication", "correction" or an exact kind. */
  kind?: string;
  actor?: string;
  q?: string;
  du?: string;
  au?: string;
};

type JournalReviewResponseRaw = {
  rows: JournalDecision[];
  limite: number;
  /** Next-page cursor; null = last page. */
  avant: number | null;
};

export type JournalReviewResponse = {
  rows: JournalDecision[];
  limite: number;
  /** Next-page cursor; null = last page. */
  avant: number | null;
};

export type ReviewAction = "promote" | "reject" | "review" | "undo";

export type ReviewOutcome = {
  action: ReviewAction;
  requested: number;
  changed: number;
  promoted: number;
  alerts: number;
  skipped: Array<{ id: number; reason: string }>;
};

/** Ligne de décomposition de la couverture : vus / total, taux en pourcentage. */
export type CouvertureLigne = { vus: number; total: number; taux: number };

/** Réponse de GET /api/couverture : mesure publiée, jamais recalculée côté client. */
export type CouvertureResponse = {
  dateCalcul: string;
  hashCorpus: string;
  fenetre: { debut: string; fin: string };
  global: CouvertureLigne;
  parMotif: Array<{ motif: string; incidents: number; part: number }>;
  parDepartement: Array<CouvertureLigne & { departement: string }>;
  parSecteur: Array<CouvertureLigne & { secteur: string }>;
  parMois: Array<CouvertureLigne & { mois: string }>;
  /** Vrai quand le hash servi diverge de la référence : chiffre non publiable. */
  stale: boolean;
};
/** Query string shared by the JSON journal and its CSV export. */
function journalQuery(params: JournalReviewParams, withCursor = true): string {
  const qs = new URLSearchParams();
  if (withCursor && params.limite !== undefined) qs.set("limite", String(params.limite));
  if (withCursor && params.avant !== undefined && params.avant !== null) qs.set("avant", String(params.avant));
  if (params.kind && params.kind !== "all") qs.set("kind", params.kind);
  if (params.actor) qs.set("acteur", params.actor);
  if (params.q) qs.set("q", params.q);
  if (params.du) qs.set("du", params.du);
  if (params.au) qs.set("au", params.au);
  return qs.toString();
}

export const api = {
  login: (email: string, password: string) => postJson<LoginResponse>("/auth/login", { email, password }),
  /** Relance manuelle d'une collecte : le serveur répond avant la fin du run. */
  collecte: (sourceId: string) => post<{ id: string; lancee: true }>(`/sources/${encodeURIComponent(sourceId)}/collecte`),
  logout: () => post<{ ok: boolean }>("/auth/logout"),
  orgs: (asOf?: string) => get<Org[]>(asOf ? `/orgs?asOf=${encodeURIComponent(asOf)}` : "/orgs"),
  naOverview: () => get<NaOverview>("/na/overview"),
  naEvents: (dept: string) => get<NaFil>(`/na/events?dept=${encodeURIComponent(dept)}`),
  dossier: () => get<{ etat: Record<string, unknown>; dossier: { genere: string; sections: { cle: string; titre: string; points: string[] }[] } }>("/dossier"),
  reviewQueue: (params: { status?: string; bucket?: string; source?: string; groupe?: string; q?: string; page?: number; limit?: number } = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
    }
    const suffix = qs.toString();
    return get<ReviewQueueResponse>(`/quarantine/queue${suffix ? `?${suffix}` : ""}`, signal);
  },
  reviewAction: (ids: number[], action: ReviewAction, reason?: string) =>
    postJson<ReviewOutcome>("/quarantine/review", { ids, action, reason: reason ?? "" }),
  /** Auditable journal — every decision kind, filtered, cursor-paginated. */
  journalReview: (params: JournalReviewParams = {}, signal?: AbortSignal) => {
    return get<JournalReviewResponse>(`/journal/review?${journalQuery(params)}`, signal);
  },
  /**
   * CSV of the very same filtered list. The token cannot be sent through a
   * plain link (the export is admin-only), so we fetch a Blob and let the
   * browser download it with the filename from Content-Disposition.
   */
  journalExport: async (params: JournalReviewParams = {}, signal?: AbortSignal): Promise<Blob> => {
    const res = await fetch(`${BASE}/journal/review/export.csv?${journalQuery(params, false)}`, {
      headers: authHeaders(), signal,
    });
    if (!res.ok) throw apiError("/journal/review/export.csv", res.status);
    return res.blob();
  },
  directory: (params: DirectoryQuery = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.kind) qs.set("kind", params.kind);
    if (params.sector) qs.set("sector", params.sector);
    if (params.dept) qs.set("dept", params.dept);
    if (params.withEvents) qs.set("withEvents", "1");
    if (params.withoutEvents) qs.set("withoutEvents", "1");
    if (params.sort) qs.set("sort", params.sort);
    if (params.dir) qs.set("dir", params.dir);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString();
    return get<DirectoryResponse>(`/directory${suffix ? `?${suffix}` : ""}`, signal);
  },
  orgDetail: (id: number) => get<OrgDetail>(`/orgs/${id}`),
  rectificationsOrg: (orgId: number) => get<RectificationsOrg>(`/orgs/${orgId}/rectifications`),
  demanderRectification: (body: DemandeRectification) => postJson<AccuseRectification>("/rectifications", body),
  search: (q: string) => get<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),
  events: (
    limit = 100,
    order: "regional" | "recent" = "regional",
    portee: "region" | "toutes" | "vulnerabilites" = "region",
  ) => get<Event[]>(`/events?limit=${limit}&order=${order}&portee=${portee}`),
  /** Écran d'accueil : compteurs 24 h / 7 j et fil filtrable, en un appel. */
  today: (params: { family?: string | null; dept?: string | null } = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    if (params.family) qs.set("family", params.family);
    if (params.dept) qs.set("dept", params.dept);
    const suffix = qs.toString();
    return get<TodayResponse>(`/today${suffix ? `?${suffix}` : ""}`, signal);
  },
  graph: (days = 90) => get<Graph>(`/graph?days=${days}`),
  /** Graphe temporel : période de validité des entités et des relations. */
  graphTemporal: () => get<Graph>("/graph/temporal"),
  sources: () => get<Source[]>("/sources"),
  statsDepartements: (signal?: AbortSignal) => get<StatsDepartements>("/today/departements", signal),
  /** Écran Corpus : volumes, couverture des domaines et croissance. */
  corpusStats: (signal?: AbortSignal) => get<CorpusStats>("/corpus/stats", signal),
  /** Press-only incidents: governed by the same versioned corpus, without victim data. */
  pressOnly: (signal?: AbortSignal) => get<PressOnlySummary>("/press-only/incidents", signal),
  /** Unconfirmed claims: the corpus `declare` class, without victim data. */
  unconfirmedClaims: (signal?: AbortSignal) => get<UnconfirmedClaimsSummary>("/unconfirmed-claims/incidents", signal),
  /** Confirmed incidents: the corpus `etabli` class, without victim data. */
  confirmedIncidents: (signal?: AbortSignal) => get<ConfirmedIncidentsSummary>("/confirmed-incidents/incidents", signal),
  stats: () => get<Stats>("/stats"),
  /** Couverture mesurée : une seule lecture, identique d'un appel à l'autre. */
  couverture: (signal?: AbortSignal) => get<CouvertureResponse>("/couverture", signal),
  healthDetail: () => get<HealthDetail>("/health/detail"),
  healthCauses: () => get<HealthCauses>("/health/causes"),
  health: () => get<Health>("/health"),
  flows: (days = 30, limit = 300, mode = "arcs") => get<Flows>(`/flows?days=${days}&limit=${limit}&mode=${mode}`),
  collecteMetrics: (limit = 20, signal?: AbortSignal) =>
    get<CollecteMetrics>(`/collecte/metrics?limit=${limit}`, signal),
  alerts: (params: AlertQuery = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.severity) qs.set("severity", String(params.severity));
    qs.set("limit", String(params.limit ?? 500));
    return get<Alert[]>(`/alerts?${qs.toString()}`);
  },
  alertStats: () => get<AlertStatRow[]>("/alerts/stats"),
  ackAlert: (id: number) => post<{ ok: boolean }>(`/alerts/${id}/ack`),
  resolveAlert: (id: number) => post<{ ok: boolean }>(`/alerts/${id}/resolve`),
  enrichIndicator: (id: number) => get<IndicatorEnrichment>(`/enrich/indicator/${id}`),
  enrichEvent: (id: number) => get<EventEnrichment>(`/enrich/events/${id}`),
};
