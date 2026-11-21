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

export type Graph = {
  nodes: { id: string; label: string; kind: "org" | "family" | "group" | "asset" | "dept" }[];
  links: { source: string; target: string; type: string }[];
};

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
  createdAt: string;
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
  assets: { total: number; byKind: OrgAssetKind[]; recent: OrgAsset[] };
  events: { total: number; byFamily: OrgEventFamily[]; recent: Event[] };
  claims: { total: number; recent: OrgClaim[] };
  exposure: OrgExposurePoint[];
  /** Absent des serveurs antérieurs à l'analyse multi-sources. */
  corroboration?: Corroboration;
  /** Absent des serveurs antérieurs au profil historique. */
  historique?: Historique;
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

/** Une décision de revue telle que consignée dans le journal (GET /api/journal/review). */
export type JournalDecision = {
  id: number;
  sujet: string;
  /** Auteur brut du journal : `humain:email`, `moteur:triage`… */
  acteur: string;
  /** Horodatage d'enregistrement du fait (recorded_at), ISO ou texte PG. */
  horodatage: string;
  decision: "accepter" | "refuser" | "creer" | null;
  /** Indice de la revendication, ou sujet du fait quand il n'y en a pas. */
  indice: string | null;
  raison: string | null;
};

export type JournalReviewResponse = {
  rows: JournalDecision[];
  limite: number;
  /** Curseur de la page suivante ; null = dernière page. */
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

export const api = {
  login: (email: string, password: string) => postJson<LoginResponse>("/auth/login", { email, password }),
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
  /** Journal des décisions de revue — lecture seule, pagination par curseur. */
  journalReview: (limite = 100, avant: number | null = null, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ limite: String(limite) });
    if (avant !== null) qs.set("avant", String(avant));
    return get<JournalReviewResponse>(`/journal/review?${qs.toString()}`, signal);
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
  sources: () => get<Source[]>("/sources"),
  stats: () => get<Stats>("/stats"),
  healthDetail: () => get<HealthDetail>("/health/detail"),
  healthCauses: () => get<HealthCauses>("/health/causes"),
  health: () => get<Health>("/health"),
  flows: (days = 30, limit = 300, mode = "arcs") => get<Flows>(`/flows?days=${days}&limit=${limit}&mode=${mode}`),
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
