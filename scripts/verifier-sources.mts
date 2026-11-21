/**
 * Vérifie les sources du corpus de presse de Nouvelle-Aquitaine.
 *
 * Pour chaque source du JSONL, recharge réellement l'URL (redirections suivies
 * manuellement, cookies conservés — nécessaire pour Sud Ouest qui protège ses
 * flux par un testimonial anti-bot), puis classe la source en :
 *
 *   - valide        : HTTP 2xx/3xx et contenu exploitable (texte HTML, items
 *                     RSS/Atom, ou PDF lisible) ;
 *   - sans contenu  : HTTP 2xx/3xx mais corps vide, page sans texte ou flux
 *                     sans item ;
 *   - morte         : erreur réseau, timeout, HTTP >= 400 ou redirection
 *                     circulaire non résolue.
 *
 * Usage :
 *   tsx scripts/verifier-sources.mts
 *   tsx scripts/verifier-sources.mts --input=bench/corpus/presse.jsonl \
 *       --json=/tmp/verification.json --concurrency=8 --timeout=15000
 *   tsx scripts/verifier-sources.mts --strict   # code 1 si une source est invalide
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Verdict = "valide" | "sans contenu" | "morte";

interface Source {
	nom: string;
	url: string;
	famille: string;
	departements: string[];
	[x: string]: unknown;
}

interface Resultat {
	nom: string;
	url: string;
	famille: string;
	departements: string[];
	verdict: Verdict;
	preuve: {
		http_status: number | null;
		verifie_le: string;
		octets: number;
		type: string | null;
		titre: string | null;
		extrait: string | null;
		items?: number;
		url_finale?: string;
		redirections?: number;
		erreur?: string;
	};
}

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string =>
	argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const INPUT = arg("input", fileURLToPath(new URL("../bench/corpus/presse.jsonl", import.meta.url)));
const JSON_OUT = argv.find((a) => a.startsWith("--json="))?.slice(7);
const CONCURRENCY = Number(arg("concurrency", "8"));
const TIMEOUT = Number(arg("timeout", "15000"));
const STRICT = argv.includes("--strict");
const UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
	"Chrome/131.0.0.0 Safari/537.36";

function parseSources(path: string): Source[] {
	return readFileSync(path, "utf8")
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"))
		.map((l) => {
			const o = JSON.parse(l) as Record<string, unknown>;
			const dept = o.departements ?? o.departement ?? o.departement_couvert ?? "Inconnu";
			return {
				...(o as unknown as Source),
				nom: String(o.nom ?? o.source ?? o.name ?? "(sans nom)"),
				url: String(o.url ?? o.url_flux ?? ""),
				famille: String(o.famille ?? o.family ?? "inconnue"),
				departements: (Array.isArray(dept) ? dept : [dept]).map(String),
			} satisfies Source;
		});
}

function decodeEntities(s: string): string {
	return s
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&nbsp;|&#160;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&quot;|&apos;|&#39;|&#x27;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
		.replace(/<[^>]*>/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

interface Reponse {
	status: number;
	body: Uint8Array;
	type: string | null;
	urlFinale: string;
	redirections: number;
	cookies: Map<string, string>;
}

/** Un chargement : redirections manuelles, cookies accumulés, limite de sauts. */
async function charger(
	urlDepart: string,
	cookies: Map<string, string>,
	signal: AbortSignal,
): Promise<Reponse> {
	let url = urlDepart;
	let redirections = 0;
	for (;;) {
		const headers: Record<string, string> = {
			"user-agent": UA,
			accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
			"accept-language": "fr-FR,fr;q=0.9,en;q=0.6",
		};
		if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
		const rep = await fetch(url, { redirect: "manual", headers, signal });
		redirections++;
		for (const raw of rep.headers.getSetCookie()) {
			const couple = raw.split(";")[0];
			const i = couple.indexOf("=");
			if (i > 0) cookies.set(couple.slice(0, i).trim(), couple.slice(i + 1).trim());
		}
		const statut = rep.status;
		if (statut >= 300 && statut < 400 && rep.headers.get("location")) {
			const suivante = new URL(rep.headers.get("location")!, url).toString();
			// Certains sites anti-bot (Sud Ouest) renvoient vers eux-mêmes tant
			// que le cookie de visite n'est pas rejoué : on tente une seconde
			// passe avec le cookie fraîchement reçu avant de déclarer forfait.
			if (suivante === url && cookies.size) {
				const relance = await fetch(urlDepart, {
					redirect: "manual",
					headers: {
						...headers,
						cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
					},
					signal,
				});
				for (const raw of relance.headers.getSetCookie()) {
					const couple = raw.split(";")[0];
					const i = couple.indexOf("=");
					if (i > 0) cookies.set(couple.slice(0, i).trim(), couple.slice(i + 1).trim());
				}
				if (relance.status < 300) {
					return {
						status: relance.status,
						body: new Uint8Array(await relance.arrayBuffer()),
						type: relance.headers.get("content-type"),
						urlFinale: urlDepart,
						redirections: redirections + 1,
						cookies,
					};
				}
				if (relance.headers.get("location")) {
					url = new URL(relance.headers.get("location")!, urlDepart).toString();
					continue;
				}
				return {
					status: relance.status,
					body: new Uint8Array(await relance.arrayBuffer()),
					type: relance.headers.get("content-type"),
					urlFinale: urlDepart,
					redirections: redirections + 1,
					cookies,
				};
			}
			url = suivante;
			if (redirections > 8) {
				throw new Error(`redirection circulaire (${redirections} sauts)`);
			}
			continue;
		}
		return {
			status: statut,
			body: new Uint8Array(await rep.arrayBuffer()),
			type: rep.headers.get("content-type"),
			urlFinale: url,
			redirections,
			cookies,
		};
	}
}

