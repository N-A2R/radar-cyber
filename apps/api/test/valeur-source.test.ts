/**
 * Ce que vaut une source : trois mesures, pas une note.
 *
 * Le piège que ce test verrouille : une source peut avoir un volume énorme et
 * n'apporter aucun fait nouveau. La confondre avec une source utile, c'est
 * financer un agrégateur en croyant financer une vigie.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluerValeur, verdict } from "../src/analyse/valeur-source.js";
import { regrouper, type EvenementCorroborable } from "../src/analyse/corroboration.js";

function evt(p: Partial<EvenementCorroborable> & { id: string; date: string; sourceId: string }): EvenementCorroborable {
	return { family: "ransomware", severity: 4, assertionType: "third_party_claim", orgId: 1, title: "t", ...p };
}

test("une source seule sur un fait est indispensable, même avec un petit volume", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "locale" }),
		evt({ id: "b", date: "2026-10-10T08:00:00Z", sourceId: "locale", family: "phishing" }),
	]);
	const [valeur] = evaluerValeur(groupes);
	assert.equal(valeur?.faitsUniques, 2);
	assert.equal(valeur?.partUniquesPct, 100);
	assert.equal(verdict(valeur!), "indispensable");
});

test("une source qui suit sans jamais révéler est redondante", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "originale" }),
		evt({ id: "b", date: "2026-10-01T16:00:00Z", sourceId: "agregateur" }),
		evt({ id: "c", date: "2026-10-05T08:00:00Z", sourceId: "originale", family: "phishing" }),
		evt({ id: "d", date: "2026-10-05T20:00:00Z", sourceId: "agregateur", family: "phishing" }),
	]);
	const valeurs = evaluerValeur(groupes);
	const agre = valeurs.find((v) => v.sourceId === "agregateur");
	const orig = valeurs.find((v) => v.sourceId === "originale");
	assert.equal(agre?.faitsUniques, 0);
	assert.equal(agre?.primeurs, 0);
	assert.equal(verdict(agre!), "redondante");
	assert.equal(orig?.primeurs, 2, "elle a révélé les deux faits");
	assert.equal(verdict(orig!), "utile", "utile, mais jamais seule : quelqu'un d'autre en parle");
});

test("le retard médian ne se calcule que sur les faits où l'on arrive après", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "premiere" }),
		evt({ id: "b", date: "2026-10-01T10:00:00Z", sourceId: "suiveuse" }),
		evt({ id: "c", date: "2026-10-08T08:00:00Z", sourceId: "premiere", family: "phishing" }),
		evt({ id: "d", date: "2026-10-08T20:00:00Z", sourceId: "suiveuse", family: "phishing" }),
	]);
	const suiveuse = evaluerValeur(groupes).find((v) => v.sourceId === "suiveuse");
	// 2 h et 12 h : la médiane est 7, pas 12. `Math.floor(n/2)` rendait la
	// valeur haute sur un effectif pair — un biais qui va toujours dans le sens
	// du chiffre le plus flatteur ou le plus alarmant.
	assert.equal(suiveuse?.retardMedianHeures, 7);
});

test("l'ordre place d'abord ce qui porte des faits uniques", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "seule" }),
		evt({ id: "b", date: "2026-10-02T08:00:00Z", sourceId: "a1" }),
		evt({ id: "c", date: "2026-10-02T09:00:00Z", sourceId: "a2" }),
	]);
	const [premiere] = evaluerValeur(groupes);
	assert.equal(premiere?.sourceId, "seule");
});

test("aucun fait : aucun classement inventé", () => {
	assert.deepEqual(evaluerValeur([]), []);
});
