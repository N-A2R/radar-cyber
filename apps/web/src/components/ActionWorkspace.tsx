import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ReviewUrlState } from "../url-state";
import AlertsView from "./AlertsView";
import ReviewView from "./ReviewView";
import { Card } from "@astryxdesign/core/Card";
import "./action-workspace.css";

/** Onglets de l'espace Action. Les libellés restent ceux des écrans d'origine. */
export type ActionTab = "alerts" | "review";

export type ActionWorkspaceProps = {
  /** Onglet affiché au montage (ou après un changement de lien profond). */
  initialTab?: ActionTab | "alertes" | "revue";
  canWrite?: boolean;
  server?: boolean;
  onUnauthorized?: () => void;
  onOpenEvent?: (eventId: string) => void;
  onOpenOrg?: (orgId: number) => void;
  refreshSignal?: number;
  /** Filtres de la file de revue portés par l'URL. */
  urlState?: ReviewUrlState;
  onUrlStateChange?: (next: ReviewUrlState) => void;
  /** Notifie le shell pour qu'il puisse refléter l'onglet dans le hash. */
  onTabChange?: (tab: ActionTab) => void;
};
const noop = () => {};

const TABS: ReadonlyArray<{ id: ActionTab; label: string }> = [
  { id: "alerts", label: "Alertes" },
  { id: "review", label: "Revue" },
];

/** Accepte les clés anglaises du contrat et les libellés français des liens. */
function normalizeTab(value: ActionWorkspaceProps["initialTab"]): ActionTab {
  if (value === "review" || value === "revue") return "review";
  return "alerts";
}

/**
 * Espace Action : les alertes et la file de revue partagent une seule
 * destination. Les deux écrans gardent leurs props et leur comportement ;
 * seul le conteneur ajoute la navigation à onglets accessible.
 */
export function ActionWorkspace({
  initialTab = "alerts",
  canWrite = false,
  server = true,
  onUnauthorized,
  onOpenEvent,
  onOpenOrg,
  refreshSignal,
  urlState,
  onUrlStateChange,
  onTabChange,
}: ActionWorkspaceProps) {
  const [tab, setTab] = useState<ActionTab>(() => normalizeTab(initialTab));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Le shell peut changer le hash sans démonter l'espace : suivre le lien.
  useEffect(() => {
    const next = normalizeTab(initialTab);
    setTab((current) => (current === next ? current : next));
  }, [initialTab]);

  const selectTab = useCallback((next: ActionTab) => {
    if (next === tab) return;
    setTab(next);
    onTabChange?.(next);
  }, [tab, onTabChange]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.findIndex((item) => item.id === tab);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (current + 1) % TABS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (current - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="action-workspace" aria-label="Action">
      <Card variant="transparent" padding={0} className="action-workspace__tabs" role="tablist" aria-label="Action" onKeyDown={onTabKeyDown}>
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={`action-tab-${item.id}`}
            className="action-workspace__tab"
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`action-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </Card>

      <Card
        variant="transparent"
        padding={0}
        id="action-panel-alerts"
        className="action-workspace__panel"
        role="tabpanel"
        aria-labelledby="action-tab-alerts"
        tabIndex={0}
        hidden={tab !== "alerts"}
      >
        {tab === "alerts" ? (
          <AlertsView
            canWrite={canWrite}
            onUnauthorized={onUnauthorized ?? noop}
            onOpenEvent={onOpenEvent ?? noop}
            refreshSignal={refreshSignal}
          />
        ) : null}
      </Card>

      <Card
        variant="transparent"
        padding={0}
        id="action-panel-review"
        className="action-workspace__panel"
        role="tabpanel"
        aria-labelledby="action-tab-review"
        tabIndex={0}
        hidden={tab !== "review"}
      >
        {tab === "review" ? (
          <ReviewView
            canWrite={canWrite}
            server={server}
            onUnauthorized={onUnauthorized ?? noop}
            onOpenOrg={onOpenOrg}
            urlState={urlState}
            onUrlStateChange={onUrlStateChange}
          />
        ) : null}
      </Card>
    </section>
  );
}

export default ActionWorkspace;
