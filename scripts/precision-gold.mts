/**
 * S3.3 — le jeu d'or (vague précision) : 50 cas pièges qui doivent rester
 * justes quoi qu'il arrive.
 *
 * Tirés du corpus gelé (données réelles, verdicts avec preuve) : toutes les
 * partielles, tous les exacte fondés par le nom (les plus fragiles), un
 * échantillon des exacte par domaine, des indécidables représentatifs, des
 * hors_sujet qui survivent aux règles, et des hors_sujet que les règles
 * écartent. Chaque cas épingle :
 *
 *   - le verdict attendu (exacte, partielle, hors_sujet, indecidable) ;
 *   - le comportement attendu du jeu de règles S2/S3 : « conserve » (le
 *     rattachement est produit) ou « ecartee » (la règle l'élimine).
 *
 * Le vérificateur (`--verifier`) rejoue les règles sur chaque cas et échoue
 * au premier écart : un verdict qui bouge, un rattachement conservé qui
 * devient écarté (ou l'inverse) = le jeu d'or est cassé, la modification
 * qui l'a cassé ne passe pas (S5.2 le branchera dans verify-all).
 *
 * Rejouer :
 *
 *   tsx scripts/precision-gold.mts --verifier
 */
import { readFileSync } from "node:fs";
import { closePools } from "../apps/api/src/db.js";
import { normalizeName, GENERIC_TOKENS } from "../apps/api/src/quarantine/promote.js";

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

const CORPUS = option("corpus") ?? "bench/precision/corpus-v1.json";
const GOLD = option("gold") ?? "bench/precision/gold-v1.json";
const SORTIE = option("json") ?? "bench/results/precision-gold.json";

type Entree = {
	ordre: number;
	indice: string;
	strate: string;
	confiance: number;
	via: string;
	type: string;
	org: { id: number; name: string };
	verdict: null | { verdict: string };
};

type CasOr = {
	ordreCorpus: number;
	indice: string;
	orgId: number;
	orgName: string;
	verdictAttendu: string;
	comportementAttendu: "conserve" | "ecartee";
	regleResponsable: string | null;
	strate: string;
};

/** Les règles du jeu complet S2/S3 (mêmes prédicats que precision-regles). */
function jetons(texte: string): Set<string> {
	return new Set(
		normalizeName(texte)
			.split(" ")
			.filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t)),
	);
}
function elimineRegles(e: { indice: string; via: string; confiance: number; org: { name: string } }): string | null {
	if (/\*|\?\?/.test(e.indice)) return "3-masquage";
	if (e.via === "name" && e.confiance === 0.7) return "1-sigle";
	if (/hacked|leaked|data leak|disclosed|\d\s?(gb|tb)\b|file tree|announcement|will be leaked|you are welcome|welcome in our chat|part \d/i.test(e.indice) && e.via !== "domain")
		return "4-commentaire";
	if (e.confiance === 0.6) return "6-ville";
	if (e.via === "name" && e.confiance === 0.75) {
		const ji = jetons(e.indice);
		const jo = jetons(e.org.name);
		for (const t of ji) {
			if (!jo.has(t)) return "2-homonyme";
		}
	}
	return null;
}

const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as { entrees: Entree[] };
const parOrdre = new Map(corpus.entrees.map((e) => [e.ordre, e]));

