/**
 * Charge l'échantillon de revendications dans la quarantaine locale.
 *
 * Sert à démontrer et tester la file de revue sans dépendre d'un accès dark web
 * (le sandbox n'en a pas). Le jeu est versionné :
 * `bench/fixtures/claims-sample.json`, 500 revendications réelles issues du
 * miroir GitHub `joshhighet/ransomwatch` (Unlicense).
 *
 * **Ne pas lancer sur une instance de production** : ces faits sont publics et
 * non vérifiés, ils ne doivent pas se mélanger à une vraie quarantaine. Le
 * script refuse de s'exécuter si la table contient déjà des faits d'une autre
 * source, sauf `--force`.
 *
 * Idempotent : la clé est `(source, content_hash)`, un rejeu n'insère rien.
 *
 *   DATABASE_URL=... tsx scripts/load-claims-sample.mts
 *   DATABASE_URL=... tsx scripts/load-claims-sample.mts --purge
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";

const SOURCE = "ransomwatch-echantillon";
const argv = process.argv.slice(2);
const PURGE = argv.includes("--purge");
const FORCE = argv.includes("--force");
const PATH = fileURLToPath(new URL("../bench/fixtures/claims-sample.json", import.meta.url));

type Fixture = {
	meta: Record<string, unknown>;
	claims: Array<{ title: string; group: string; discovered: string }>;
};

async function main(): Promise<void> {
	if (PURGE) {
		const removed = await query("DELETE FROM quarantine_raw WHERE source = $1", [SOURCE]);
		console.log(`${removed.rowCount ?? 0} fait(s) de l'échantillon supprimé(s)`);
		return;
	}

	const fixture = JSON.parse(readFileSync(PATH, "utf8")) as Fixture;
	console.log(`jeu : ${fixture.meta.titre}`);
	console.log(`  source : ${fixture.meta.source} — ${fixture.meta.licence}`);
	console.log(`  ${fixture.claims.length} revendications, fenêtre ${JSON.stringify(fixture.meta.fenetre)}`);

	const other = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM quarantine_raw WHERE source <> $1",
		[SOURCE],
	);
	const otherCount = Number(other.rows[0]?.n ?? 0);
	if (otherCount > 0 && !FORCE) {
		console.error(
			`\nrefus : la quarantaine contient ${otherCount} fait(s) d'une autre source.\n` +
			"Ce jeu est public et non vérifié ; il ne doit pas polluer une vraie quarantaine.\n" +
			"Utiliser une base de démonstration, ou --force en connaissance de cause.",
		);
		process.exitCode = 1;
		return;
	}

	let inserted = 0;
	for (const claim of fixture.claims) {
		const hash = createHash("sha256")
			.update(`${SOURCE}\u0000${claim.group}\u0000${claim.discovered}\u0000${claim.title}`)
			.digest("hex");
		const r = await query(
			`INSERT INTO quarantine_raw
			   (source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, tlp, content_hash, status)
			 VALUES ($1,$2,$3,$4,$5::timestamptz,$6::jsonb,NULL,'RED',$7,'pending')
			 ON CONFLICT (source, content_hash) DO NOTHING`,
			[
				SOURCE,
				`https://github.com/joshhighet/ransomwatch#${hash.slice(0, 12)}`,
				claim.group,
				claim.title,
				`${claim.discovered}T00:00:00Z`,
				JSON.stringify({ titre_brut: claim.title, corpus: "ransomwatch", verification: "non vérifiée" }),
				hash,
			],
		);
		inserted += r.rowCount ?? 0;
	}
	const total = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM quarantine_raw WHERE source = $1",
		[SOURCE],
	);
	console.log(`\n${inserted} fait(s) inséré(s), ${total.rows[0].n} en quarantaine pour cette source`);
	console.log("TLP:RED par politique de la table ; le corps brut reste vide, seul le titre est conservé.");
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => closePools());
