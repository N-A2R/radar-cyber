#!/usr/bin/env -S npx tsx
/**
 * Publie l'ancrage quotidien du journal de vérité.
 *
 *   pnpm journal:anchor                       # ancre hier (date de la base)
 *   pnpm journal:anchor --jour 2026-11-03     # ancre un jour précis / le rejoue
 *   pnpm journal:anchor --all --limite 30     # comble les jours manquants
 *   pnpm journal:anchor:check --jour ...      # relit, recompute, vérifie le jeton
 *
 * `--check` n'écrit rien : il relit la racine depuis `journal`, vérifie le jeton
 * RFC 3161 et le fichier publié, puis exécute le critère SQL tel quel.
 */
import { closePools, query } from "../apps/api/src/db.js";
import { ancrerJour, jourHier, joursManquants, verifierJour } from "../apps/api/src/journal/anchor.js";

const args = process.argv.slice(2);
const option = (nom: string): string | undefined => {
	const i = args.indexOf(nom);
	return i >= 0 ? args[i + 1] : undefined;
};
const check = args.includes("--check");
const tout = args.includes("--all");
const jourArg = option("--jour");
const limite = Number(option("--limite") ?? 30);
const dossier = option("--dossier");

if (!Number.isInteger(limite) || limite < 1 || limite > 1000) {
	throw new Error("--limite doit être un entier entre 1 et 1000");
}

/** Le critère du juge externe, exécuté sans reformulation. */
async function critere(): Promise<number> {
	const resultat = await query<{ count: string }>(
		`SELECT count(*) FROM journal_anchor WHERE jour=current_date-1 AND (racine_sha256 IS NULL OR token_rfc3161 IS NULL OR journal_debut_id IS NULL OR journal_fin_id IS NULL);`,
	);
	return Number(resultat.rows[0]?.count ?? -1);
}

async function main(): Promise<void> {
	const jour = jourArg ?? await jourHier();
	if (check) {
		const resultat = await verifierJour({ jour, dossier });
		console.log(JSON.stringify({ verification: resultat, critere: await critere() }, null, 2));
		return;
	}
	const jours = tout ? await joursManquants(limite) : [jour];
	const resultats = [];
	for (const j of jours) {
		const resultat = await ancrerJour({ jour: j, dossier });
		resultats.push({
			jour: resultat.ancrage.jour,
			statut: resultat.statut,
			racine_sha256: resultat.ancrage.racine_sha256,
			journal_lignes: Number(resultat.ancrage.journal_lignes),
			fichier: resultat.ancrage.fichier,
			tsa_url: resultat.ancrage.tsa_url,
			jeton_rfc3161_present: resultat.ancrage.token_rfc3161.length > 0,
		});
	}
	console.log(JSON.stringify({ ancrages: resultats, critere: await critere() }, null, 2));
}

try {
	await main();
} finally {
	await closePools();
}
