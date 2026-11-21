/**
 * Six cas de rattachement d'un incident du corpus : chaque critère, puis les
 * trois refus. Le cœur est pur (aucune base) : on lui passe les lignes qu'il
 * aurait lues dans `org` / `org_alias`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rattacherCorpus,
  type IncidentCorpus,
  type OrganisationCorpus,
} from "../src/match/rattacher-corpus.js";

const ORGS: OrganisationCorpus[] = [
  {
    id: 1,
    name: "Mairie de Berson",
    dept: "33",
    city: "Berson",
    domain: "berson.fr",
    aliases: ["mairie de berson"],
  },
  {
    id: 2,
    name: "Centre hospitalier de Pau",
    dept: "64",
    city: "Pau",
    domain: "ch-pau.fr",
    aliases: ["CHU de Pau"],
  },
  {
    id: 3,
    name: "Mairie de Floirac",
    dept: "33",
    city: "Floirac",
    aliases: ["mairie de floirac"],
  },
  {
    id: 4,
    name: "Mairie de Floirac",
    dept: "33",
    city: "Bordeaux",
    aliases: ["mairie de floirac"],
  },
];

/** Même fiche, mais rangée dans un autre département : le piège classique. */
const ORGS_FAUX_POSITIF: OrganisationCorpus[] = [
  { ...ORGS[0]!, id: 9, dept: "86" },
];

const incident = (values: Partial<IncidentCorpus> = {}): IncidentCorpus => ({
  organisation: "",
  departement: null,
  ...values,
});

describe("rattacherCorpus — six cas du corpus", () => {
  it("exact : nom normalisé et département concordants", () => {
    const resultat = rattacherCorpus(
      incident({ organisation: "  MAIRIE DE BÈRSOn — ", departement: "Gironde" }),
      ORGS,
    );
    assert.deepEqual(resultat, { orgId: 1, motif: "nom-exact" });
  });

  it("alias : l'alias l'emporte sur le nom légal", () => {
    const resultat = rattacherCorpus(
      incident({ organisation: "CHU de Pau", departement: "64" }),
      ORGS,
    );
    assert.deepEqual(resultat, { orgId: 2, motif: "alias" });
  });

  it("domaine : l'URL de la fiche désigne l'organisation", () => {
    const resultat = rattacherCorpus(
      incident({
        organisation: "Incident signalé par un hébergeur",
        departement: "33",
        domaine: "https://www.berson.fr/contact",
      }),
      ORGS,
    );
    assert.deepEqual(resultat, { orgId: 1, motif: "domaine" });
  });

  it("ambigu : deux organisations restent à égalité", () => {
    const resultat = rattacherCorpus(
      incident({ organisation: "Mairie de Floirac", departement: "Gironde" }),
      ORGS,
    );
    assert.deepEqual(resultat, { orgId: null, motif: "ambigu" });
  });

  it("absent : aucune organisation ne correspond", () => {
    const resultat = rattacherCorpus(
      incident({ organisation: "Hôpital de Saint-Médard", departement: "Gironde" }),
      ORGS,
    );
    assert.deepEqual(resultat, { orgId: null, motif: "absent" });
  });

  it("faux positif : le nom concorde mais le département contredit", () => {
    const resultat = rattacherCorpus(
      incident({ organisation: "Mairie de Berson", departement: "Gironde" }),
      ORGS_FAUX_POSITIF,
    );
    assert.deepEqual(resultat, { orgId: null, motif: "faux-positif" });
  });
});
