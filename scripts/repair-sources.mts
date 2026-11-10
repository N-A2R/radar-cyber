/**
 * Réparation ciblée des sources cassées du tableau de santé.
 *
 * Chaque correction est **littérale** : une entrée par source dans `REPAIRS`,
 * avec la mesure HTTP qui l'a motivée, la cause et l'action. Aucune heuristique,
 * aucun balayage : ce script n'invente rien et ne touche qu'aux colonnes
 * `url`, `enabled` et `disabled_reason`. Aucune ligne n'est supprimée.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/repair-sources.mts            # dry-run (défaut)
 *   apps/api/node_modules/.bin/tsx scripts/repair-sources.mts --dry-run
 *   apps/api/node_modules/.bin/tsx scripts/repair-sources.mts --apply    # écrit en base
 *
 * Mesures du 2026-11-10 (curl -L, UA `RadarCyberNA/0.2`, plafond 45 s) :
 * voir docs/sources-cassees.md pour le détail et la reproduction.
 */
import { query, closePools } from "../apps/api/src/db.js";

/** Action appliquée à une source. `keep` ne produit aucune écriture. */
type Action = "url" | "disable" | "keep";

interface Repair {
	/** Identifiant exact dans `source.id`. */
	id: string;
	/** Code HTTP, taille et durée observés (ou « n/a » si non HTTP). */
	measured: string;
	/** Cause réelle, pas le symptôme. */
	cause: string;
	action: Action;
	/** Nouvelle URL, uniquement pour `action = "url"`. */
	url?: string;
	/** Motif inscrit dans `disabled_reason`, uniquement pour `action = "disable"`. */
	disabledReason?: string;
	/** Remarque libre (correctif hors périmètre, source voisine…). */
	note?: string;
}

/**
 * Liste exhaustive. Toute source citée dans le constat du tableau de santé y
 * figure, y compris celles qui se sont révélées saines après mesure (`keep`).
 */
