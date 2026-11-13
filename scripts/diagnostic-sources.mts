/**
 * Diagnostic des sources muettes — chantier 14 du programme.
 *
 * Constat qui a coûté cher au projet : « une source muette n'est pas un
 * diagnostic ». 303 sources répondaient en 200 sans rien produire, et le
 * marqueur `last_ok_at` datait d'une collecte qui n'avait rien rendu. À
 * l'inverse, 60 sources « muettes » ont produit 2 046 événements à la première
 * relance : elles étaient périmées, pas cassées.
 *
 * Ce script ne relance rien. Il **classe** chaque source avec un motif écrit, et
 * surtout il distingue trois choses qu'on confondait :
 *
 *   1. l'échec **d'environnement** — un sandbox sans accès réseau produit
 *      « fetch failed » sur toutes les sources, y compris les meilleures. Le
 *      condamner serait une faute de jugement, pas un diagnostic ;
 *   2. l'échec **de la source** — un code HTTP, un certificat, une page retirée ;
 *   3. le **silence** — la source répond mais ne produit rien d'exploitable.
 *
 *   tsx scripts/diagnostic-sources.mts                    # tableau
 *   tsx scripts/diagnostic-sources.mts --json=out.json    # publication
 *
 * Lecture seule.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";

type Verdict =
	/** Produit au moins un événement : sa valeur se mesure ailleurs. */
	| "productive"
	/** Répond mais ne produit rien : le parsing est en cause, à diagnostiquer. */
	| "silencieuse"
	/** Échec qui vient de l'environnement d'exécution, pas de la source. */
	| "environnement"
	/** Échec imputable à la source : HTTP, certificat, contenu retiré. */
	| "erreur-source"
	/** Désactivée avec un motif écrit : état assumé. */
	| "desactivee"
	/** Jamais tentée, aucun historique. */
	| "jamais-tentee";

type Ligne = {
	id: string;
	name: string;
	family: string;
	enabled: boolean;
	evenements: number;
	verdict: Verdict;
	motif: string;
};

/**
 * Motifs d'échec qui viennent de la machine, pas de la source.
 *
 * Volontairement explicite : en environnement filtré, `fetch failed` est la
 * signature d'un accès réseau refusé. La confondre avec une panne de source
 * conduit à désactiver de bonnes sources — exactement ce qu'il ne faut pas.
 */
const SIGNATURES_ENVIRONNEMENT = [
	"fetch failed",
	"econnrefused",
	"enotfound",
	"eai_again",
	"etimedout",
	"network",
	"socket hang up",
	"getaddrinfo",
];

const SIGNATURES_SOURCE = [
	"http 4",
	"http 5",
	"certificate",
	"certificat",
	"unauthorized",
	"forbidden",
	"not found",
	"parse",
	"parser",
	"format non reconnu",
];

function classer(erreur: string | null, evenements: number, enabled: boolean, desactiveeMotif: string | null, jamaisOk: boolean): { verdict: Verdict; motif: string } {
	if (!enabled) {
		return { verdict: "desactivee", motif: desactiveeMotif ?? "désactivée sans motif écrit" };
	}
	if (!erreur && evenements > 0) return { verdict: "productive", motif: `${evenements} événement(s)` };
	const bas = (erreur ?? "").toLowerCase();
	const env = SIGNATURES_ENVIRONNEMENT.find((s) => bas.includes(s));
	if (env) {
		// Ce n'est pas la source qui a échoué : on le dit, et on s'arrête là.
		return {
			verdict: "environnement",
			motif: `échec d'accès réseau (« ${env} ») — non concluant sur la santé de la source`,
		};
	}
	const src = SIGNATURES_SOURCE.find((s) => bas.includes(s));
	if (src) return { verdict: "erreur-source", motif: `erreur de la source : ${erreur}` };
	if (erreur) return { verdict: "erreur-source", motif: `erreur non qualifiée : ${erreur}` };
	if (jamaisOk) return { verdict: "jamais-tentee", motif: "aucune tentative réussie enregistrée" };
	return { verdict: "silencieuse", motif: "répond mais ne produit rien — parsing à instruire" };
}

async function main(): Promise<void> {
	const { rows } = await query<{
		id: string;
		name: string;
		family: string;
		enabled: boolean;
		last_error: string | null;
		last_ok_at: string | null;
		disabled_reason: string | null;
		evenements: string;
	}>(
		`SELECT s.id, s.name, s.family, s.enabled, s.last_error, s.last_ok_at, s.disabled_reason,
		        count(e.id)::text AS evenements
		   FROM source s
		   LEFT JOIN event e ON e.source_id = s.id
		  GROUP BY s.id, s.name, s.family, s.enabled, s.last_error, s.last_ok_at, s.disabled_reason
		  ORDER BY s.id`,
	);

	const lignes: Ligne[] = rows.map((row) => {
		const evenements = Number(row.evenements);
		const { verdict, motif } = classer(
			row.last_error,
			evenements,
			row.enabled,
			row.disabled_reason,
			row.last_ok_at === null,
		);
		return {
			id: row.id,
			name: row.name,
			family: row.family,
			enabled: row.enabled,
			evenements,
			verdict,
			motif,
		};
	});

	const parVerdict = new Map<Verdict, Ligne[]>();
	for (const ligne of lignes) {
		const liste = parVerdict.get(ligne.verdict) ?? [];
		liste.push(ligne);
		parVerdict.set(ligne.verdict, liste);
	}

	const ordre: Verdict[] = [
		"productive",
		"silencieuse",
		"erreur-source",
		"environnement",
		"desactivee",
		"jamais-tentee",
	];

	console.log(`Diagnostic de ${lignes.length} sources — ${new Date().toISOString().slice(0, 10)}\n`);
	for (const verdict of ordre) {
		const liste = parVerdict.get(verdict) ?? [];
		if (liste.length === 0) continue;
		console.log(`${verdict.padEnd(14)} ${String(liste.length).padStart(4)}`);
	}

	const aInstruire = (parVerdict.get("silencieuse") ?? []).concat(parVerdict.get("erreur-source") ?? []);
	if (aInstruire.length > 0) {
		console.log(`\nÀ instruire (${aInstruire.length}) :`);
		for (const ligne of aInstruire.slice(0, 25)) {
			console.log(`  ${ligne.id.padEnd(32)} ${ligne.motif.slice(0, 70)}`);
		}
	}

	const environnement = parVerdict.get("environnement") ?? [];
	if (environnement.length > 0) {
		console.log(
			`\n${environnement.length} source(s) en échec d'ACCÈS RÉSEAU — ce n'est pas un diagnostic de santé.`,
		);
		console.log("  Relancer depuis un environnement non filtré avant de conclure quoi que ce soit.");
	}

	const synthese = {
		date: new Date().toISOString().slice(0, 10),
		total: lignes.length,
		parVerdict: Object.fromEntries(ordre.map((v) => [v, (parVerdict.get(v) ?? []).length])),
		avertissement:
			"Les sources en « environnement » ont échoué faute d'accès réseau depuis le poste de mesure. Leur état réel est inconnu.",
		sources: lignes,
	};

	const fichier = process.argv.find((a) => a.startsWith("--json="))?.split("=")[1];
	if (fichier) {
		writeFileSync(fichier, `${JSON.stringify(synthese, null, 2)}\n`, "utf8");
		console.log(`\ndiagnostic publié : ${fichier}`);
	}
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
