/** One test per behaviour of the sealed typosquat alarm adjudication. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classerAlerte,
  confirmerAlertes,
  scellerConfirmation,
  type AlerteConfirmation,
} from "../src/detect/typosquat-confirmations.js";

const tld: AlerteConfirmation = {
  domain: "univ-poitiers.com", base: "univ-poitiers.fr", orgName: "Universite de Poitiers",
  kind: "tld", similarity: 1, certificate: null, pageTitle: "Universite de Poitiers - connexion",
};
const typo: AlerteConfirmation = {
  domain: "univ-poitier.fr", base: "univ-poitiers.fr", orgName: "Universite de Poitiers",
  kind: "omission", similarity: 0.95, certificate: null,
  pageTitle: "Universite de Poitiers - connexion - Identifiant Mot de passe",
};

test("un changement de TLD est confirmé bénin même avec un titre de connexion", () => {
  const decision = classerAlerte(tld, new Set(["autre-domaine.example"]));
  assert.equal(decision.statut, "benigne");
  assert.deepEqual(decision.motifs, ["changement-de-tld-hors-perimetre"]);
  assert.ok(decision.preuves.includes("dns-actif"));
  assert.ok(decision.preuves.includes("page-sonde"));
  assert.ok(decision.preuves.includes("openphish-absent"));
});

test("une page de vente est confirmée bénigne sans inventer de formulaire", () => {
  const decision = classerAlerte({ ...typo, pageTitle: "univ-poitier.fr - Domain for sale" }, new Set());
  assert.equal(decision.statut, "benigne");
  assert.deepEqual(decision.motifs, ["page-de-vente-ou-stationnement"]);
});

test("un titre de connexion copiant l'organisation confirme l'usurpation", () => {
  const decision = classerAlerte(typo, new Set());
  assert.equal(decision.statut, "usurpation");
  assert.deepEqual(decision.motifs, ["titre-formulaire", "nom-reproduit"]);
  assert.ok(decision.preuves.includes("titre-page"));
});

test("une présence dans le flux OpenPhish confirme l'usurpation", () => {
  const decision = classerAlerte(tld, new Set([tld.domain]));
  assert.equal(decision.statut, "usurpation");
  assert.deepEqual(decision.motifs, ["flux-openphish"]);
  assert.ok(decision.preuves.includes("openphish-present"));
});

test("une page non lisible est classée sans titre ni certificat inventés", () => {
  const decision = classerAlerte({ ...typo, pageTitle: null }, new Set());
  assert.equal(decision.statut, "benigne");
  assert.deepEqual(decision.motifs, ["page-non-lisible"]);
  assert.ok(!decision.preuves.includes("titre-page"));
  assert.ok(!decision.preuves.includes("certificat"));
});
test("confirmerAlertes déduplique les lignes identiques et compte chaque statut", () => {
  const resultat = confirmerAlertes([typo, { ...typo }, tld], new Set());
  assert.deepEqual(
    [resultat.candidats, resultat.confirmes, resultat.usurpations, resultat.benignes],
    [2, 2, 1, 1],
  );
  assert.equal(resultat.confirmations[0]?.similarity, 0.95);
  assert.deepEqual(resultat.confirmations.map((c) => c.domain), [typo.domain, tld.domain]);
});

test("deux organisations visant le même domaine donnent deux décisions", () => {
  const resultat = confirmerAlertes([tld, { ...tld, base: "bordeaux.fr", orgName: "Commune de Bordeaux" }], new Set());
  assert.equal(resultat.candidats, 2);
  assert.equal(new Set(resultat.confirmations.map((c) => c.base)).size, 2);
  assert.notEqual(resultat.confirmations[0]?.empreinte, resultat.confirmations[1]?.empreinte);
});

test("l'empreinte change avec la décision et reste stable sinon", () => {
  const decision = classerAlerte(typo, new Set());
  const empreinte = scellerConfirmation(decision);
  assert.match(empreinte, /^[0-9a-f]{64}$/);
  assert.equal(scellerConfirmation(decision), empreinte);
  assert.notEqual(scellerConfirmation({ ...decision, statut: "benigne" }), empreinte);
});
