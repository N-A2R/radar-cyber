// @vitest-environment jsdom
/**
 * Polling du shell : la décision de rafraîchir est pure et testable sans API.
 * Un onglet caché ne déclenche aucun appel ; une vue n'appelle que ses données.
 */
import { afterEach, describe, expect, it } from "vitest";
import { pageVisible, refreshPlan } from "../src/App";

describe("polling du shell", () => {
  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("onglet caché : aucun rafraîchissement, quelle que soit la vue", () => {
    for (const vue of ["today", "health", "na", "map", "graph", "corpus", "sources-dashboard"] as const) {
      expect(Object.keys(refreshPlan(vue, false))).toHaveLength(0);
    }
  });

  it("chaque visible ne reçoit que ses propres appels lourds", () => {
    const today = refreshPlan("today", true);
    expect(today.today).toBe(true);
    expect(today.departements).toBe(true);
    expect(today.graph).toBeUndefined();
    expect(today.health).toBeUndefined();
    expect(today.flows).toBeUndefined();

    const sante = refreshPlan("health", true);
    expect(sante.health).toBe(true);
    expect(sante.graph).toBeUndefined();
    expect(sante.na).toBeUndefined();
    expect(sante.flows).toBeUndefined();

    expect(refreshPlan("map", true).flows).toBe(true);
    expect(refreshPlan("map", true).health).toBeUndefined();
    expect(refreshPlan("na", true).na).toBe(true);
    expect(refreshPlan("graph", true).graph).toBe(true);
    expect(refreshPlan("corpus", true).corpus).toBe(true);
    expect(refreshPlan("sources-dashboard", true).sourcesDashboard).toBe(true);
    // `stats` n'est affiché nulle part : il n'est plus sondé périodiquement.
    expect(Object.keys(refreshPlan("sources", true))).toHaveLength(0);
  });

  it("visibilityState pilote la décision", () => {
    expect(pageVisible()).toBe(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    expect(pageVisible()).toBe(false);
    expect(Object.keys(refreshPlan("health", pageVisible()))).toHaveLength(0);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    expect(pageVisible()).toBe(true);
  });
});