const REPAIRS: readonly Repair[] = [
	{
		id: "quarantine:ransomware.live",
		measured: "404 · 27 562 o · 0,19 s",
		cause: "endpoint v2/recentvictims retiré ; /v2/, /v3/, /docs, /recentvictims renvoient tous 404 (page HTML de 27 kio).",
		action: "disable",
		disabledReason:
			"HTTP 404 persistant sur https://api.ransomware.live/v2/recentvictims ; aucune variante (/v2/, /v3/, /recentvictims) ne répond. Remplacée par feed:ransomware-live:ransomwareleak et ransom-ransomwarelive.",
	},
	{
		id: "estorides:urlhaus-recent",
		measured: "401 · 25 o · 0,20 s",
		cause: 'API abuse.ch exige un en-tête Auth-Key ; corps {"error":"Unauthorized"}. Le CSV public de remplacement répond 410 Gone.',
		action: "disable",
		disabledReason:
			"HTTP 401 : l'API URLhaus exige Auth-Key (env ABUSECH_AUTH_KEY non défini) ; le CSV public https://urlhaus.abuse.ch/downloads/csv_recent/ répond 410. Définir ABUSECH_AUTH_KEY puis réactiver.",
	},
	{
		id: "estorides:urlhaus-payloads",
		measured: "401 · 25 o · 0,12 s",
		cause: "même API que urlhaus-recent : Auth-Key requise, corps Unauthorized.",
		action: "disable",
		disabledReason:
			"HTTP 401 : l'API URLhaus exige Auth-Key (env ABUSECH_AUTH_KEY non défini) ; aucun CSV public de remplacement (410). Définir ABUSECH_AUTH_KEY puis réactiver.",
	},
	{
		id: "actu-cybernews",
		measured: "200 · 27 535 o · 0,44 s",
		cause: "403 transitoire (Cloudflare) au passage du 10/11 20:55, non reproductible en UA radar ni en UA navigateur.",
		action: "keep",
		note: "Le 403 doit disparaître au prochain passage ; si récidive, vérifier l'intervalle et la charge.",
	},
	{
		id: "feed:daniel-austin-mbcs:ip:aHR0cHM6",
		measured: "403 · 303 o · 0,09 s",
		cause: 'limitation de débit dan.me.uk : corps « You can only fetch the data every 30 minutes ». Trois sources interrogent le même hôte.',
		action: "disable",
		disabledReason:
			"HTTP 403 de limitation dan.me.uk : trois sources interrogeaient le même hôte. Doublon de danmeuk-torlist, conservée.",
	},
	{
		id: "feed:dan-me-uk:ip:aHR0cHM6",
		measured: "403 · 303 o · 0,10 s",
		cause: "URL identique à danmeuk-torlist (https://www.dan.me.uk/torlist/) : doublon strict, même quota de 30 min.",
		action: "disable",
		disabledReason: "Doublon strict de danmeuk-torlist (même URL) ; supprimé du polling pour respecter le quota de 30 minutes de dan.me.uk.",
	},
	{
		id: "ctlog",
		measured: "timeout 60 s · 0 o (?q=%25.domaine) ; 502 · 150 o (?Identity=…) ; 200 · 28 454 o · 1,79 s (?q=domaine sans joker)",
		cause: "la colonne url n'est pas un flux : le collecteur interroge crt.sh par domaine. La requête avec joker (%.) expire à 60 s et ?Identity renvoie 502 ; seule la requête sans joker aboutit.",
		action: "disable",
		disabledReason:
			"Source non HTTP (https://crt.sh/ est une page, pas un flux) : le collecteur ctlog interroge ?q=%.domaine&output=json, qui expire à 60 s (502 sur ?Identity=…). Correctif = code du collecteur, hors périmètre des sources.",
		note: "Désactiver la ligne supprime le faux état du tableau ; le collecteur code reste à corriger séparément.",
	},
	{
		id: "feed:abuse-ch:sslbl-sha256",
		measured: "200 · 845 945 o · 0,25 s",
		cause: "timeout du 10/11 09:20 non reproductible ; le CSV public abuse.ch se télécharge intégralement.",
		action: "keep",
	},
	{
		id: "feed:sentinelphishfeed:dns:aHR0cHM6",
		measured: "200 · 11 022 998 o · 1,38 s",
		cause: "timeout du 10/11 09:20 non reproductible (GitHub raw). 11 Mo restent sous le plafond de 25 Mo du collecteur.",
		action: "keep",
		note: "ips.txt des mêmes sources : 2 969 591 o en 5,53 s, également sous le délai de 20 s.",
	},
	{
		id: "feed:spydisec:ip:aHR0cHM6",
		measured: "200 · 13 965 441 o · 1,26 s",
		cause: "timeout du 10/11 09:20 non reproductible ; gros flux mais servi vite.",
		action: "keep",
	},
	{
		id: "feed:threatview-io:dns:aHR0cHM6",
		measured: "200 · 10 638 764 o · 6,05 s",
		cause: "« fetch failed » du 10/11 09:19 non reproductible ; 10,6 Mo en 6 s, sous le délai de 20 s de fetchResilient.",
		action: "keep",
		note: "Aucune colonne de délai par source n'existe : un timeout_ms dédié demanderait un ALTER TABLE + support du collecteur.",
	},
	{
		id: "hermes_radar_cyber",
		measured: "n/a (url = « box hermes / profil radar-cyber »)",
		cause: "URL non HTTP : la source est adossée au collecteur Hermes, pas au collecteur générique.",
		action: "disable",
		disabledReason:
			"URL non HTTP (« box hermes / profil radar-cyber ») : incompatible avec un collecteur HTTP. Le collecteur Hermes pousse ses événements, cette ligne ne doit pas être comptée dans le tableau de santé.",
	},
];

