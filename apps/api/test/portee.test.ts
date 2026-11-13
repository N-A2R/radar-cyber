import { test } from "node:test";
import assert from "node:assert/strict";
import { classerPortee, segments } from "../src/quarantine/portee.js";

test("un département de la région suffit à garder la revendication", () => {
	assert.equal(classerPortee("Mairie de Tarnos", "incident en Landes").portee, "region");
	assert.equal(classerPortee("ACME", "victime en Gironde").portee, "region");
});

test("un pays étranger explicite sort du périmètre", () => {
	const v = classerPortee("dollmar.com\\$28.3M\\Italy\\127GB\\100% DISCLOSED");
	assert.equal(v.portee, "hors_perimetre");
	assert.match(v.motif, /italy/);
});

test("un indice illisible sort du périmètre, avec son motif", () => {
	assert.equal(classerPortee("###").portee, "hors_perimetre");
	assert.equal(classerPortee("").portee, "hors_perimetre");
	assert.equal(classerPortee("ab").portee, "hors_perimetre");
});

test("sans indice, on ne tranche pas : la revendication reste à revoir", () => {
	// « Aucun indice » n'est pas « hors périmètre » : prétendre le contraire
	// reviendrait à jeter 14 000 revendications sur une intuition.
	assert.equal(classerPortee("Northern Minerals Limited").portee, "a_revoir");
	assert.equal(classerPortee("powertestdyno.com").portee, "a_revoir");
});

test("les métadonnées collées sont séparées, pas prises pour le nom", () => {
	assert.deepEqual(segments("espackeuro.com\\$17.3M\\Spain\\11GB"), [
		"espackeuro.com",
		"$17.3M",
		"Spain",
		"11GB",
	]);
	// Le pays est lu dans le troisième segment, pas dans le premier.
	const v = classerPortee("espackeuro.com\\$17.3M\\Spain\\11GB\\100% DISCLOSED");
	assert.equal(v.portee, "hors_perimetre");
});
