import { useMemo, useRef } from "react";
import {
  CommandPalette as AstryxCommandPalette,
  CommandPaletteFooter,
  CommandPaletteInput,
} from "@astryxdesign/core/CommandPalette";
import type { SearchSource, SearchableItem } from "@astryxdesign/core/Typeahead";
import { api } from "../api";
import type { CommandPaletteProps, SearchHit } from "../contracts";
import "./palette.css";

const MIN_QUERY = 3;

type PaletteItem = SearchableItem<SearchHit> & {
  id: string;
  label: string;
  auxiliaryData: SearchHit;
};

function paletteItems(hits: SearchHit[], index: Map<string, SearchHit>): PaletteItem[] {
  index.clear();
  return hits.map((hit) => {
    const id = `${hit.kind}:${hit.id}`;
    index.set(id, hit);
    return { id, label: hit.label, auxiliaryData: hit };
  });
}

export default function CommandPalette({ open, onClose, onOpenOrg, onOpenEvent, mock }: CommandPaletteProps) {
  const controller = useRef<AbortController | null>(null);
  const hitIndex = useRef(new Map<string, SearchHit>());

  const searchSource = useMemo<SearchSource<PaletteItem>>(() => ({
    search: (query) => {
      const q = query.trim();
      if (q.length < MIN_QUERY) return [];
      if (mock) {
        const lower = q.toLowerCase();
        const orgs = mock.orgs
          .filter((org) => `${org.name} ${org.city ?? ""} ${org.dept ?? ""}`.toLowerCase().includes(lower))
          .map((org): SearchHit => ({
            kind: "org",
            id: org.id,
            label: org.name,
            detail: [org.kind, org.city, org.dept].filter(Boolean).join(" · "),
          }));
        const events = mock.events
          .filter((event) => event.title.toLowerCase().includes(lower))
          .map((event): SearchHit => ({
            kind: "event",
            id: event.id,
            label: event.title,
            detail: `${event.family} · ${event.sourceId}`,
          }));
        return paletteItems([...orgs, ...events].slice(0, 20), hitIndex.current);
      }
      controller.current?.abort();
      controller.current = new AbortController();
      return api.search(q, controller.current.signal).then((res) => {
        const hits: SearchHit[] = [
          ...res.orgs.map((org): SearchHit => ({
            kind: "org",
            id: org.id,
            label: org.name,
            detail: [org.kind, org.city, org.dept, org.domain].filter(Boolean).join(" · "),
          })),
          ...res.events.map((event): SearchHit => ({
            kind: "event",
            id: event.id,
            label: event.title,
            detail: `${event.family} · ${event.sourceId}`,
          })),
          ...res.indicators.map((indicator): SearchHit => ({
            kind: "indicator",
            id: indicator.id,
            label: indicator.value,
            detail: `${indicator.type} · ${indicator.sourceId} · ${indicator.tlp}`,
          })),
        ];
        return paletteItems(hits, hitIndex.current);
      });
    },
    bootstrap: () => [],
    cancel: () => controller.current?.abort(),
  }), [mock]);

  function choose(hit: SearchHit) {
    if (hit.kind === "org") onOpenOrg(hit.id);
    else if (hit.kind === "event") onOpenEvent(hit.id);
    else return;
    onClose();
  }

  // Le dialogue fermé reste monté : son champ ne doit jamais voler le focus.
  return (
    <AstryxCommandPalette
      isOpen={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
      searchSource={searchSource}
      label="Recherche globale"
      width="min(640px, calc(100vw - 32px))"
      maxHeight="min(560px, calc(100vh - 64px))"
      emptySearchText="Aucun résultat."
      emptyBootstrapText="Saisissez au moins 3 caractères."
      input={<CommandPaletteInput hasAutoFocus={open} placeholder="Organisation, événement ou indicateur…" label="Recherche globale" />}
      footer={<CommandPaletteFooter>↑ ↓ parcourir · Entrée ouvrir · Échap fermer</CommandPaletteFooter>}
      renderItem={(item) => {
        const hit = item.auxiliaryData;
        return (
          <span className="palette__result" data-kind={hit.kind}>
            <span className="palette__tag">{hit.kind === "org" ? "organisation" : hit.kind === "event" ? "événement" : "indicateur"}</span>
            <span className="palette__label">{hit.label}</span>
            <span className="palette__detail">{hit.detail}</span>
          </span>
        );
      }}
      onValueChange={(value) => {
        const hit = hitIndex.current.get(value);
        if (hit) choose(hit);
      }}
    />
  );
}
