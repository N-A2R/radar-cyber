/**
 * Journal & dossier — one destination, two panels.
 *
 * Both views stay mounted: switching tabs must not discard the journal's
 * filters, page, selection or pending export, nor refetch the dossier. The
 * inactive panel is hidden from rendering and from assistive technology with
 * the native `hidden` attribute. The tab strip follows the WAI-ARIA pattern
 * (automatic activation, roving tab stop, arrows / Home / End).
 */
import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";
import DossierView from "./DossierView";
import JournalView from "./JournalView";
import { Card } from "@astryxdesign/core/Card";
import "./journal-workspace.css";

export type JournalWorkspaceTab = "journal" | "dossier";

const TABS: readonly { id: JournalWorkspaceTab; label: string }[] = [
  { id: "journal", label: "Journal" },
  { id: "dossier", label: "Dossier" },
];

type Props = {
  onUnauthorized?: () => void;
  /** Controlled selection; omit to let the workspace own its tab. */
  tab?: JournalWorkspaceTab;
  onTabChange?: (tab: JournalWorkspaceTab) => void;
};

export default function JournalWorkspace({ onUnauthorized, tab, onTabChange }: Props) {
  const baseId = useId();
  const [ownedTab, setOwnedTab] = useState<JournalWorkspaceTab>(tab ?? "journal");
  const active = tab ?? ownedTab;
  const buttons = useRef<Record<JournalWorkspaceTab, HTMLButtonElement | null>>({
    journal: null,
    dossier: null,
  });

  const select = useCallback((next: JournalWorkspaceTab) => {
    if (next === active) return;
    if (tab === undefined) setOwnedTab(next);
    onTabChange?.(next);
  }, [active, onTabChange, tab]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.findIndex(({ id }) => id === active);
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (current + 1) % TABS.length; break;
      case "ArrowLeft": next = (current - 1 + TABS.length) % TABS.length; break;
      case "Home": next = 0; break;
      case "End": next = TABS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const id = TABS[next].id;
    select(id);
    buttons.current[id]?.focus();
  }, [active, select]);

  return (
    <section className="journal-workspace" aria-label="Journal et dossier">
      <Card
        variant="transparent"
        padding={0}
        className="journal-workspace__tabs"
        role="tablist"
        aria-label="Sections du journal"
        onKeyDown={onKeyDown}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            ref={(node) => { buttons.current[id] = node; }}
            type="button"
            className="journal-workspace__tab"
            id={`${baseId}-tab-${id}`}
            role="tab"
            aria-controls={`${baseId}-panel-${id}`}
            aria-selected={active === id}
            tabIndex={active === id ? 0 : -1}
            onClick={() => select(id)}
          >
            {label}
          </button>
        ))}
      </Card>

      <Card
        variant="transparent"
        padding={0}
        className="journal-workspace__panel"
        role="tabpanel"
        id={`${baseId}-panel-journal`}
        aria-labelledby={`${baseId}-tab-journal`}
        hidden={active !== "journal"}
        tabIndex={0}
      >
        <JournalView onUnauthorized={onUnauthorized} />
      </Card>
      <Card
        variant="transparent"
        padding={0}
        className="journal-workspace__panel"
        role="tabpanel"
        id={`${baseId}-panel-dossier`}
        aria-labelledby={`${baseId}-tab-dossier`}
        hidden={active !== "dossier"}
        tabIndex={0}
      >
        <DossierView />
      </Card>
    </section>
  );
}
