#!/usr/bin/env -S npx tsx
/**
 * Corpus « organisations de Charente sans domaine » : proposition et contrôle
 * HTTP de domaines municipaux déduits du nom de l'organisation.
 *
 *   apps/api/node_modules/.bin/tsx scripts/corpus-orgs-dept.mts [--limit=N] [--appliquer]
 *
 * Défaut : rapport seul, AUCUNE écriture en base. `--appliquer` est la seule
 * porte d'écriture (UPDATE org.domain, avec garde « domaine vide »).
 *
 * Méthode :
 *  1. les communes viennent du référentiel versionné `db/data/referentiel-na.json`
 *     (département 16, communes actuelles, déléguées et associées) ;
 *  2. sont examinées les organisations du département 16 dont le nom contient
 *     une de ces communes et qui n'ont ni domaine ni site renseigné ;
 *  3. seules les organisations dont le nom désigne explicitement la commune
 *     (« Commune de X », « Mairie de X », « Ville de X ») donnent lieu à une
 *     vérification réseau — ni les EPCI, ni les commerces homonymes, ni les
 *     simples noms de commune en majuscules ne se voient attribuer un site ;
 *  4. deux candidats par commune : `ville-<commune>.fr` et `mairie-<commune>.fr`.
 *     Un candidat n'est confirmé que sur HTTP 200 final, avec un hôte final
 *     cohérent (domaine .fr contenant le nom de la commune) et un contenu
 *     municipal parlant de la commune avec une ancre locale (Charente ou code
 *     postal du référentiel) — jamais sur un simple « ça résout ».
 *
 * Le rapport JSON est affiché sur stdout et écrit dans bench/results/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReferentielNA } from "../apps/api/src/referentiel/model.js";

const BASE_TEST = "postgres://radar:radar@localhost:5433/radar";
process.env.DATABASE_URL = BASE_TEST;

const { query, withTransaction, closePools } = await import("../apps/api/src/db.js");

const SORTIE = fileURLToPath(new URL("../bench/results/orgs-charente-domaines.json", import.meta.url));
const REFERENTIEL = fileURLToPath(new URL("../db/data/referentiel-na.json", import.meta.url));
const DEPARTEMENT = "16";
const CONCURRENCE = 8;
const TIMEOUT_MS = 9000;
const MAX_OCTETS = 500_000;
const UA = "Mozilla/5.0 (X11; Linux x86_64) radar-corpus-charente/1.0";

function usage(): never {
	console.error(
		"usage : apps/api/node_modules/.bin/tsx scripts/corpus-orgs-dept.mts [--limit=N] [--appliquer]\n" +
			"  défaut     : rapport JSON seul, aucune écriture en base\n" +
			"  --limit=N  : plafonner le nombre d'organisations examinées (smoke test)\n" +
			"  --appliquer: écrire les domaines confirmés dans org.domain",
	);
	process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
	console.log(
		"usage : apps/api/node_modules/.bin/tsx scripts/corpus-orgs-dept.mts [--limit=N] [--appliquer]",
	);
	process.exit(0);
}
const appliquer = args.includes("--appliquer");
let limite: number | null = null;
for (const arg of args) {
	if (arg === "--appliquer") continue;
	if (arg.startsWith("--limit=")) {
		const valeur = Number(arg.slice("--limit=".length));
		if (!Number.isInteger(valeur) || valeur < 1) {
			console.error("--limit doit être un entier >= 1");
			usage();
		}
		limite = valeur;
		continue;
	}
	console.error(`argument inconnu : ${arg}`);
	usage();
}

type Commune = { code: string; nom: string; variantes: string[]; slug: string; codesPostaux: string[] };
type Org = {
	id: number;
	name: string;
	kind: string;
	city: string | null;
	domain: string | null;
	website: string | null;
	name_norm: string | null;
};
type Tentative = {
	domaine: string;
	http: number | null;
	url_finale: string | null;
	titre: string | null;
	extrait: string | null;
	confirme: boolean;
	raison: string;
};
type Ligne = {
	org_id: number;
	organisation: string;
	commune: string;
	designation_communale: boolean;
	domaines: Tentative[];
	domaine_retenu: string | null;
};

const normalized = (texte: string): string =>
	texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/['’]/g, "");

const compact = (texte: string): string => normalized(texte).replace(/[^a-z0-9]/g, "");

/** Variantes acceptées dans un nom : apostrophe collée ou séparateur. */
function variantesNom(nom: string): string[] {
	const base = normalized(nom)
		.replace(/['’]/g, "-")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
	const variantes = new Set<string>([base, base.replace(/[^a-z0-9]/g, "")]);
	return [...variantes].filter((v) => v.length >= 3);
}

/** Racine utilisable dans un nom de domaine : accentué → ascii, apostrophe retirée. */
function slugDomaine(nom: string): string {
	return normalized(nom).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function communesCharente(): Commune[] {
	const ref = JSON.parse(readFileSync(REFERENTIEL, "utf8")) as ReferentielNA;
	return ref.communes
		.filter((c) => c.departement === DEPARTEMENT)
		.map((c) => ({
			code: c.code,
			nom: c.nom,
			variantes: variantesNom(c.nom),
			slug: slugDomaine(c.nom),
			codesPostaux: c.codesPostaux,
		}))
		.filter((c) => c.slug.length >= 3)
		.sort((a, b) => b.nom.length - a.nom.length);
}

/** La commune la plus longue qui apparaît en entier dans le nom de l'org. */
function communeDansNom(nom: string, communes: Commune[]): Commune | null {
	const hay = ` ${normalized(nom).replace(/[^a-z0-9]+/g, " ")} `;
	for (const commune of communes) {
		for (const variante of commune.variantes) {
			const motif = variante.replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ");
			if (motif.length >= 3 && hay.includes(` ${motif} `)) return commune;
		}
	}
	return null;
}

/** Le nom désigne-t-il explicitement la commune, et non un homonyme ou un EPCI ? */
function designeCommune(org: Org, commune: Commune): boolean {
	const nom = normalized(org.name).replace(/[^a-z0-9]+/g, " ").trim();
	const cible = normalized(commune.nom).replace(/[^a-z0-9]+/g, " ").trim();
	return /^(commune|mairie|ville)\s+(de|d|du|des)\s/i.test(org.name) && nom.includes(cible);
}

function titreEtTexte(html: string): { titre: string; texte: string } {
	const titre = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
	const texte = html
		.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
		.replace(/<[^>]*>/g, " ");
	const decoder = (brut: string): string =>
		brut
			.replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
			.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
			.replace(/&[a-z]+;/gi, " ");
	return {
		titre: decoder(titre).replace(/\s+/g, " ").trim().slice(0, 300),
		texte: decoder(texte).replace(/\s+/g, " ").trim().slice(0, 12000),
	};
}

const PARKING =
	/domaine (a|à) vendre|domaine disponible|acheter (ce|le) domaine|for sale|parked (domain|page)|sedo|godaddy|namecheap|en construction|default web site page|site indisponible/i;
const CIVIQUE = /\b(mairie|ville|commune|municipal|municipale|conseil municipal|hotel de ville|maire)\b/i;

/** Un candidat n'est retenu que sur preuve de contenu, pas sur la seule DNS. */
function coherence(html: string, commune: Commune, urlFinale: string): {
	confirme: boolean;
	raison: string;
	titre: string;
	extrait: string;
} {
	const { titre, texte } = titreEtTexte(html);
	const extrait = texte.slice(0, 220);
	if (PARKING.test(`${titre} ${texte}`)) {
		return { confirme: false, raison: "page_parking", titre, extrait };
	}
	if (texte.length < 80) {
		return { confirme: false, raison: "contenu_insuffisant", titre, extrait };
	}
	let hote = "";
	try {
		hote = new URL(urlFinale).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return { confirme: false, raison: "url_finale_invalide", titre, extrait };
	}
	if (!hote.endsWith(".fr") || !compact(hote).includes(compact(commune.nom))) {
		return { confirme: false, raison: "redirection_incoherente", titre, extrait };
	}
	const corps = normalized(`${titre} ${texte}`).replace(/[^a-z0-9]+/g, " ");
	const nomCommune = normalized(commune.nom).replace(/[^a-z0-9]+/g, " ").trim();
	const parNom = nomCommune.length > 0 && corps.includes(nomCommune);
	if (!parNom && !compact(corps).includes(compact(commune.nom))) {
		return { confirme: false, raison: "commune_absente_du_contenu", titre, extrait };
	}
	if (!CIVIQUE.test(corps)) {
		return { confirme: false, raison: "contenu_non_municipal", titre, extrait };
	}
	// Une commune homonyme ailleurs en France peut avoir le même nom, la même
	// mention « mairie » et un .fr cohérent : exiger une ancre locale (nom du
	// département ou code postal de la commune du référentiel) évite d'écrire
	// le site de Bonneuil-sur-Marne dans la fiche de Bonneuil (Charente).
	const codeEtranger = /\(\s*(\d{2})\s*\)/.exec(`${titre} ${texte.slice(0, 500)}`);
	if (codeEtranger && codeEtranger[1] !== "16") {
		return { confirme: false, raison: "departement_contradictoire", titre, extrait };
	}
	const charente = /\bcharente\b/.test(corps) && !/charente maritime/.test(corps);
	const codePostal = commune.codesPostaux.some((cp) => corps.includes(cp));
	const departement16 = /\(\s*16\s*\)/.test(corps);
	if (!charente && !codePostal && !departement16) {
		return { confirme: false, raison: "localisation_charente_non_prouvee", titre, extrait };
	}
	return { confirme: true, raison: "http_200_contenu_coherent", titre, extrait };
}

async function lireHtml(reponse: Response): Promise<string> {
	const lecteur = reponse.body?.getReader();
	if (!lecteur) return "";
	const morceaux: Uint8Array[] = [];
	let total = 0;
	try {
		while (total < MAX_OCTETS) {
			const { done, value } = await lecteur.read();
			if (done) break;
			const tranche = value.subarray(0, MAX_OCTETS - total);
			morceaux.push(tranche);
			total += tranche.length;
		}
	} finally {
		await lecteur.cancel().catch(() => undefined);
	}
	return Buffer.concat(morceaux).toString("utf8");
}

async function verifier(domaine: string, commune: Commune): Promise<Tentative> {
	try {
		const reponse = await fetch(`https://${domaine}/`, {
			headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "fr" },
			redirect: "follow",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (reponse.status !== 200) {
			return {
				domaine,
				http: reponse.status,
				url_finale: reponse.url,
				titre: null,
				extrait: null,
				confirme: false,
				raison: "http_non_200",
			};
		}
		const html = await lireHtml(reponse);
		const verdict = coherence(html, commune, reponse.url);
		return {
			domaine,
			http: reponse.status,
			url_finale: reponse.url,
			titre: verdict.titre || null,
			extrait: verdict.extrait || null,
			confirme: verdict.confirme,
			raison: verdict.raison,
		};
	} catch (erreur) {
		return {
			domaine,
			http: null,
			url_finale: null,
			titre: null,
			extrait: null,
			confirme: false,
			raison: `acces_impossible: ${erreur instanceof Error ? erreur.message.slice(0, 120) : String(erreur).slice(0, 120)}`,
		};
	}
}

async function mapLimite<T, R>(elements: T[], concurrence: number, action: (e: T) => Promise<R>): Promise<R[]> {
	const resultats = new Array<R>(elements.length);
	let curseur = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrence, elements.length) }, async () => {
			for (;;) {
				const index = curseur++;
				if (index >= elements.length) return;
				resultats[index] = await action(elements[index]!);
			}
		}),
	);
	return resultats;
}

