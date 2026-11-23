import type { Alert, CouverturePublique, DeptStat, Event, Graph, Health, NaFil, NaOverview, Org, Source, SourcesDashboard, Stats, TodayResponse } from "./api";
import type { DirectoryUrlState } from "./url-state";

/** Les vues de l'application, dans l'ordre du rail. */
export type ViewKey = "today" | "coverage" | "review" | "journal" | "corpus" | "sources" | "sources-dashboard" | "map" | "directory" | "graph" | "health" | "alerts" | "dossier" | "na" | "affected";


/** Contrat de l'écran d'accueil « Aujourd'hui ». */
export type TodayViewProps = {
  /** Réponse complète de GET /api/today, ou null tant qu'elle n'est pas là. */
  data: TodayResponse | null;
  loading: boolean;
  error: string | null;
  family: string | null;
  dept: string | null;
  /** Départements proposés par GET /api/today/departements (24 h). */
  departements: DeptStat[];
  /** Instant de référence de la timeline ; `Date.now()` par défaut. */
  maintenant?: number;
  onFamily: (family: string | null) => void;
  onDept: (dept: string | null) => void;
  onOpenOrg: (orgId: number) => void;
  onOpenEvent: (eventId: string) => void;
  /** Relance le chargement derrière l'état vide (sinon, action locale). */
  onRetry?: () => void;
};

/** Contract of the coverage screen (GET /api/couverture). */
export type CouvertureViewProps = {
  data: CouverturePublique | null;
  loading: boolean;
  error: string | null;
};
/** Contrat du fil d'événements (colonne de gauche). */
export type FeedProps = {
  events: Event[];
  byFamily: { family: string; n: number }[];
  family: string | null;
  onFamily: (family: string | null) => void;
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  loading: boolean;
  error: string | null;
  /** Relance le chargement derrière l'état vide (sinon, action locale). */
  onRetry?: () => void;
};

/** Contrat de l'inspecteur (panneau de droite). */
export type InspectorProps = {
  eventId: string | null;
  orgId: number | null;
  onClose: () => void;
  onOpenOrg?: (orgId: number) => void;
};

/** Contrat de la vue carte. */
export type MapViewProps = {
  orgs: Org[];
  events: Event[];
  selectedOrgId: number | null;
  onSelectOrg: (orgId: number) => void;
};

/** Contrat de la vue Nouvelle-Aquitaine. */
export type NaViewProps = {
  orgs: Org[];
  overview: NaOverview | null;
  /** Fil d'événements du département filtré (GET /api/na/events). */
  fil: NaFil | null;
  loading: boolean;
  error: string | null;
  /** Département sélectionné dans l'URL (`?naDept=33`), `null` = région. */
  dept: string | null;
  onSelectDept: (dept: string | null) => void;
  onOpenOrg: (orgId: number) => void;
  /** Relance le chargement derrière l'état vide (sinon, action locale). */
  onRetry?: () => void;
};

/** Contrat de la vue alertes. */
export type AlertsViewProps = {
  canWrite: boolean;
  onUnauthorized: () => void;
  onOpenEvent: (eventId: string) => void;
  /** Incrémenté à chaque alerte reçue en direct : force le rechargement. */
  refreshSignal?: number;
};

/** Contrat de la vue sources. */
export type SourcesViewProps = {
  sources: Source[];
  loading: boolean;
  error: string | null;
  /** Relance le chargement derrière l'état vide (sinon, action locale). */
  onRetry?: () => void;
};

/** Contrat de l'écran tableau de bord des sources (GET /api/sources/dashboard). */
export type SourcesDashboardViewProps = {
  data: SourcesDashboard | null;
  loading: boolean;
  error: string | null;
};

/** Contrat de la vue santé. */
export type HealthViewProps = {
  health: Health | null;
  stats: Stats | null;
  sources: Source[];
};

/** Contrat de la vue graphe. */
export type GraphViewProps = {
  graph: Graph | null;
  loading: boolean;
  error: string | null;
};

/** Contrat de l'écran de connexion. */
export type LoginProps = {
  onSuccess: (token: string) => void;
};

/** Scope d'une alerte : incident organisationnel ou avis régional. */
export type AlertScope = "organization_incident" | "regional_advisory";

/** Rangée d'alerte telle que rendue par la vue alertes. */
export type AlertRow = Alert & { scope?: AlertScope | null };

/** Contrat de l'annuaire des organisations (chantier C). */
export type DirectoryProps = {
  orgs: Org[];
  loading: boolean;
  error: string | null;
  onOpenOrg: (orgId: number) => void;
  /** true : l'API filtre, classe et pagine ; false : tout en mémoire (démo). */
  server?: boolean;
  /** État lu dans l'URL au montage, pour un lien profond. */
  urlState?: DirectoryUrlState;
  onUrlStateChange?: (state: DirectoryUrlState) => void;
  onCopyLink?: () => void;
  /** Relance le chargement derrière l'état vide (sinon, action locale). */
  onRetry?: () => void;
};

/** Résultat de recherche globale, toutes natures confondues. */
export type SearchHit =
  | { kind: "org"; id: number; label: string; detail: string }
  | { kind: "event"; id: string; label: string; detail: string }
  | { kind: "indicator"; id: number; label: string; detail: string };

/** Contrat de la palette de recherche globale (⌘K / Ctrl+K). */
export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onOpenOrg: (orgId: number) => void;
  onOpenEvent: (eventId: string) => void;
  /** En mode démonstration, la recherche porte sur les données simulées. */
  mock?: { orgs: Org[]; events: Event[] } | null;
};

/** File de revue de la quarantaine : décisions persistées, donc API requise. */
export type ReviewViewProps = {
  canWrite: boolean;
  server: boolean;
  onUnauthorized: () => void;
  onOpenOrg: (orgId: number) => void;
};