interface RowState {
	id: string;
	url: string;
	enabled: boolean;
	disabledReason: string | null;
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function pad(text: string, width: number): string {
	return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function proposedSql(repair: Repair): string[] {
	if (repair.action === "disable") {
		return [
			`UPDATE source SET enabled = false, disabled_at = now(), disabled_reason = ${repair.disabledReason ? `'${repair.disabledReason.replace(/'/g, "''")}'` : "NULL"} WHERE id = '${repair.id}';`,
		];
	}
	if (repair.action === "url" && repair.url) {
		return [`UPDATE source SET url = '${repair.url.replace(/'/g, "''")}' WHERE id = '${repair.id}';`];
	}
	return [];
}

async function loadStates(): Promise<Map<string, RowState>> {
	const { rows } = await query<RowState>(
		"SELECT id, url, enabled, disabled_reason AS \"disabledReason\" FROM source WHERE id = ANY($1::text[])",
		[REPAIRS.map((r) => r.id)]
	);
	return new Map(rows.map((row) => [row.id, row]));
}

async function applyRepairs(repairs: readonly Repair[]): Promise<void> {
	for (const repair of repairs) {
		if (repair.action === "keep") continue;
		const { rowCount } = await query(
			repair.action === "disable"
				? "UPDATE source SET enabled = false, disabled_at = now(), disabled_reason = $1 WHERE id = $2"
				: "UPDATE source SET url = $1 WHERE id = $2",
			repair.action === "disable" ? [repair.disabledReason ?? null, repair.id] : [repair.url ?? "", repair.id]
		);
		if (rowCount !== 1) {
			throw new Error(`source absente ou ambiguë : ${repair.id} (rowCount=${String(rowCount)})`);
		}
	}
}

async function main(): Promise<void> {
	const apply = process.argv.includes("--apply");
	const dryRun = !apply;

	const states = await loadStates();
	const missing = REPAIRS.filter((r) => !states.has(r.id));
	if (missing.length > 0) {
		throw new Error(`source(s) introuvable(s) en base : ${missing.map((r) => r.id).join(", ")}`);
	}

	const widths = REPAIRS.reduce(
		(acc, r) => ({
			id: Math.max(acc.id, r.id.length),
			cause: Math.min(70, Math.max(acc.cause, r.cause.length)),
		}),
		{ id: 6, cause: 5 }
	);

	console.log(`\n${dryRun ? "DRY-RUN" : "APPLY"} — ${REPAIRS.length} sources, ${REPAIRS.filter((r) => r.action === "disable").length} à désactiver, ${REPAIRS.filter((r) => r.action === "url").length} à réparer par URL\n`);
	console.log(`${pad("source", widths.id)}  ${pad("mesure", 40)}  ${pad("action", 8)} ${pad("cause", widths.cause)}`);
	console.log(`${"-".repeat(widths.id)}  ${"-".repeat(40)}  ${"-".repeat(8)} ${"-".repeat(widths.cause)}`);
	for (const repair of REPAIRS) {
		const state = states.get(repair.id);
		const action = repair.action === "keep" ? "garder" : repair.action;
		console.log(
			`${pad(repair.id, widths.id)}  ${pad(truncate(repair.measured, 40), 40)}  ${pad(action, 8)} ${truncate(repair.cause, widths.cause)}`
		);
		if (state && repair.action === "disable" && !state.enabled) {
			console.log(`${pad("", widths.id)}  déjà désactivée (${state.disabledReason ?? "sans motif"})`);
		}
		if (repair.note) console.log(`${pad("", widths.id)}  ↳ ${repair.note}`);
	}

	if (dryRun) {
		console.log("\nSQL qui serait exécuté (dry-run, rien n'est écrit) :");
		for (const repair of REPAIRS) {
			for (const statement of proposedSql(repair)) console.log(`  ${statement}`);
		}
		console.log("\nRelancer avec --apply pour écrire.\n");
		return;
	}

	await applyRepairs(REPAIRS);
	console.log("\nCorrections appliquées (aucune suppression de ligne).\n");
}

await main();
await closePools();
