/**
 * Préfiltre de candidats — test différentiel.
 *
 * Le préfiltre n'a le droit d'exister que s'il rend **exactement** le même
 * rattachement que le balayage complet. On ne le vérifie pas sur quelques cas
 * choisis : sur les 500 revendications du corpus réel, sur le jeu d'or de
 * rattachement, et sur des indices constrits pour toucher chaque chemin du
 * moteur (domaine, suffixe, nom complet, nom court, ville + nom).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closePools, query } from "../src/db.js";
import { loadOrgIndex, matchOrgInIndex } from "../src/quarantine/promote.js";
import { buildCandidateIndex, candidatesFor } from "../src/quarantine/candidates.js";

after(async () => {
	await closePools();
});

test("différentiel : 500 revendications réelles, résultat identique", async () => {
	const index = await loadOrgIndex();
	const candidates = buildCandidateIndex(index);
	const fixture = JSON.parse(
		readFileSync(new URL("../../../bench/fixtures/claims-sample.json", import.meta.url), "utf8"),
	) as { claims: Array<{ title: string }> };

	let examined = 0;
	for (const claim of fixture.claims) {
		const full = matchOrgInIndex(claim.title, index);
		const subset = candidatesFor(claim.title, candidates);
		const fast = matchOrgInIndex(claim.title, subset);
		assert.deepEqual(fast, full, `divergence sur « ${claim.title} »`);
		examined += subset.length;
	}
	const average = examined / fixture.claims.length;
	assert.ok(average < index.length / 10, `le préfiltre doit réduire le balayage (moyenne ${average.toFixed(1)} / ${index.length})`);
});

test("différentiel : jeu d'or de rattachement, résultat identique", async () => {
	const index = await loadOrgIndex();
	const candidates = buildCandidateIndex(index);
	const gold = JSON.parse(
		readFileSync(new URL("../../../bench/orgs/gold-attach.json", import.meta.url), "utf8"),
	) as { cases?: Array<{ text?: string; hint?: string }> } | Array<{ text?: string; hint?: string }>;
	const cases = Array.isArray(gold) ? gold : gold.cases ?? [];
	assert.ok(cases.length > 0, "le jeu d'or doit être lisible");
	for (const item of cases) {
		const hint = item.text ?? item.hint ?? "";
		if (!hint) continue;
		assert.deepEqual(
			matchOrgInIndex(hint, candidatesFor(hint, candidates)),
			matchOrgInIndex(hint, index),
			`divergence sur « ${hint} »`,
		);
	}
});

test("différentiel : indices constrits pour chaque chemin du moteur", async () => {
	const index = await loadOrgIndex();
	const candidates = buildCandidateIndex(index);
	const probes = [
		"", "   ", "!!!", "x",
		"Commune de Pessac", "mairie de pessac", "Pessac",
		"pessac.fr", "www.pessac.fr", "courriel@pessac.fr",
		"Conseil départemental de la Gironde", "Gironde",
		"Bordeaux Métropole", "CA du Grand Villeneuvois",
		"acme.com\\$5M\\France\\20GB\\DISCLOSED",
		"SAINT MEDARD EN JALLES", "saint-medard-en-jalles",
		"Université de Bordeaux", "CHU de Bordeaux",
	];
	for (const hint of probes) {
		assert.deepEqual(
			matchOrgInIndex(hint, candidatesFor(hint, candidates)),
			matchOrgInIndex(hint, index),
			`divergence sur « ${hint} »`,
		);
	}
});

test("différentiel non vide : des rattachements positifs sont préservés", async () => {
	// Sur le corpus NA, les 500 revendications ne rattachent rien : un
	// différentiel « identique » y serait trivialement vrai. On injecte donc des
	// organisations dérivées des revendications elles-mêmes (domaine pour les
	// titres structurés, nom pour les autres), puis on exige que le préfiltre
	// retrouve **exactement** les mêmes rattachements positifs que le balayage.
	const fixture = JSON.parse(
		readFileSync(new URL("../../../bench/fixtures/claims-sample.json", import.meta.url), "utf8"),
	) as { claims: Array<{ title: string }> };

	const tag = `dif${Date.now().toString(36)}`;
	const domains = new Set<string>();
	const names = new Set<string>();
	for (const claim of fixture.claims) {
		const head = claim.title.split("\\")[0].trim();
		if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(head)) domains.add(head.toLowerCase());
		else if (head.length >= 5 && head.length <= 60) names.add(head);
	}
	const sampleDomains = [...domains].slice(0, 40);
	const sampleNames = [...names].slice(0, 40);
	assert.ok(sampleDomains.length + sampleNames.length > 20, "le corpus doit fournir des indices exploitables");

	let seq = 0;
	for (const domain of sampleDomains) {
		seq++;
		await query(
			`INSERT INTO org (name, slug, kind, city, domain, website, status)
			 VALUES ($1,$2,'entreprise','Bordeaux',$3,$4,'confirme')`,
			[`Société ${domain.split(".")[0]}`, `${tag}-d-${seq}`, domain, `https://${domain}`],
		);
	}
	for (const name of sampleNames) {
		seq++;
		await query(
			`INSERT INTO org (name, slug, kind, city, status)
			 VALUES ($1,$2,'entreprise','Pessac','confirme')`,
			[name, `${tag}-n-${seq}`],
		);
	}

	try {
		const index = await loadOrgIndex();
		const candidates = buildCandidateIndex(index);
		let positives = 0;
		for (const claim of fixture.claims) {
			const full = matchOrgInIndex(claim.title, index);
			const fast = matchOrgInIndex(claim.title, candidatesFor(claim.title, candidates));
			assert.deepEqual(fast, full, `divergence sur « ${claim.title} »`);
			if (full) positives++;
		}
		assert.ok(positives >= 20, `le différentiel doit porter sur de vrais rattachements (${positives} trouvés)`);
	} finally {
		await query("DELETE FROM org WHERE slug LIKE $1", [`${tag}-%`]);
	}
});

test("indice sans jeton exploitable : repli sur l'index complet", async () => {
	const index = await loadOrgIndex();
	const candidates = buildCandidateIndex(index);
	assert.equal(candidatesFor("!!!", candidates).length, index.length);
	assert.equal(candidatesFor("", candidates).length, index.length);
});

test("le préfiltre réduit le travail de façon déterministe", async () => {
	const index = await loadOrgIndex();
	const candidates = buildCandidateIndex(index);
	const fixture = JSON.parse(
		readFileSync(new URL("../../../bench/fixtures/claims-sample.json", import.meta.url), "utf8"),
	) as { claims: Array<{ title: string }> };
	const hints = fixture.claims.map((c) => c.title);

	// On mesure le travail fait (organisations examinées), pas des millisecondes :
	// la base de test contient peu d'organisations et un chronométrage y serait
	// du bruit. Le gain en temps se mesure sur le corpus réel, dans le banc
	// `bench/quarantine/probe.mts`.
	let examined = 0;
	for (const hint of hints) examined += candidatesFor(hint, candidates).length;
	const average = examined / hints.length;
	assert.ok(
		average < Math.max(20, index.length / 20),
		`le préfiltre doit écarter l'essentiel du référentiel (moyenne ${average.toFixed(1)} / ${index.length})`,
	);
});
