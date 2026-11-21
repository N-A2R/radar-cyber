/**
 * Extraction et rapprochement des domaines présents dans les liens collectés.
 * Les cas sont ceux du rapport `bench/results/domaines-depuis-liens.json` :
 * élargir le rattachement sans confondre un éditeur de vulnérabilités, un
 * projet et une société homonyme.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	evaluerRattachement,
	extraireDomaines,
	racineDe,
	verifierCoherence,
	texteSansUrls,
	type OrgRow,
} from "../../../scripts/domaines-depuis-liens.mjs";

function org(id: number, name: string): OrgRow {
	return { id, name, name_norm: null, domain: null };
}

test("extraction : racine normalisée, URL décodée et hôte éditeur exclu", () => {
	const domaines = extraireDomaines({
		id: 1,
		org_id: null,
		title: "CVE-2026-0001",
		summary:
			'<a href="https://WWW.Exemple.com:8443/chemin?next=https%3A%2F%2Fautre.fr%2Fpage">Lien</a>',
		source_url: "https://nvd.nist.gov/vuln/detail/CVE-2026-0001",
		evidence: null,
	}).map((d) => d.racine);
	assert.ok(domaines.includes("exemple.com"), `exemple.com absent de ${domaines.join(", ")}`);
	assert.ok(domaines.includes("autre.fr"), `autre.fr absent de ${domaines.join(", ")}`);
	assert.equal(domaines.includes("nvd.nist.gov"), false);
});

test("racine : un domaine nu est accepté, un suffixe public seul ne l'est pas", () => {
	assert.equal(racineDe("https://WWW.Exemple.com:8443/chemin"), "exemple.com");
	assert.equal(racineDe("a.gouv.fr"), "a.gouv.fr");
	assert.equal(racineDe("gouv.fr"), null);
});

test("citation : une URL seule ne prouve pas que l'organisation est citée", () => {
	assert.equal(texteSansUrls("voir https://blog.facil.wtf/writeup"), "voir");
	assert.ok(texteSansUrls("FACIL a publié https://blog.facil.wtf/writeup").includes("facil"));
});

test("rattachement élargi : nom complet, jeton partagé, alias et org_id explicite", () => {
	const texte = " mise a jour microsoft windows server ";
	assert.deepEqual(evaluerRattachement(org(2, "MICROSOFT"), [], "microsoft.com", null, texte), {
		motif: "nom",
		score: 90,
	});
	assert.deepEqual(evaluerRattachement(org(3, "MICROSOFT FRANCE"), [], "microsoft.com", null, texte), {
		motif: "jeton",
		score: 70,
	});
	assert.deepEqual(
		evaluerRattachement(
			org(4, "ETABLISSEMENTS PAUL CHAMALEAU SARL"),
			["bosch"],
			"bosch.com",
			null,
			" bosch rexroth ",
		),
		{ motif: "alias", score: 85 },
	);
	assert.equal(evaluerRattachement(org(5, "LECTRA"), [], "microsoft.com", null, texte), null);
	assert.equal(evaluerRattachement(org(5, "LECTRA"), [], "microsoft.com", 5, texte)?.motif, "org_id");
});

test("rattachement prudent : tous les jetons porteurs du domaine doivent appartenir à l'org", () => {
	assert.equal(evaluerRattachement(org(1, "SYNC"), [], "content-sync.io", null, " sync "), null);
	assert.equal(evaluerRattachement(org(2, "CONTROL"), [], "control-webpanel.com", null, " control "), null);
	assert.equal(
		evaluerRattachement(org(3, "OKO SHADOW & LIGHT EDITOR"), [], "rfc-editor.org", null, " editor "),
		null,
	);
	assert.equal(evaluerRattachement(org(4, "CANON"), [], "canon-europe.com", null, " canon ")?.score, 90);
});

test("cohérence HTTP : un jeton d'alias homonyme ne prouve pas l'organisation", () => {
	const pageBosch = "Invented for life | Bosch Global";
	assert.equal(verifierCoherence(org(1, "ETABLISSEMENTS PAUL CHAMALEAU SARL"), ["bosch"], pageBosch).ok, false);
	assert.equal(
		verifierCoherence(org(2, "SCI GNOME"), [], "GNOME, an independent computing platform").ok,
		false,
	);
	assert.equal(verifierCoherence(org(3, "CHROMIUM"), [], "The Chromium Project").ok, true);
	assert.equal(verifierCoherence(org(4, "JUNIPER NETWORKS"), [], "Juniper Networks").ok, true);
	assert.equal(
		verifierCoherence(org(5, "SOCIETE ANONYME"), ["ATOS ORIGINE"], "Atos Origine, filiale du groupe").ok,
		true,
	);
});
