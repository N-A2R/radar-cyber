/**
 * Les manques du référentiel : une liste de courses, pas une déduction.
 *
 * La question à laquelle ce module doit résister est celle qui a déjà faussé
 * une mesure : *est-ce un trou de couverture régionale, ou une entreprise
 * américaine revendiquée par un groupe international ?* Sur la base de
 * développement, 300 entités nommées ne sont pas au référentiel, et la
 * quasi-totalité est hors zone.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import { cleManque, listerManques, parVoie, voieProbable, zoneDe } from "../src/referentiel/manques.js";

const TAG = `man${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

test("un pays déclaré par la source tranche la zone", () => {
	assert.equal(zoneDe("acmefan.com\\$421M\\USA\\1TB\\<1% DISCLOSED"), "hors-zone");
	assert.equal(zoneDe("exemple.fr\\1,2 M€\\France\\300GB\\10% DISCLOSED"), "france");
	// « French republic » et « FR » sont des variantes réelles du même champ.
	assert.equal(zoneDe("exemple.fr\\1 M€\\FR\\30GB"), "france");
});

test("sans pays, seul un indice français net vaut", () => {
	assert.equal(zoneDe("mairie-de-tarnos.fr"), "france");
	// Mesuré sur 500 indices : un motif large (« collège », « clinique »,
	// « commune ») range une dizaine d'entités étrangères en France.
	assert.equal(zoneDe("Kilgore College (kilgore.edu)"), "inconnue");
	assert.equal(zoneDe("Commune de Jemeppe-sur-Sambre"), "inconnue");
	assert.equal(zoneDe("PHARMATIS-SAS"), "inconnue");
});

test("une ville du référentiel rattache à la région, si elle est longue", () => {
	const villes = new Set(["bordeaux", "gradignan", "gan"]);
	assert.equal(zoneDe("Royal Glass Gradignan", villes), "france");
	// « Gan » (Pyrénées-Atlantiques) est un mot trop court pour prouver quoi que
	// ce soit : il ne doit pas classer une entité.
	assert.equal(zoneDe("Gan Systems", villes), "inconnue");
});

test("la voie de chargement suit la forme du nom, sans prétendre décider", () => {
	assert.equal(voieProbable("Groupe Delcourt"), "sirene");
	assert.equal(voieProbable("PHARMATIS-SAS"), "sirene");
	assert.equal(voieProbable("Commune de Tarnos"), "annuaire-administratif");
	assert.equal(voieProbable("Euskal Moneta"), "manuel");
});

test("la clé de comparaison ne confond pas deux entités distinctes", () => {
	assert.equal(cleManque("Saint-Georges"), cleManque("saint georges"));
	assert.notEqual(cleManque("Saint-Georges"), cleManque("Saint Georges de Didonne"));
});

before(async () => {
	// Une revendication française, une américaine, une sans pays.
	for (const [hash, nom] of [
		[`${TAG}-1`, "Commune de Tarnos"],
		[`${TAG}-2`, "acmefan.com\\$421M\\USA\\1TB\\<1% DISCLOSED"],
		[`${TAG}-3`, "Euskal Moneta"],
	]) {
		await query(
			`INSERT INTO quarantine_raw (source, source_url, org_hint, content_hash, tlp, status)
			 VALUES ($1,$2,$3,$4,'GREEN','pending')`,
			[`${TAG}-src`, `https://exemple.invalid/${hash}`, nom, hash],
		);
	}
});

after(async () => {
	await query("DELETE FROM quarantine_raw WHERE source = $1", [`${TAG}-src`]);
	await closePools();
});

test("la liste écarte ce qui existe déjà au référentiel", async () => {
	const tout = await listerManques();
	const filtre = await listerManques({ existe: (nom) => nom.startsWith("Commune") });
	const nomsTout = tout.map((m) => m.nom);
	const nomsFiltre = filtre.map((m) => m.nom);
	assert.ok(nomsTout.includes("Commune de Tarnos"));
	assert.ok(!nomsFiltre.includes("Commune de Tarnos"), "une entité présente ne doit pas figurer dans la liste");
});

test("le hors-zone est marqué, pas supprimé", async () => {
	const manques = await listerManques();
	const americain = manques.find((m) => m.nom.includes("acmefan"));
	assert.ok(americain, "l'entité hors zone doit rester visible pour être auditée");
	assert.equal(americain.zone, "hors-zone");
	// Et elle passe après les entités du périmètre : c'est le tri qui rend la
	// liste utilisable, pas la suppression.
	const francais = manques.find((m) => m.nom === "Commune de Tarnos");
	assert.ok(francais);
	assert.ok(manques.indexOf(francais) < manques.indexOf(americain));
});

test("chaque manque porte une provenance et une voie", async () => {
	const manques = await listerManques();
	for (const manque of manques) {
		assert.ok(["revendication", "evenement", "les deux"].includes(manque.provenance));
		assert.ok(["sirene", "annuaire-administratif", "manuel"].includes(manque.voie));
	}
	const repartition = parVoie(manques);
	assert.equal(
		repartition.sirene + repartition["annuaire-administratif"] + repartition.manuel,
		manques.length,
	);
});