function analyser(rep: Reponse): Pick<Resultat, "verdict" | "preuve"> {
	const type = rep.type ?? "";
	const octets = rep.body.byteLength;
	const premiere = new TextDecoder("utf-8", { fatal: false }).decode(rep.body.subarray(0, 400000));
	const today = new Date().toISOString().slice(0, 10);
	const base = {
		http_status: rep.status,
		verifie_le: today,
		octets,
		type: rep.type,
		titre: null as string | null,
		extrait: null as string | null,
		url_finale: rep.urlFinale,
		redirections: rep.redirections,
	};
	if (rep.status >= 400 || rep.status === 0) {
		return { verdict: "morte", preuve: { ...base, erreur: `HTTP ${rep.status}` } };
	}
	if (octets < 256) {
		return { verdict: "sans contenu", preuve: { ...base, erreur: "corps trop court" } };
	}

	const titreMatch = premiere.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const titre = titreMatch ? decodeEntities(titreMatch[1]).slice(0, 240) : null;
	const items = (premiere.match(/<(item|entry)\b/gi) ?? []).length;
	// Une page HTML peut embarquer la chaîne « <feed » dans un script : on ne
	// parle de flux que si le type annoncé ET la racine du document sont XML.
	const debut = premiere.replace(/^\uFEFF/, "").trimStart();
	const estFlux = /xml|rss|atom/i.test(type) &&
		(/^<\?xml/i.test(debut) || /^<rss[\s>]/i.test(debut) || /^<feed[\s>]/i.test(debut));

	if (estFlux && items > 0) {
		const first = premiere.match(/<(?:item|entry)[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);
		return {
			verdict: "valide",
			preuve: { ...base, titre: titre ?? "Flux RSS/Atom", extrait: decodeEntities(first?.[1] ?? "").slice(0, 240) || null, items },
		};
	}
	if (estFlux) {
		return { verdict: "sans contenu", preuve: { ...base, titre, items: 0, erreur: "flux sans item" } };
	}
	if (type.includes("pdf") || premiere.startsWith("%PDF")) {
		const extrait = decodeEntities(premiere.replace(/%PDF-[\d.]+/, "").slice(0, 2000)).slice(0, 240);
		return { verdict: octets > 1000 ? "valide" : "sans contenu", preuve: { ...base, titre: titre ?? extrait.slice(0, 120), extrait } };
	}
	// HTML : on retire scripts/styles/balises avant de mesurer le texte utile.
	const texte = decodeEntities(
		premiere.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "),
	);
	if (texte.length < 120) {
		return { verdict: "sans contenu", preuve: { ...base, titre, extrait: texte.slice(0, 200) || null, erreur: "aucun texte exploitable" } };
	}
	return {
		verdict: "valide",
		preuve: { ...base, titre, extrait: texte.slice(0, 240) || null },
	};
}

async function verifier(source: Source): Promise<Resultat> {
	const base: Resultat = {
		nom: source.nom,
		url: source.url,
		famille: source.famille,
		departements: source.departements,
		verdict: "morte",
		preuve: {
			http_status: null,
			verifie_le: new Date().toISOString().slice(0, 10),
			octets: 0,
			type: null,
			titre: null,
			extrait: null,
		},
	};
	if (!source.url) return { ...base, preuve: { ...base.preuve, erreur: "URL absente" } };
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT);
		try {
			const rep = await charger(source.url, new Map(), controller.signal);
			return { ...base, ...analyser(rep) };
		} finally {
			clearTimeout(timer);
		}
	} catch (e) {
		return {
			...base,
			preuve: { ...base.preuve, erreur: e instanceof Error ? e.message : String(e) },
		};
	}
}