if (argv.includes("--verifier")) {
	const gold = JSON.parse(readFileSync(GOLD, "utf8")) as { cas: CasOr[] };
	let echecs = 0;
	for (const cas of gold.cas) {
		const e = parOrdre.get(cas.ordreCorpus);
		if (!e) {
			console.error(`PIÈGE cassé (cas absent du corpus) : #${cas.ordreCorpus}`);
			echecs++;
			continue;
		}
		const regle = elimineRegles(e);
		const comportement: "conserve" | "ecartee" = regle === null ? "conserve" : "ecartee";
		if (comportement !== cas.comportementAttendu) {
			console.error(
				`PIÈGE cassé #${cas.ordreCorpus} « ${cas.indice.slice(0, 50)} » : attendu ${cas.comportementAttendu}${cas.regleResponsable ? ` (${cas.regleResponsable})` : ""}, obtenu ${comportement}${regle ? ` (${regle})` : ""}`,
			);
			echecs++;
			continue;
		}
		const verdictActuel = e.verdict?.verdict ?? null;
		if (verdictActuel !== cas.verdictAttendu) {
			console.error(
				`PIÈGE cassé #${cas.ordreCorpus} « ${cas.indice.slice(0, 50)} » : verdict attendu ${cas.verdictAttendu}, obtenu ${verdictActuel}`,
			);
			echecs++;
		}
	}
	console.log(`Jeu d'or : ${gold.cas.length - echecs}/${gold.cas.length} cas justes`);
	if (echecs > 0) {
		console.error(`JEU D'OR CASSÉ : ${echecs} cas.`);
		process.exitCode = 1;
	}
	await closePools();
} else {
	// Construction du jeu d'or (une fois, commité ; le vérificateur rejoue).
	// mulberry32, graine 20261220 — échantillon documenté et reproductible.
	function mulberry32(graine: number): () => number {
		let a = graine >>> 0;
		return () => {
			a |= 0;
			a = (a + 0x6d2b79f5) | 0;
			let t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}
	const prochain = mulberry32(20261220);
	function piocher(liste: Entree[], n: number): Entree[] {
		const copie = [...liste];
		for (let i = copie.length - 1; i > 0; i--) {
			const j = Math.floor(prochain() * (i + 1));
			[copie[i], copie[j]] = [copie[j] as Entree, copie[i] as Entree];
		}
		return copie.slice(0, n);
	}

	const verifiees = corpus.entrees.filter((e) => e.verdict);
	const parVerdict = (v: string): Entree[] => verifiees.filter((e) => e.verdict?.verdict === v);

	const choix: Entree[] = [];
	const pris = new Set<number>();
	const prendre = (liste: Entree[]): void => {
		for (const e of liste) {
			if (!pris.has(e.ordre)) {
				pris.add(e.ordre);
				choix.push(e);
			}
		}
	};
	// Toutes les partielles : la catégorie la plus fragile (règle 2 en a
	// cassé une — les 4 restantes doivent rester).
	prendre(parVerdict("partielle"));
	// Tous les exacte fondés par le nom (3) : la voie la plus fragile des
	// exactes face aux règles.
	prendre(parVerdict("exacte").filter((e) => e.via === "name"));
	// Exacte par domaine : 10 tirés sur les strates domaine (le gros des vrais).
	prendre(piocher(parVerdict("exacte").filter((e) => e.via === "domain"), 10));
	// Indécidables représentatifs : 10 (égalités de nom sans site — la voie
	// de revue, pas une règle).
	prendre(piocher(parVerdict("indecidable"), 10));
	// Hors_sujet qui survivent aux règles (7) : le résidu homonyme — ces cas
	// doivent RESTER hors_sujet et conservés par les règles.
	const hsSurvivants = parVerdict("hors_sujet").filter((e) => elimineRegles(e) === null);
	prendre(hsSurvivants.slice(0, 7));
	// Hors_sujet écartés : 3 par règle responsable (1-sigle, 2-homonyme,
	// 3-masquage, 4-commentaire, 6-ville) — le comportement attendu est
	// l'élimination.
	const hsEcartes = parVerdict("hors_sujet").filter((e) => elimineRegles(e) !== null);
	for (const regle of ["1-sigle", "2-homonyme", "3-masquage", "4-commentaire", "6-ville"]) {
		prendre(piocher(hsEcartes.filter((e) => elimineRegles(e) === regle), 3));
	}

	const cas: CasOr[] = choix.map((e) => ({
		ordreCorpus: e.ordre,
		indice: e.indice,
		orgId: e.org.id,
		orgName: e.org.name,
		verdictAttendu: e.verdict?.verdict as string,
		comportementAttendu: elimineRegles(e) === null ? "conserve" : "ecartee",
		regleResponsable: elimineRegles(e),
		strate: e.strate,
	}));

	const sortie = {
		vague: "precision",
		etape: "S3.3",
		date: new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date()),
		fichierSource: "bench/precision/corpus-v1.json (gelé)",
		protocole:
			"50 cas pièges tirés du corpus gelé (PRNG mulberry32, graine 20261220, échantillon documenté) : toutes les partielles, tous les exacte par nom, 15 exacte par domaine, 10 indécidables, 7 hors_sujet survivants, 15 hors_sujet écartés (3 par règle). Chaque cas épingle un verdict et un comportement de règles",
		effectifs: cas.reduce((acc, c) => {
			const cle = `${c.verdictAttendu}/${c.comportementAttendu}`;
			acc[cle] = (acc[cle] ?? 0) + 1;
			return acc;
		}, {} as Record<string, number>),
		cas,
	};
	const fs = await import("node:fs");
	fs.writeFileSync(GOLD, JSON.stringify(sortie, null, "\t") + "\n");
	console.log(`Jeu d'or écrit : ${GOLD} (${cas.length} cas)`);
	console.log("effectifs verdict/comportement:", sortie.effectifs);
	await closePools();
}
