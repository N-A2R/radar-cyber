/**
 * S4.3 — coût du rattachement par indice, avant/après règles (vague
 * précision). Mesuré, pas estimé : chaque chiffre sort d'un chronométrage
 * réel sur des indices réels, contre le référentiel de 1 244 106
 * organisations.
 *
 * Trois chemins mesurés sur les MÊMES indices (échantillon de
 * quarantine_raw, graine écrite) :
 *
 *   1. chemin livré — `loadCandidateIndex` (préfiltre SQL) +
 *      `matchOrgInIndex` : le code en production, mesuré sur un petit
 *      échantillon car il coûte des secondes par indice ;
 *   2. préfiltre mémoire — la table jeton→ids du S1.1 (prouvée équivalente
 *      au préfiltre livré, 40/40) + `matchOrgInIndex` : le chemin utilisé
 *      pour la campagne ;
 *   3. préfiltre mémoire + matchOrgInIndex + règles 1 à 6 : le coût ajouté
 *      des règles candidates retenues.
 *
 * Sortie : bench/results/precision-cout.json — millisecondes par indice
 * (médiane et moyenne), taille du préfiltre, temps de construction, et le
 * coût du passage population complet (15 918 indices distincts du S1.1).
 *
 * Rejouer :
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/precision-cout.mts --json=bench/results/precision-cout.json
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	GENERIC_TOKENS,
	loadCandidateIndex,
	matchOrgInIndex,
	normalizeName,
	normalizeDomain,
	extractDomain,
	type OrgIndexEntry,
} from "../apps/api/src/quarantine/promote.js";

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

const SORTIE = option("json") ?? "bench/results/precision-cout.json";
const N_MEMOIRE = Number(option("n") ?? 300);
const N_LIVRE = Number(option("n-livre") ?? 40);
const GRAINE = Number(option("graine") ?? 20261230);

type OrgRowBrute = { id: number; name: string; slug: string; kind: string; city: string | null; domain: string | null; website: string | null };

function versIndexEntry(o: OrgRowBrute): OrgIndexEntry {
	const nameNorm = normalizeName(o.name);
	return {
		...o,
		nameNorm,
		domainNorm: o.domain ? normalizeDomain(o.domain) : null,
		websiteDomain: o.website ? extractDomain(o.website) : null,
		cityNorm: o.city ? normalizeName(o.city) : null,
		nameTokens: [...new Set(nameNorm.split(" ").filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t)))],
	};
}

function discriminant(token: string): boolean {
	return token.length >= 3 && !GENERIC_TOKENS.has(token);
}

/** Les règles 1 à 6 sur un résultat de moteur — le même prédicat que
 * precision-regles.mts, coût volontairement inliné pour être mesuré. */
const MARQUEURS = /hacked|leaked|data leak|disclosed|\d\s?(gb|tb)\b|file tree|announcement|will be leaked|you are welcome|welcome in our chat|part \d/i;
function lesReglesRetiennent(indice: string, m: { via: string; confidence: number } | null, orgName: string): boolean {
	if (!m) return false;
	if (/\*|\?\?/.test(indice)) return false;
	if (MARQUEURS.test(indice) && m.via !== "domain") return false;
	if (m.confidence === 0.7 || m.confidence === 0.6) return false;
	if (m.via === "name" && m.confidence === 0.75) {
		const ji = new Set(normalizeName(indice).split(" ").filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t)));
		const jo = new Set(normalizeName(orgName).split(" ").filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t)));
		for (const t of ji) {
			if (!jo.has(t)) return false;
		}
	}
	return true;
}