async function main(): Promise<void> {
	const sources = parseSources(INPUT);
	console.log(`vérification de ${sources.length} sources (${INPUT})`);
	const resultats: Resultat[] = new Array(sources.length);
	let curseur = 0;
	async function ouvrier(): Promise<void> {
		for (;;) {
			const i = curseur++;
			if (i >= sources.length) return;
			const r = await verifier(sources[i]);
			resultats[i] = r;
			const p = r.preuve;
			console.log(
				`${r.verdict.toUpperCase().padEnd(12)} | ${r.famille.padEnd(13)} | ` +
					`${r.departements.join(",").padEnd(28)} | ${r.nom.slice(0, 55).padEnd(55)} | ` +
					`${p.http_status ?? "-"} ${p.octets}o ${p.type ?? ""} ${p.erreur ?? ""}`,
			);
		}
	}
	await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, ouvrier));

	const total = resultats.length;
	const comptes: Record<Verdict, number> = { valide: 0, "sans contenu": 0, morte: 0 };
	const familles = new Map<string, Record<Verdict, number>>();
	const departements = new Map<string, Record<Verdict, number>>();

	for (const r of resultats) {
		comptes[r.verdict]++;
		for (const [map, cle] of [
			[familles, r.famille],
			...(r.departements.map((d) => [departements, d]) as [Map<string, Record<Verdict, number>>, string][]),
		] as [Map<string, Record<Verdict, number>>, string][]) {
			const c = map.get(cle) ?? { valide: 0, "sans contenu": 0, morte: 0 };
			c[r.verdict]++;
			map.set(cle, c);
		}
	}
	const taux = total ? ((comptes.valide / total) * 100).toFixed(1) : "0.0";
	console.log(`\n=== BILAN ===`);
	console.log(`total ${total} | valides ${comptes.valide} | sans contenu ${comptes["sans contenu"]} | mortes ${comptes.morte} | taux de validité ${taux} %`);
	for (const [titre, m] of [["FAMILLE", familles], ["DÉPARTEMENT", departements]] as const) {
		console.log(`\n${titre}`);
		for (const [cle, c] of [...m].sort((a, b) => a[0].localeCompare(b[0], "fr"))) {
			console.log(`  ${cle.padEnd(30)} ${String(c.valide).padStart(3)} valides / ${String(c["sans contenu"]).padStart(2)} vides / ${String(c.morte).padStart(2)} mortes`);
		}
	}
	if (JSON_OUT) {
		writeFileSync(JSON_OUT, JSON.stringify(resultats, null, 2));
		console.log(`\nrapport JSON : ${JSON_OUT}`);
	}
	if (STRICT && comptes.valide !== total) process.exitCode = 1;
}

await main();
