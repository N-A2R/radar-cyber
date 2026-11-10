import type { Alert, Event, Graph, Health, Org, Source, Stats } from "./api";

/** Les cinq vues de l'application, dans l'ordre du rail. */
export type ViewKey = "map" | "graph" | "sources" | "health" | "alerts";

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
};

/** Contrat de l'inspecteur (panneau de droite). */
export type InspectorProps = {
  eventId: string | null;
  orgId: number | null;
  onClose: () => void;
};

/** Contrat de la vue carte. */
export type MapViewProps = {
  orgs: Org[];
  events: Event[];
  selectedOrgId: number | null;
  onSelectOrg: (orgId: number) => void;
};

/** Contrat de la vue alertes. */
export type AlertsViewProps = {
  canWrite: boolean;
  onUnauthorized: () => void;
  onOpenEvent: (eventId: string) => void;
};

/** Contrat de la vue sources. */
export type SourcesViewProps = {
  sources: Source[];
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

/** Rangée d'alerte telle que rendue par la vue alertes. */
export type AlertRow = Alert;