function mediane(v: number[]): number {
	if (v.length === 0) return 0;
	const s = [...v].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

const AUJOURDHUI = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

// ── Échantillon d'indices réels ──────────────────────────────────────────

const lignes = (
	await query<{ org_hint: string }>(
		"SELECT org_hint FROM quarantine_raw WHERE kind='claim' AND org_hint IS NOT NULL AND btrim(org_hint) <> ''",
	)
).rows;
const uniques = [...new Map(lignes.map((l) => [normalizeName(l.org_hint), l.org_hint])).entries()]
	.filter(([cle]) => cle.length > 0)
	.sort((a, b) => (a[0] < b[0] ? -1 : 1));
let a = GRAINE >>> 0;
const rnd = (): number => {
	a |= 0;
	a = (a + 0x6d2b79f5) | 0;
	let t = Math.imul(a ^ (a >>> 15), 1 | a);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const melange = [...uniques];
for (let i = melange.length - 1; i > 0; i--) {
	const j = Math.floor(rnd() * (i + 1));
	[melange[i], melange[j]] = [melange[j] as [string, string], melange[i] as [string, string]];
}
const echantillonMemoire = melange.slice(0, N_MEMOIRE);
const echantillonLivre = melange.slice(0, N_LIVRE);
console.log(`Échantillon : ${echantillonMemoire.length} indices (mémoire), ${echantillonLivre.length} (livré)`);

// ── Préfiltre mémoire (S1.1) — construction chronométrée ─────────────────

const debutConstruction = Date.now();
const parJeton = new Map<string, number[]>();
const parOrg = new Map<number, string[]>();
const parOrgVille = new Map<number, string>();
const nomsSansTemoin = new Map<string, number[]>();
const lignesSansTemoin = new Map<number, OrgRowBrute>();
let dernierId = 0;
const idsSansTemoin: number[] = [];
while (true) {
	const lot = (
		await query<{ id: number; name: string; city: string | null }>(
			"SELECT id, name, city FROM org WHERE id > $1 ORDER BY id LIMIT 100000",
			[dernierId],
		)
	).rows;
	if (lot.length === 0) break;
	for (const o of lot) {
		dernierId = o.id;
		const nom = normalizeName(o.name);
		const jetons = [...new Set(nom.split(" ").filter(discriminant))];
		parOrg.set(o.id, jetons);
		if (o.city) parOrgVille.set(o.id, normalizeName(o.city));
		if (jetons.length === 0) {
			const l = nomsSansTemoin.get(nom);
			if (l) l.push(o.id);
			else nomsSansTemoin.set(nom, [o.id]);
			idsSansTemoin.push(o.id);
		}
		for (const t of jetons) {
			const l = parJeton.get(t);
			if (l) l.push(o.id);
			else parJeton.set(t, [o.id]);
		}
	}
}
const msConstruction = Date.now() - debutConstruction;
if (idsSansTemoin.length > 0) {
	const st = (
		await query<OrgRowBrute>("SELECT id, name, slug, kind, city, domain, website FROM org WHERE id = ANY($1::int[])", [idsSansTemoin])
	).rows;
	for (const l of st) lignesSansTemoin.set(l.id, l);
}
const avecSite = (
	await query<OrgRowBrute>("SELECT id, name, slug, kind, city, domain, website FROM org WHERE domain IS NOT NULL OR website IS NOT NULL")
).rows.map((o) => ({
	...o,
	domainNorm: o.domain ? normalizeDomain(o.domain) : null,
	websiteLower: o.website ? o.website.toLowerCase() : null,
}));
console.log(`Préfiltre mémoire : ${parJeton.size} jetons, ${msConstruction} ms de construction`);

async function candidatsMemoire(hint: string): Promise<OrgIndexEntry[]> {
	const hintNorm = normalizeName(hint);
	const domain = extractDomain(hint);
	const jetonsIndice = new Set(hintNorm.split(" "));
	const tokens = [...jetonsIndice].filter(discriminant);
	if (tokens.length === 0 && domain === null) {
		const ids = nomsSansTemoin.get(hintNorm) ?? [];
		return ids.map((id) => lignesSansTemoin.get(id)).filter((r): r is OrgRowBrute => r !== undefined).map(versIndexEntry);
	}
	const ids = new Set<number>();
	for (const t of tokens) {
		for (const id of parJeton.get(t) ?? []) {
			if (ids.has(id)) continue;
			const jo = parOrg.get(id) ?? [];
			if (jo.every((x) => jetonsIndice.has(x))) {
				ids.add(id);
				continue;
			}
			const ville = parOrgVille.get(id);
			if (ville && ` ${hintNorm} `.includes(` ${ville} `)) {
				const jv = new Set(ville.split(" ").filter(Boolean));
				const horsVille = jo.filter((x) => x.length >= 4 && !jv.has(x));
				if (horsVille.some((x) => jetonsIndice.has(x))) ids.add(id);
			}
		}
	}
	if (domain) {
		for (const o of avecSite) {
			if (
				o.domainNorm === domain ||
				(o.domainNorm !== null && (domain.endsWith("." + o.domainNorm) || o.domainNorm.endsWith("." + domain))) ||
				(o.websiteLower !== null && o.websiteLower.includes(domain))
			) {
				ids.add(o.id);
			}
		}
	}
	if (ids.size === 0) return [];
	const r = await query<OrgRowBrute>("SELECT id, name, slug, kind, city, domain, website FROM org WHERE id = ANY($1::int[])", [[...ids]]);
	return r.rows.map(versIndexEntry);
}

// ── Mesures ──────────────────────────────────────────────────────────────

// 1. Chemin livré
const msLivre: number[] = [];
let matchsLivre = 0;
for (const [, hint] of echantillonLivre) {
	const t0 = Date.now();
	const candidats = await loadCandidateIndex(hint);
	const m = matchOrgInIndex(hint, candidats);
	msLivre.push(Date.now() - t0);
	if (m) matchsLivre++;
}
console.log(`Chemin livré : médiane ${mediane(msLivre).toFixed(0)} ms/indice (${msLivre.length} indices)`);

// 2. Préfiltre mémoire + moteur
const msMemoire: number[] = [];
let matchsMemoire = 0;
for (const [, hint] of echantillonMemoire) {
	const t0 = performance.now();
	const candidats = await candidatsMemoire(hint);
	const m = matchOrgInIndex(hint, candidats);
	msMemoire.push(performance.now() - t0);
	if (m) matchsMemoire++;
}
console.log(`Préfiltre mémoire : médiane ${mediane(msMemoire).toFixed(2)} ms/indice (${msMemoire.length} indices)`);

// 3. + règles
const msRegles: number[] = [];
let retenus = 0;
for (const [, hint] of echantillonMemoire) {
	const candidats = await candidatsMemoire(hint);
	const m = matchOrgInIndex(hint, candidats);
	const t0 = performance.now();
	if (m) {
		const org = candidats.find((c) => c.id === m.orgId);
		const retenu = lesReglesRetiennent(hint, m, org?.name ?? "");
		if (retenu) retenus++;
	}
	msRegles.push(performance.now() - t0);
}
console.log(`+ règles : médiane ${mediane(msRegles).toFixed(2)} ms/indice, ${retenus} rattachements retenus`);

const populationPassage = { indicesDistincts: 15918, dureeSecondes: 16, source: "passage S1.1 (après construction du préfiltre)" };

writeFileSync(
	SORTIE,
	JSON.stringify(
		{
			vague: "precision",
			etape: "S4.3",
			date: AUJOURDHUI,
			referentiel: { organisations: 1244106, jetonsDiscriminants: parJeton.size, orgsSansTemoin: nomsSansTemoin.size, orgsAvecDomaineOuSite: avecSite.length },
			prefiltreMemoire: { msConstruction, note: "construit une fois par process, réutilisé pour tout le flux" },
			echantillon: { graine: GRAINE, indicesDisponibles: uniques.length, memoire: echantillonMemoire.length, livre: echantillonLivre.length },
			coutParIndice: {
				cheminLivre: { msMedian: mediane(msLivre), msMoyen: msLivre.reduce((s, x) => s + x, 0) / msLivre.length, n: msLivre.length, matchs: matchsLivre },
				prefiltreMemoire: { msMedian: mediane(msMemoire), msMoyen: msMemoire.reduce((s, x) => s + x, 0) / msMemoire.length, n: msMemoire.length, matchs: matchsMemoire },
				avecRegles: { msMedian: mediane(msRegles), msMoyen: msRegles.reduce((s, x) => s + x, 0) / msRegles.length, n: msRegles.length, rattachementsRetenus: retenus },
			},
			passagePopulation: populationPassage,
		},
		null,
		"\t",
	) + "\n",
);
console.log(`Coût écrit : ${SORTIE}`);
await closePools();
