#!/usr/bin/env -S npx tsx
/**
 * Pilote le certificat d'ignorance : scan des champs inconnus par organisation.
 *
 *   DATABASE_URL=... tsx scripts/certificat-ignorance.mts              # lecture seule
 *   DATABASE_URL=... tsx scripts/certificat-ignorance.mts --apply      # écrit/rafraîchit
 *   DATABASE_URL=... tsx scripts/certificat-ignorance.mts --check      # critère externe
 *     --limit=5000 --json=bench/results/certificat-ignorance.json
 *
 * Le critère est exécuté tel quel, sans passe-plat : `unknown_field` et
 * `checked_at` non nuls, au moins 10261 lignes et au moins 3 champs par org.
 * Aucune donnée personnelle n'est lue ni écrite.
 */
import { writeFileSync } from "node:fs";
import type { ExecuteurSQL } from "../apps/api/src/orgs/unknown-certificate.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5432/radar";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const CHECK = argv.includes("--check");
const jsonPath = argv.find((a) => a.startsWith("--json="))?.slice(7) ?? null;
const limitArg = argv.find((a) => a.startsWith("--limit="))?.slice(8);
const limit = limitArg === undefined ? null : Number(limitArg);
if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
	console.error(`--limit invalide : ${limitArg}`);
	process.exit(2);
}

const {
	CRITERE_ORG_UNKNOWN_SQL,
	OBJECTIF_ORG_UNKNOWN,
	MIN_UNKNOWN_FIELDS,
	certificatAtteint,
	enregistrerCertificatIgnorance,
	mesurerCertificatIgnorance,
} = await import("../apps/api/src/orgs/unknown-certificate.js");
// Le pool d'ingestion porte un timeout large : le scan initial d'une base
// de 1,67 M organisations dépasse le timeout des requêtes HTTP.
const { ingestQuery, closePools } = await import("../apps/api/src/db.js");
const executeur = ingestQuery as ExecuteurSQL;
try {
	if (APPLY) {
		const rapport = await enregistrerCertificatIgnorance(executeur, limit);
		console.log(
			`${rapport.lignesEcrites} ligne(s) écrite(s) ou rafraîchie(s) sur ${rapport.organisations} organisation(s)`,
		);
	}

	const mesure = await mesurerCertificatIgnorance(executeur);
	const atteint = certificatAtteint(mesure);

	console.log(`SQL du critère : ${CRITERE_ORG_UNKNOWN_SQL}`);
	console.log(
		`critère : ${mesure.total}/${OBJECTIF_ORG_UNKNOWN} lignes datées, ` +
			`${mesure.minChampsParOrg}/${MIN_UNKNOWN_FIELDS} champs minimum par org, ` +
			`${mesure.champsDistincts} champs distincts`,
	);

	if (jsonPath) {
		writeFileSync(
			jsonPath,
			`${JSON.stringify({ ...mesure, atteint, verifieLe: new Date().toISOString() }, null, 2)}\n`,
		);
		console.log(`rapport écrit : ${jsonPath}`);
	}
	if (CHECK && !atteint) process.exitCode = 1;
} finally {
	await closePools();
}