async function main(): Promise<void> {
	const communes = communesCharente();
	// LIKE ANY peut s'appuyer sur l'index GIN trigram de name_norm ; une
	// alternance de regex sur 1,6 M de lignes dépassait le timeout de requête.
	const motifs = [...new Set(communes.flatMap((c) => c.variantes))]
		.map((v) => `%${v}%`);

	const { rows: brutes } = await query<Org>(
		`SELECT id, name, kind, city, domain, website, name_norm
		   FROM org
		  WHERE dept = $1
		    AND (domain IS NULL OR btrim(domain) = '')
		    AND (website IS NULL OR btrim(website) = '')
		    AND name_norm LIKE ANY($2::text[])
		  ORDER BY id`,
		[DEPARTEMENT, motifs],
	);

	const examinees: { org: Org; commune: Commune }[] = [];
	for (const org of brutes) {
		const commune = communeDansNom(org.name, communes);
		if (commune) examinees.push({ org, commune });
	}
	const retenues = limite === null ? examinees : examinees.slice(0, limite);

	// Une seule vérification par domaine : le site est une propriété de la
	// commune, pas de chaque organisation homonyme.
	interface Tache { commune: Commune; domaine: string }
	const taches = new Map<string, Tache>();
	for (const { org, commune } of retenues) {
		if (!designeCommune(org, commune)) continue;
		for (const prefixe of ["ville", "mairie"]) {
			const domaine = `${prefixe}-${commune.slug}.fr`;
			taches.set(domaine, { commune, domaine });
		}
	}
	const verifications = await mapLimite([...taches.values()], CONCURRENCE, (t) =>
		verifier(t.domaine, t.commune),
	);
	const resultats = new Map(verifications.map((v) => [v.domaine, v]));

	const lignes: Ligne[] = retenues.map(({ org, commune }) => {
		const domaines = designeCommune(org, commune)
			? ["ville", "mairie"].map((prefixe) => {
					const domaine = `${prefixe}-${commune.slug}.fr`;
					return (
						resultats.get(domaine) ?? {
							domaine,
							http: null,
							url_finale: null,
							titre: null,
							extrait: null,
							confirme: false,
							raison: "non_verify",
						}
					);
			  })
			: [];
		return {
			org_id: org.id,
			organisation: org.name,
			commune: commune.nom,
			designation_communale: designeCommune(org, commune),
			domaines,
			domaine_retenu: domaines.find((d) => d.confirme)?.domaine ?? null,
		};
	});

	const testes = lignes.flatMap((l) => l.domaines);
	const rejetes = testes.filter((d) => !d.confirme).length;
	let misesAJour = 0;
	if (appliquer) {
		const cibles = lignes.filter((l) => l.domaine_retenu !== null);
		await withTransaction(async (client) => {
			for (const ligne of cibles) {
				const res = await client.query(
					`UPDATE org SET domain = $1
					  WHERE id = $2 AND (domain IS NULL OR btrim(domain) = '')`,
					[ligne.domaine_retenu, ligne.org_id],
				);
				misesAJour += res.rowCount ?? 0;
			}
		});
	}

	const rapport = {
		genere_le: new Date().toISOString(),
		base: BASE_TEST,
		mode: appliquer ? "application" : "rapport (aucune écriture)",
		departement: DEPARTEMENT,
		communes_reference: communes.length,
		limite,
		method: {
			candidats: ["ville-<commune>.fr", "mairie-<commune>.fr"],
			verification: "HTTP 200 final, hôte .fr cohérent, contenu municipal mentionnant la commune et une ancre locale (Charente ou code postal)",
			timeout_ms: TIMEOUT_MS,
			concurrence: CONCURRENCE,
		},
		organisations_examinees: lignes.length,
		organisations_avec_domaine_confirme: lignes.filter((l) => l.domaine_retenu !== null).length,
		domaines_verifies: testes.length,
		domaines_confirmes: testes.filter((d) => d.confirme).length,
		domaines_rejetes: rejetes,
		non_verifies_sans_designation_communale: lignes.filter((l) => !l.designation_communale).length,
		mises_a_jour: misesAJour,
		lignes,
	};

	mkdirSync(fileURLToPath(new URL("../bench/results/", import.meta.url)), { recursive: true });
	writeFileSync(SORTIE, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");
	console.log(
		`[charente] ${rapport.mode} — ${rapport.organisations_examinees} organisation(s) examinée(s), ` +
			`${rapport.domaines_confirmes} domaine(s) confirmé(s), ${rapport.domaines_rejetes} rejeté(s)`,
	);
	for (const ligne of lignes.filter((l) => l.domaine_retenu !== null).slice(0, 20)) {
		console.log(`  ${ligne.org_id}  ${ligne.organisation.slice(0, 45)} → ${ligne.domaine_retenu}`);
	}
	console.log(`rapport : ${SORTIE}`);
}

try {
	await main();
} finally {
	await closePools();
}
