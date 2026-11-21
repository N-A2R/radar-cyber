import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detecterRupturesOrg,
  FENETRE_ABSENCE_JOURS,
  type EvenementOrganisation,
} from "../src/analyse/agent-rupture-org.js";

const MAINTENANT = Date.parse("2026-11-21T12:00:00Z");
const JOUR_MS = 86_400_000;

function evenement(
  id: number,
  orgId: number,
  joursAvant: number,
  sourceId = "source-a",
): EvenementOrganisation {
  return {
    id,
    orgId,
    sourceId,
    date: new Date(MAINTENANT - joursAvant * JOUR_MS).toISOString(),
  };
}

test("une organisation déjà vue, silencieuse puis corroborée par deux sources alerte", () => {
  const alertes = detecterRupturesOrg([
    evenement(100, 1, FENETRE_ABSENCE_JOURS + 10),
    evenement(101, 1, 6, "source-a"),
    evenement(102, 1, 3, "source-b"),
    evenement(103, 1, 1, "source-a"),
  ], MAINTENANT);

  assert.equal(alertes.length, 1);
  assert.equal(alertes[0]?.orgId, 1);
  assert.deepEqual(
    alertes[0]?.evenementsDeclencheurs.map((e) => e.id),
    [101, 102, 103],
  );
  assert.equal(alertes[0]?.evenementsAnciens, 1);
  assert.equal(alertes[0]?.sourcesDistinctes, 2);
});

test("une arrivée dans le référentiel, même à quatre faits sur deux sources, n'alerte pas", () => {
  // Les huit fausses alertes mesurées le 21/11 étaient des organisations
  // sans aucun fait antérieur au silence : la règle ne doit plus les voir.
  const alertes = detecterRupturesOrg([
    evenement(1, 1, 6, "source-a"),
    evenement(2, 1, 4, "source-b"),
    evenement(3, 1, 2, "source-a"),
    evenement(4, 1, 1, "source-b"),
  ], MAINTENANT);

  assert.deepEqual(alertes, []);
});

test("une réapparition venant d'une seule source n'alerte pas", () => {
  const alertes = detecterRupturesOrg([
    evenement(100, 1, 120),
    evenement(1, 1, 6),
    evenement(2, 1, 3),
    evenement(3, 1, 1),
  ], MAINTENANT);

  assert.deepEqual(alertes, []);
});

test("une seule apparition pendant les 90 j d'absence exclut l'organisation", () => {
  const alertes = detecterRupturesOrg([
    evenement(100, 1, 120),
    evenement(1, 1, 89, "source-a"),
    evenement(2, 1, 6, "source-b"),
    evenement(3, 1, 3, "source-a"),
    evenement(4, 1, 1, "source-b"),
    evenement(10, 2, 99),
    evenement(11, 2, 6, "source-a"),
    evenement(12, 2, 3, "source-b"),
    evenement(13, 2, 1, "source-a"),
  ], MAINTENANT);
  assert.deepEqual(alertes.map((a) => a.orgId), [2], "89 j = encore dans l'absence, 99 j = fait antérieur");
});

test("file vide, dates invalides et faits futurs : aucune alerte, aucune exception", () => {
  assert.deepEqual(detecterRupturesOrg([], MAINTENANT), []);
  assert.deepEqual(detecterRupturesOrg([
    { id: 1, orgId: 1, sourceId: "source-a", date: "pas-une-date" },
    { id: 2, orgId: 1, sourceId: "source-b", date: "" },
    { id: 3, orgId: 1, sourceId: "source-c", date: new Date(MAINTENANT + JOUR_MS).toISOString() },
  ], MAINTENANT), []);
});
