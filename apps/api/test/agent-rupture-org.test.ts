import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detecterRupturesOrg,
  FENETRE_ABSENCE_JOURS,
  type EvenementOrganisation,
} from "../src/analyse/agent-rupture-org.js";

const MAINTENANT = Date.parse("2026-11-21T12:00:00Z");
const JOUR_MS = 86_400_000;

function evenement(id: number, orgId: number, joursAvant: number): EvenementOrganisation {
  return { id, orgId, date: new Date(MAINTENANT - joursAvant * JOUR_MS).toISOString() };
}

test("une série synthétique déclenche exactement une alerte", () => {
  const evenements: EvenementOrganisation[] = [
    // Organisation 1 : absente des 90 j précédents, trois apparitions en 7 j.
    evenement(101, 1, 6),
    evenement(102, 1, 3),
    evenement(103, 1, 1),
    // Une apparition plus ancienne que 90 j ne contredit pas l'absence.
    evenement(100, 1, FENETRE_ABSENCE_JOURS + 10),
    // Organisation 2 : seulement deux apparitions récentes.
    evenement(201, 2, 5),
    evenement(202, 2, 2),
    // Organisation 3 : trois apparitions récentes, mais vue il y a 30 j.
    evenement(301, 3, 6),
    evenement(302, 3, 4),
    evenement(303, 3, 2),
    evenement(300, 3, 30),
    // Une date invalide ne déclenche rien.
    { id: 999, orgId: 4, date: "pas-une-date" },
  ];

  const alertes = detecterRupturesOrg(evenements, MAINTENANT);

  assert.equal(alertes.length, 1);
  assert.equal(alertes[0]?.orgId, 1);
  assert.deepEqual(
    alertes[0]?.evenementsDeclencheurs.map((e) => e.id),
    [101, 102, 103],
  );
});
