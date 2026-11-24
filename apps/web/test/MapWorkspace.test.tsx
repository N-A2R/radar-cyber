// @vitest-environment jsdom
/**
 * Carte workspace — composition and callback tests. The heavy map/graph/domain
 * views are replaced by markers: what is asserted here is that the workspace
 * selects the right panel and forwards every callback without reshaping data.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapWorkspace, { type MapWorkspaceProps } from "../src/components/MapWorkspace";
import { mockData } from "../src/mock";
import { DEFAULT_DIRECTORY } from "../src/url-state";

// vi.mock factories are hoisted above imports; a static React import would
// still be uninitialised inside them, so the module is loaded in the factory.
vi.mock("@astryxdesign/core/SegmentedControl", async () => {
  const React = await import("react");
  return {
    SegmentedControl: ({ children, label, value, onChange }: {
      children: readonly { props: { value: string } }[];
      label: string;
      value: string;
      onChange: (next: string) => void;
    }) => React.createElement("div", { role: "group", "aria-label": label },
      children.map((child) => React.cloneElement(
        child as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }>,
        {
          onClick: () => onChange(child.props.value),
          "aria-pressed": child.props.value === value,
        },
      )),
    ),
    SegmentedControlItem: ({ label, value, ...props }: {
      label: string; value: string;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props, "data-segment": value }, label),
  };
});
vi.mock("../src/map/Map3D", async () => {
  const React = await import("react");
  return {
    default: (props: {
      events: unknown[]; flows: unknown[]; basemap?: string; families?: readonly string[];
      onSelect?: (id: string) => void; onSelectEvent?: (id: string) => void;
    }) => React.createElement("div", {
      "data-testid": "map3d",
      "data-events": props.events.length,
      "data-flows": props.flows.length,
      "data-basemap": props.basemap ?? "",
      "data-families": (props.families ?? []).join(","),
    },
      React.createElement("button", {
        type: "button", "data-testid": "map-org", onClick: () => props.onSelect?.("org:42"),
      }, "organisation"),
      React.createElement("button", {
        type: "button", "data-testid": "map-event", onClick: () => props.onSelectEvent?.("evt-1"),
      }, "événement"),
    ),
  };
});

vi.mock("../src/map/MapTimeline", async () => {
  const React = await import("react");
  return {
    default: (props: { selected: string; shown: number; total: number; onSelect: (bucket: string) => void }) =>
      React.createElement("div", {
        "data-testid": "map-timeline",
        "data-selected": props.selected,
        "data-shown": props.shown,
        "data-total": props.total,
      }, React.createElement("button", {
        type: "button", "data-testid": "timeline-bucket", onClick: () => props.onSelect("2026-11"),
      }, "bucket")),
  };
});

vi.mock("../src/components/MapLegend", async () => {
  const React = await import("react");
  return { default: (props: { families: readonly string[] }) => React.createElement("div", {
    "data-testid": "map-legend", "data-families": props.families.join(","),
  }) };
});

vi.mock("../src/components/NaView", async () => {
  const React = await import("react");
  return { default: () => React.createElement("div", { "data-testid": "na-view" }, "Région") };
});

vi.mock("../src/components/CouvertureView", async () => {
  const React = await import("react");
  return { default: () => React.createElement("div", { "data-testid": "coverage-view" }, "Couverture mesurée") };
});

vi.mock("../src/components/AffectedView", async () => {
  const React = await import("react");
  return {
    default: (props: { query: string; onSubmit: (q: string) => void }) => React.createElement("div", {
      "data-testid": "affected-view", "data-query": props.query,
    }, React.createElement("button", {
      type: "button", "data-testid": "affected-submit", onClick: () => props.onSubmit("acme"),
    }, "Vérifier")),
  };
});

vi.mock("../src/graph/GraphView", async () => {
  const React = await import("react");
  return {
    default: (props: { onSelect?: (id: string | null) => void }) => React.createElement("div", {
      "data-testid": "graph-view",
    },
      React.createElement("button", {
        type: "button", "data-testid": "graph-org", onClick: () => props.onSelect?.("org:7"),
      }, "organisation"),
      React.createElement("button", {
        type: "button", "data-testid": "graph-event", onClick: () => props.onSelect?.("event:evt-9"),
      }, "événement"),
    ),
  };
});

vi.mock("../src/components/ActorAttributionsView", async () => {
  const React = await import("react");
  return { default: () => React.createElement("div", { "data-testid": "attributions-view" }, "Attributions") };
});

vi.mock("../src/components/DirectoryView", async () => {
  const React = await import("react");
  return {
    default: (props: { server?: boolean; urlState?: { q: string } }) => React.createElement("div", {
      "data-testid": "directory-view",
      "data-server": String(props.server === true),
      "data-query": props.urlState?.q ?? "",
    }, "Annuaire"),
  };
});

const testGlobals = globalThis as unknown as Record<string, unknown>;
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

function makeProps(overrides: Partial<MapWorkspaceProps> = {}): MapWorkspaceProps {
  return {
    orgs: mockData.orgs,
    events: mockData.events,
    loading: false,
    error: null,
    onRetry: vi.fn(),
    flows: [],
    basemap: "plan",
    onBasemapChange: vi.fn(),
    mapBuckets: [{ key: "2026-11", from: "2026-11-01", to: "2026-12-01", count: 4 }],
    mapBucket: "2026-11",
    onMapBucketChange: vi.fn(),
    mapEvents: [],
    mapTotal: 4,
    mapLoading: false,
    family: null,
    onFamily: vi.fn(),
    onOpenOrg: vi.fn(),
    onOpenEvent: vi.fn(),
    initialPanel: "carte",
    onPanelChange: vi.fn(),
    coverage: { data: null, loading: false, error: null },
    regional: {
      overview: null, fil: null, dept: null, onSelectDept: vi.fn(), loading: false, error: null,
    },
    affected: {
      report: null, loading: false, error: null, query: "", onQueryChange: vi.fn(), onSubmit: vi.fn(),
    },
    graph: {
      graph: { nodes: [], links: [] }, temporal: null, eventsById: {}, orgsById: {}, sourcesById: {},
    },
    directory: {
      urlState: DEFAULT_DIRECTORY, onUrlStateChange: vi.fn(), onCopyLink: vi.fn(), server: true,
    },
    attributions: { data: null, loading: false, error: null },
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function mount(props: MapWorkspaceProps) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<MapWorkspace {...props} />); });
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")]
    .find((element) => element.textContent?.replace(/[⌕↻]/g, "").trim() === label);
  if (!found) throw new Error(`Bouton introuvable : ${label}`);
  return found as HTMLButtonElement;
}

function click(element: Element) {
  act(() => { (element as HTMLElement).click(); });
}

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe("MapWorkspace", () => {
  it("compose la carte, la timeline et le panneau régional, et transmet les actions", () => {
    const mapEvents = mockData.events.slice(0, 2).map((event) => ({
      id: event.id, title: event.title, family: event.family, assertionType: event.assertionType,
      severity: event.severity, confidence: event.confidence, sourceId: event.sourceId,
      sourceUrl: event.sourceUrl, orgId: event.orgId, lat: event.lat, lon: event.lon,
      observedAt: event.observedAt,
    }));
    const props = makeProps({ mapEvents, flows: [{} as never], family: "vuln" });
    mount(props);

    const map = container.querySelector<HTMLElement>("[data-testid='map3d']");
    expect(map?.dataset.events).toBe("2");
    expect(map?.dataset.flows).toBe("1");
    expect(map?.dataset.families).toBe("vuln");
    expect(container.querySelector("[data-testid='map-timeline']")).not.toBeNull();
    expect(container.querySelector("[data-testid='na-view']")).not.toBeNull();
    expect(container.querySelector<HTMLElement>("[data-testid='map-legend']")?.dataset.families)
      .toContain("vuln");

    click(container.querySelector("[data-testid='map-org']")!);
    expect(props.onOpenOrg).toHaveBeenCalledWith(42);
    click(container.querySelector("[data-testid='map-event']")!);
    expect(props.onOpenEvent).toHaveBeenCalledWith("evt-1");
    click(container.querySelector("[data-testid='timeline-bucket']")!);
    expect(props.onMapBucketChange).toHaveBeenCalledWith("2026-11");

    act(() => {
      const select = container.querySelector<HTMLSelectElement>(".map-workspace__family")!;
      select.value = "ransomware";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onFamily).toHaveBeenCalledWith("ransomware");
    click(button("satellite"));
    expect(props.onBasemapChange).toHaveBeenCalledWith("sat");
  });

  it("merging Coverage, Alerts-free regional panel and affected search into the side panel", () => {
    const props = makeProps();
    mount(props);

    click(button("Couverture"));
    expect(container.querySelector("[data-testid='coverage-view']")).not.toBeNull();
    expect(props.onPanelChange).toHaveBeenLastCalledWith("couverture");

    click(button("Concerné ?"));
    expect(container.querySelector("[data-testid='affected-view']")).not.toBeNull();
    expect(props.onPanelChange).toHaveBeenLastCalledWith("affected");
    click(container.querySelector("[data-testid='affected-submit']")!);
    expect(props.affected.onSubmit).toHaveBeenCalledWith("acme");

    click(button("Région"));
    expect(container.querySelector("[data-testid='na-view']")).not.toBeNull();
    expect(props.onPanelChange).toHaveBeenLastCalledWith("regional");

    click(button("Suis-je concerné ?"));
    expect(container.querySelector("[data-testid='affected-view']")).not.toBeNull();
    expect(button("Suis-je concerné ?").getAttribute("aria-expanded")).toBe("true");
  });

  it("ouvre le graphe et les attributions, et traduit la sélection des nœuds", () => {
    const props = makeProps();
    mount(props);

    click(button("Graphe"));
    expect(container.querySelector("[data-testid='graph-view']")).not.toBeNull();
    expect(props.onPanelChange).toHaveBeenLastCalledWith("graph");
    click(container.querySelector("[data-testid='graph-org']")!);
    expect(props.onOpenOrg).toHaveBeenCalledWith(7);
    click(container.querySelector("[data-testid='graph-event']")!);
    expect(props.onOpenEvent).toHaveBeenCalledWith("evt-9");

    click(button("Attributions"));
    expect(container.querySelector("[data-testid='attributions-view']")).not.toBeNull();
    expect(props.onPanelChange).toHaveBeenLastCalledWith("attributions");
  });

  it("accepte les panneaux historiques comme état initial et garde l'annuaire isolé", () => {
    const props = makeProps({ initialPanel: "directory" });
    mount(props);
    const directory = container.querySelector<HTMLElement>("[data-testid='directory-view']");
    expect(directory?.dataset.server).toBe("true");
    expect(directory?.dataset.query).toBe(DEFAULT_DIRECTORY.q);
    expect(container.querySelector("[data-testid='map3d']")).toBeNull();

    click(button("Carte"));
    expect(props.onPanelChange).toHaveBeenLastCalledWith("carte");
    expect(container.querySelector("[data-testid='map3d']")).not.toBeNull();
  });

  it("reste synchronisé avec l'URL quand le panneau demandé change", () => {
    const props = makeProps({ initialPanel: "couverture" });
    mount(props);
    expect(container.querySelector("[data-testid='coverage-view']")).not.toBeNull();

    act(() => { root.render(<MapWorkspace {...props} initialPanel="attributions" />); });
    expect(container.querySelector("[data-testid='attributions-view']")).not.toBeNull();
    expect(props.onPanelChange).not.toHaveBeenCalled();
  });
});
