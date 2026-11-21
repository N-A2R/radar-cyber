/**
 * S1.1 — Population et tirage stratifié des 500 rattachements réels
 * (vague précision, docs/plans/wave-precision.md ; état dans
 * bench/state/wave-precision.json).
 *
 * Deux phases, séparées pour isoler la mémoire et permettre de re-tirer sans
 * repasser le moteur (S1.5 aura besoin de deux tirages de bruit) :
 *
 *   --phase=population  calcule les rattachements réels et écrit
 *                       bench/precision/population-tirage1.json
 *   --phase=tirage      lit la population, tire, enrichit, écrit le corpus
 *
 * Population : les indices réels que le flux a traités — lignes
 * `quarantine_raw` de type `claim` portant un `org_hint` non vide. Le
 * rattachement proposé est calculé par le **moteur livré** (`matchOrgInIndex`,
 * apps/api/src/quarantine/promote.ts), sans règle réécrite ici.
 *
 * Préfiltre. Le préfiltre SQL livré (`loadCandidateIndex`) coûte ~7 s par
 * indice sur 1,24 M d'organisations (jetons génériques « com », « fr » en
 * ILIKE sur tout le référentiel) et son équivalent naïf saturait la mémoire
 * (jetons courts en millions de lignes). Ce script utilise un préfiltre
 * **étroit et prouvé** :
 *
 *   - une table temporaire indexe chaque organisation par ses jetons de nom
 *     discriminants (≥ 3 caractères, non génériques — le même prédicat que
 *     `isDiscriminating` du livré) ;
 *   - toute correspondance du moteur par le **nom** exige qu'un jeton
 *     d'organisation (par construction ≥ 3 caractères, non générique) soit
 *     **égal** à un jeton de l'indice — le moteur compare des jetons entiers,
 *     jamais des sous-chaînes. L'égalité sur la table suffit donc à ne rien
 *     rater ;
 *   - le chemin **domaine** passe par les clauses copiées à l'identique du
 *     livré (égalité/suffixe sur `domain`, `website`) ;
 *   - un indice **sans témoin** (aucun jeton discriminant, aucun domaine) ne
 *     peut plus être rattaché que par **égalité exacte du nom** — seul chemin
 *     restant du moteur. Candidats : organisations dont la forme normalisée
 *     peut égaler l'indice (unaccent + ponctuation en espaces, sur-ensemble
 *     de `normalizeName`), puis le moteur tranche sur cette liste courte.
 *
 * Le préfiltre livré et celui-ci donnent le même rattachement : vérification
 * différentielle sur un échantillon d'indices contre `loadCandidateIndex`, et
 * refus d'écrire quoi que ce soit en cas d'écart.
 *
 * Unité de tirage : la paire **(indice normalisé, organisation proposée)**.
 * Une même victime citée dix fois ne doit pas peser dix fois dans la
 * précision, ni coûter dix vérifications d'identité. Le représentant de la
 * paire est la ligne la plus récente (égalité : id le plus faible).
 *
 * Strates : confiance (haute ≥ 0,85 = seuil de promotion automatique ;
 * moyenne ≥ 0,7 ; faible en dessous) × source × type d'indice — le **type est
 * la règle gagnante du moteur** (domaine, nom, sigle = jeton unique, ville),
 * lue sur sa propre sortie (`via` + score), pas recalculée ici.
 *
 * Tirage : allocation proportionnelle à la taille des strates (plafonnée, le
 * reste redistribué aux plus grands restes), sélection dans la strate par
 * Fisher-Yates sur un PRNG à graine. La graine et les comptes de population
 * sont écrits dans les JSON : le tirage est re-exécutable et auditable.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { closePools, pool, query } from "../apps/api/src/db.js";
import {
	AUTO_MIN_CONFIDENCE,
	GENERIC_TOKENS,
	loadCandidateIndex,
	matchOrgInIndex,
	normalizeName,
	normalizeDomain,
	extractDomain,
	type OrgIndexEntry,
	type OrgMatch,
} from "../apps/api/src/quarantine/promote.js";

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

const PHASE = option("phase") ?? "population";
const SORTIE = option("json") ?? "bench/precision/corpus-v1.json";
const POPULATION = option("population") ?? "bench/precision/population-tirage1.json";
const TAILLE = Number(option("taille") ?? 500);
const GRAINE = Number(option("graine") ?? 20261121);
const NB_EQUIVALENCE = Number(option("equivalence") ?? 20);
const ETIQUETTE = option("label") ?? "tirage1";
const AUJOURDHUI = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

/** Une ligne de quarantaine portant un indice. */
type LigneIndice = {
	id: string;
	source: string;
	source_url: string;
	groupe: string | null;
	org_hint: string;
	claimed_at: string | null;
	received_at: string;
	status: string;
};

/** Une unité de population : paire (indice, organisation) avec ses strates. */
type Unite = {
	cle: string;
	indice: string;
	indiceNorm: string;
	domaineIndice: string | null;
	source: string;
	sourceUrl: string;
	groupe: string | null;
	claimedAt: string | null;
	status: string;
	lignesSource: number;
	orgId: number;
	confiance: number;
	via: "domain" | "name";
	type: "domaine" | "nom" | "sigle" | "ville";
	confianceNiveau: "haute" | "moyenne" | "faible";
	strate: string;
};

/** Fichier de population : unités + comptes + protocole. */
type Population = {
	vague: string;
	etape: string;
	date: string;
	graine: number;
	protocole: Record<string, unknown>;
	population: {
		lignesExaminees: number;
		indicesDistincts: number;
		indicesSansTemoin: number;
		unitesDistinctes: number;
		equivalencePrefiltre: string;
		repartitionStrates: Record<string, number>;
	};
	unites: Unite[];
};

/** PRNG mulberry32 : petit, déterministe, suffisant pour un tirage. */
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

/** Ordre total sur les paires (indice normalisé, …) : déterministe. */
function TRI_CLES(a: [string, unknown], b: [string, unknown]): number {
	return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

/** Mélange de Fisher-Yates, sur place, PRNG passé en argument. */
function melanger<T>(liste: T[], prochain: () => number): T[] {
	for (let i = liste.length - 1; i > 0; i--) {
		const j = Math.floor(prochain() * (i + 1));
		const tmp = liste[i] as T;
		liste[i] = liste[j] as T;
		liste[j] = tmp;
	}
	return liste;
}

/** Niveau de confiance du rattachement, seuils du moteur (0,85 = promo auto). */
function niveauConfiance(score: number): Unite["confianceNiveau"] {
	if (score >= AUTO_MIN_CONFIDENCE) return "haute";
	if (score >= 0.7) return "moyenne";
	return "faible";
}

/**
 * Type d'indice = la règle du moteur qui a porté la correspondance, lue sur
 * sa propre sortie. `via` « domain » et les scores du bloc nom (0,9 égalité,
 * 0,75 tous jetons), jeton unique (0,7), ville+nom (0,6) partitionnent les
 * quatre chemins sans rien recalculer.
 */
function typeIndice(m: OrgMatch): Unite["type"] {
	if (m.via === "domain") return "domaine";
	if (m.confidence === 0.6) return "ville";
	if (m.confidence === 0.7) return "sigle";
	return "nom";
}

/** Jeton discriminant : ≥ 3 caractères, ni générique ni forme juridique —
 * le même prédicat que le bloc nom du moteur (`isDiscriminating`). */
function discriminant(token: string): boolean {
	return token.length >= 3 && !GENERIC_TOKENS.has(token);
}

/** Ligne brute `org` telle qu'une requête SQL la rend. */
type OrgRowBrute = {
	id: number;
	name: string;
	slug: string;
	kind: string;
	city: string | null;
	domain: string | null;
	website: string | null;
};

/** Ligne brute → entrée d'index, en recopiant **exactement** la
 * normalisation du livré (`toIndexEntry`, promote.ts) : le moteur lit ces
 * champs pré-normalisés, jamais les colonnes brutes. Toute divergence entre
 * cette copie et le livré sera attrapée par la vérification différentielle,
 * qui refuse d'écrire. */
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

/** Ce qu'on attend d'une session SQL : des requêtes paramétrées renvoyant
 * des lignes typées à la volée. Un `PoolClient` pg s'y conforme. */
type ClientSql = {
	query: <T = OrgRowBrute>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

// ── Préfiltre étroit, entièrement en mémoire ─────────────────────────────

/**
 * Le préfiltre vivait en SQL (EXISTS sur table de jetons + clauses LIKE sur
 * domaine) : les clauses LIKE scannaient 1,24 M de lignes pour chaque indice
 * à domaine (~0,5 s), pour un référentiel où **69 organisations seulement**
 * portent un domaine ou un site. Tout passe donc en mémoire :
 *
 *   - un index jeton → identifiants, construit une fois depuis un scan SQL
 *     des noms (2,7 M paires) ;
 *   - les lignes `org` portant un domaine ou un site, chargées une fois
 *     (69 lignes) ; les quatre formes du livré (égalité, suffixe dans un
 *     sens, suffixe dans l'autre, site contenant le domaine) y sont testées
 *     en JS, formes copiées à l'identique ;
 *   - par indice : union des identifiants, puis un fetch SQL par clés pour
 *     recharger les lignes complètes et les normaliser comme le livré.
 *
 * L'indice sans témoin (aucun jeton discriminant, aucun domaine) garde le
 * chemin SQL : égalité exacte du nom, seul chemin restant du moteur.
 */
type Prefiltre = {
	/** jeton discriminant → identifiants d'organisations dont le nom le porte */
	parJeton: Map<string, number[]>;
	/** organisation → tous ses jetons discriminants (≥ 3, non génériques) */
	parOrg: Map<number, string[]>;
	/** organisation → ville normalisée (chemin ville du moteur) */
	parOrgVille: Map<number, string>;
	/** nom normalisé → organisations **sans** aucun jeton discriminant. Un
	 * indice sans témoin ne peut matcher que par égalité exacte du nom, et
	 * une org porteuse d'un jeton discriminant ne peut jamais y arriver (son
	 * nom contiendrait ce jeton, donc l'indice en aurait un). La carte est
	 * petite et le partage exact : même `normalizeName` des deux côtés. */
	nomsSansTemoin: Map<string, number[]>;
	/** lignes complètes des organisations sans jeton discriminant */
	lignesSansTemoin: Map<number, OrgRowBrute>;
	/** lignes org avec domaine ou site, pré-normalisées pour le chemin domaine */
	avecSite: Array<OrgRowBrute & { domainNorm: string | null; websiteLower: string | null }>;
};

async function chargerPrefiltre(): Promise<Prefiltre> {
	const parJeton = new Map<string, number[]>();
	const parOrg = new Map<number, string[]>();
	const parOrgVille = new Map<number, string>();
	const nomsSansTemoin = new Map<string, number[]>();
	let dernierId = 0;
	let jetonsTotal = 0;
	let sansTemoin = 0;
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
				const liste = nomsSansTemoin.get(nom);
				if (liste) liste.push(o.id);
				else nomsSansTemoin.set(nom, [o.id]);
				sansTemoin++;
			}
			for (const t of jetons) {
				const liste = parJeton.get(t);
				if (liste) liste.push(o.id);
				else parJeton.set(t, [o.id]);
				jetonsTotal++;
			}
		}
		console.log(`  org ≤ ${dernierId} — ${jetonsTotal} jetons`);
	}
	const avecSite = (
		await query<OrgRowBrute>("SELECT id, name, slug, kind, city, domain, website FROM org WHERE domain IS NOT NULL OR website IS NOT NULL")
	).rows.map((o) => ({
		...o,
		domainNorm: o.domain ? normalizeDomain(o.domain) : null,
		websiteLower: o.website ? o.website.toLowerCase() : null,
	}));
	console.log(`  ${avecSite.length} organisations avec domaine ou site · ${sansTemoin} sans jeton discriminant`);
	const lignesSansTemoin = new Map<number, OrgRowBrute>();
	if (sansTemoin > 0) {
		const idsSansTemoin = [...nomsSansTemoin.values()].flat();
		const lignes = (
			await query<OrgRowBrute>(
				"SELECT id, name, slug, kind, city, domain, website FROM org WHERE id = ANY($1::int[])",
				[idsSansTemoin],
			)
		).rows;
		for (const l of lignes) lignesSansTemoin.set(l.id, l);
	}
	return { parJeton, parOrg, parOrgVille, nomsSansTemoin, lignesSansTemoin, avecSite };
}

/** Présence d'une expression entière aux frontières de jetons — copie de
 * `containsPhrase` du livré (la ponctuation est déjà en espaces). */
function contientPhrase(hintNorm: string, phrase: string): boolean {
	if (!phrase) return false;
	return ` ${hintNorm} `.includes(` ${phrase} `);
}

/** Candidats d'un indice avec témoin. Rend `null` si l'indice est sans
 * témoin (alors voir `candidatsSansTemoin`).
 *
 * Trois conditions rendent un org candidat, chacune sur-ensemble d'un bloc
 * du moteur (les candidats en trop marquent 0 et ne changent rien) :
 *
 *   a. tous les jetons discriminants de l'org sont dans l'indice — couvre le
 *      bloc nom du moteur (égalité, tous-jetons, jeton unique) ;
 *   b. la ville de l'org figure en jetons entiers dans l'indice ET un jeton
 *      de son nom hors ville est présent — couvre le bloc ville (0,6) ;
 *   c. domaine/site en relation avec le domaine de l'indice — couvre le
 *      bloc domaine (formes copiées du préfiltre livré).
 *
 * L'union porte sur les listes de TOUS les jetons de l'indice : une org dont
 * les jetons sont inclus dans l'indice peut n'en porter aucun des plus rares
 * (« J.THERM » face à l'indice « plasma therm » — attrapé par la vérification
 * différentielle le jour où l'union était restreinte au jeton le plus rare). */
async function candidatsPour(
	client: ClientSql,
	prefiltre: Prefiltre,
	hint: string,
): Promise<OrgIndexEntry[] | null> {
	const hintNorm = normalizeName(hint);
	const domain = extractDomain(hint);
	const jetonsIndice = new Set(hintNorm.split(" "));
	const tokens = [...jetonsIndice].filter(discriminant);
	if (tokens.length === 0 && domain === null) return null;
	const ids = new Set<number>();
	for (const t of tokens) {
		for (const id of prefiltre.parJeton.get(t) ?? []) {
			if (ids.has(id)) continue;
			const jetonsOrg = prefiltre.parOrg.get(id) ?? [];
			if (jetonsOrg.every((x) => jetonsIndice.has(x))) {
				ids.add(id);
				continue;
			}
			// Chemin ville : phrase de ville entière dans l'indice, puis un
			// jeton de nom (≥ 4, hors ville) présent — la copie exacte du
			// bloc ville de `scoreEntry`.
			const ville = prefiltre.parOrgVille.get(id);
			if (ville && contientPhrase(hintNorm, ville)) {
				const jetonsVille = new Set(ville.split(" ").filter(Boolean));
				const horsVille = jetonsOrg.filter((x) => x.length >= 4 && !jetonsVille.has(x));
				if (horsVille.some((x) => jetonsIndice.has(x))) ids.add(id);
			}
		}
	}
	if (domain) {
		for (const o of prefiltre.avecSite) {
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
	const r = await client.query<OrgRowBrute>(
		"SELECT id, name, slug, kind, city, domain, website FROM org WHERE id = ANY($1::int[])",
		[[...ids]],
	);
	return r.rows.map(versIndexEntry);
}

/** Indice sans témoin : égalité exacte du nom, seul chemin restant du moteur
 * (pas de domaine, aucun jeton ≥ 3 non générique → les blocs domaine,
 * tous-jetons, jeton unique et ville ne peuvent rien trouver). Candidats :
 * les organisations **sans** jeton discriminant dont le nom normalisé égale
 * l'indice — carte en mémoire, partage exact via `normalizeName`. */
function candidatsSansTemoin(prefiltre: Prefiltre, hint: string): OrgIndexEntry[] {
	const hintNorm = normalizeName(hint);
	if (hintNorm === "") return [];
	const ids = prefiltre.nomsSansTemoin.get(hintNorm) ?? [];
	return ids
		.map((id) => prefiltre.lignesSansTemoin.get(id))
		.filter((r): r is OrgRowBrute => r !== undefined)
		.map(versIndexEntry);
}

// ── Phase population ─────────────────────────────────────────────────────

async function phasePopulation(): Promise<void> {
	console.log("Lecture des lignes de quarantaine portant un indice…");
	const lignes = (
		await query<LigneIndice>(
			`SELECT id::text AS id, source, source_url, groupe, org_hint, claimed_at::text AS "claimed_at",
			        received_at::text AS "received_at", status
			   FROM quarantine_raw
			  WHERE kind = 'claim' AND org_hint IS NOT NULL AND btrim(org_hint) <> ''`,
		)
	).rows;
	console.log(`  ${lignes.length} lignes examinées`);

	/** Regroupement par indice normalisé ; représentant = ligne la plus récente. */
	const parIndice = new Map<string, { rep: LigneIndice; total: number }>();
	for (const l of lignes) {
		const cle = normalizeName(l.org_hint);
		const courante = parIndice.get(cle);
		if (!courante) {
			parIndice.set(cle, { rep: l, total: 1 });
		} else {
			courante.total++;
			const plusRecente =
				l.received_at > courante.rep.received_at ||
				(l.received_at === courante.rep.received_at && l.id < courante.rep.id);
			if (plusRecente) courante.rep = l;
		}
	}
	console.log(`  ${parIndice.size} indices distincts`);
	const entreesTriees = [...parIndice.entries()].sort(TRI_CLES);

	// Client dédié : les requêtes par clés y passent en série.
	const client = await pool.connect();
	try {
		// ── Préfiltre en mémoire ───────────────────────────────────────────
		console.log("Chargement du préfiltre (index jeton → organisations)…");
		const prefiltre = await chargerPrefiltre();

		// ── Vérification différentielle contre le préfiltre livré ──────────
		// Indices avec témoin seulement : le préfiltre livré y répond en
		// secondes. Les indices sans témoin (index complet côté livré) sont
		// vérifiés par --phase=sans-temoin, séparément, pour ne pas risquer
		// ce passage sur une saturation mémoire.
		if (NB_EQUIVALENCE > 0) {
			console.log(`Vérification différentielle du préfiltre sur ${NB_EQUIVALENCE} indices…`);
			const prochainEq = mulberry32(GRAINE + 1);
			const avecTemoin = entreesTriees.filter(
				([, { rep }]) =>
					extractDomain(rep.org_hint) !== null ||
					normalizeName(rep.org_hint).split(" ").some(discriminant),
			);
			const echantillon = melanger([...avecTemoin], prochainEq).slice(0, NB_EQUIVALENCE);
			let desaccords = 0;
			for (const [cle, { rep }] of echantillon) {
				const livre = await loadCandidateIndex(rep.org_hint);
				const etroit = await candidatsPour(client, prefiltre, rep.org_hint);
				const m1 = matchOrgInIndex(rep.org_hint, livre);
				const m2 = etroit === null ? null : matchOrgInIndex(rep.org_hint, etroit);
				const pareil =
					(m1 === null && m2 === null) ||
					(m1 !== null &&
						m2 !== null &&
						m1.orgId === m2.orgId &&
						m1.confidence === m2.confidence &&
						m1.via === m2.via);
				if (!pareil) {
					desaccords++;
					console.log(`  DÉSACCORD ${cle}: livré=${JSON.stringify(m1)} étroit=${JSON.stringify(m2)}`);
				}
			}
			if (desaccords > 0) {
				console.error(`Préfiltre étroit NON équivalent : ${desaccords} désaccord(s) sur ${NB_EQUIVALENCE}.`);
				console.error("Aucune population n'est écrite : mesurer sur un préfiltre cassé serait mesurer une copie.");
				process.exitCode = 1;
				return;
			}
			console.log(`  équivalence confirmée (${NB_EQUIVALENCE}/${NB_EQUIVALENCE} accord)`);
		}

		// ── Passage moteur ────────────────────────────────────────────────
		console.log(`Passage moteur sur ${entreesTriees.length} indices…`);
		const depart = Date.now();
		const unites: Unite[] = [];
		let sansTemoin = 0;
		let vu = 0;
		for (const [cle, { rep, total }] of entreesTriees) {
			const candidats = await candidatsPour(client, prefiltre, rep.org_hint);
			let m: OrgMatch | null;
			if (candidats === null) {
				sansTemoin++;
				m = matchOrgInIndex(rep.org_hint, candidatsSansTemoin(prefiltre, rep.org_hint));
			} else {
				m = matchOrgInIndex(rep.org_hint, candidats);
			}
			vu++;
			if (vu % 2000 === 0) {
				console.log(`  ${vu}/${entreesTriees.length} (${((Date.now() - depart) / 1000).toFixed(0)} s)`);
			}
			if (!m) continue;
			const type = typeIndice(m);
			const niveau = niveauConfiance(m.confidence);
			unites.push({
				cle: `${cle}|${m.orgId}`,
				indice: rep.org_hint,
				indiceNorm: cle,
				domaineIndice: extractDomain(rep.org_hint),
				source: rep.source,
				sourceUrl: rep.source_url,
				groupe: rep.groupe,
				claimedAt: rep.claimed_at,
				status: rep.status,
				lignesSource: total,
				orgId: m.orgId,
				confiance: m.confidence,
				via: m.via,
				type,
				confianceNiveau: niveau,
				strate: `${niveau}|${rep.source}|${type}`,
			});
		}
		console.log(`Rattachements proposés : ${unites.length} unités distinctes (${sansTemoin} indices sans témoin)`);

		// ── Comptes par strate ────────────────────────────────────────────
		const repartition: Record<string, number> = {};
		for (const u of unites) repartition[u.strate] = (repartition[u.strate] ?? 0) + 1;

		mkdirSync("bench/precision", { recursive: true });
		const population: Population = {
			vague: "precision",
			etape: "S1.1",
			date: AUJOURDHUI,
			graine: GRAINE,
			protocole: {
				population:
					"quarantine_raw kind='claim', org_hint non vide — tous statuts ; rattachement calculé par le moteur livré (matchOrgInIndex)",
				unite: "paire (indice normalisé, organisation proposée) ; représentant = ligne la plus récente (égalité : id le plus faible)",
				moteur: "apps/api/src/quarantine/promote.ts — matchOrgInIndex",
				prefiltre:
					"table de jetons discriminants (>= 3 caractères, non génériques, égalité) + clauses domaine copiées du livré ; indices sans témoin : candidats par unaccent+ponctuation puis égalité recalculée par le moteur ; vérification différentielle contre loadCandidateIndex",
				equivalence: `${NB_EQUIVALENCE}/${NB_EQUIVALENCE}`,
			},
			population: {
				lignesExaminees: lignes.length,
				indicesDistincts: parIndice.size,
				indicesSansTemoin: sansTemoin,
				unitesDistinctes: unites.length,
				equivalencePrefiltre: `${NB_EQUIVALENCE}/${NB_EQUIVALENCE} accord`,
				repartitionStrates: repartition,
			},
			unites,
		};
		writeFileSync(POPULATION, JSON.stringify(population, null, "\t") + "\n");
		console.log(`Population écrite : ${POPULATION} (${unites.length} unités)`);
	} finally {
		client.release();
		await closePools();
	}
}

// ── Phase sans témoin : vérification différentielle contre l'index complet ─

/** Les indices sans témoin ne passent pas par la table de jetons : leur
 * candidature (égalité exacte du nom via unaccent + ponctuation) est un
 * sur-ensemble à confirmer contre le chemin livré, qui charge alors l'index
 * complet. Phase séparée, courte (échantillon), pour ne jamais risquer le
 * passage principal sur une saturation mémoire. */
async function phaseSansTemoin(): Promise<void> {
	const NB = NB_EQUIVALENCE > 0 ? Math.min(NB_EQUIVALENCE, 5) : 5;
	console.log(`Vérification différentielle (sans témoin) sur ${NB} indices…`);
	const lignes = (
		await query<LigneIndice>(
			`SELECT id::text AS id, source, source_url, groupe, org_hint, claimed_at::text AS "claimed_at",
			        received_at::text AS "received_at", status
			   FROM quarantine_raw
			  WHERE kind = 'claim' AND org_hint IS NOT NULL AND btrim(org_hint) <> ''`,
		)
	).rows;
	const parIndice = new Map<string, LigneIndice>();
	for (const l of lignes) {
		const cle = normalizeName(l.org_hint);
		const courante = parIndice.get(cle);
		if (!courante || l.received_at > courante.received_at || (l.received_at === courante.received_at && l.id < courante.id)) {
			parIndice.set(cle, l);
		}
	}
	const sansTemoin = [...parIndice.entries()]
		.filter(
			([, rep]) =>
				extractDomain(rep.org_hint) === null &&
				!normalizeName(rep.org_hint).split(" ").some(discriminant),
		)
		.sort(TRI_CLES);
	const echantillon = melanger([...sansTemoin], mulberry32(GRAINE + 2)).slice(0, NB);

	console.log("Chargement du préfiltre (carte des noms sans témoin)…");
	const prefiltre = await chargerPrefiltre();
	let desaccords = 0;
	for (const [cle, rep] of echantillon) {
		// Chemin livré : loadCandidateIndex rend l'index complet ici.
		const livre = await loadCandidateIndex(rep.org_hint);
		const etroit = candidatsSansTemoin(prefiltre, rep.org_hint);
		const m1 = matchOrgInIndex(rep.org_hint, livre);
		const m2 = matchOrgInIndex(rep.org_hint, etroit);
		const pareil =
			(m1 === null && m2 === null) ||
			(m1 !== null &&
				m2 !== null &&
				m1.orgId === m2.orgId &&
				m1.confidence === m2.confidence &&
				m1.via === m2.via);
		if (!pareil) {
			desaccords++;
			console.log(`  DÉSACCORD ${cle}: livré=${JSON.stringify(m1)} étroit=${JSON.stringify(m2)}`);
		} else {
			console.log(`  accord ${cle}: ${JSON.stringify(m1)}`);
		}
	}
	if (desaccords > 0) {
		console.error(`Sans témoin NON équivalent : ${desaccords} désaccord(s) sur ${NB}.`);
		process.exitCode = 1;
	} else {
		console.log(`  équivalence confirmée (${NB}/${NB} accord)`);
	}
	await closePools();
}

// ── Phase tirage ─────────────────────────────────────────────────────────

/** Allocation proportionnelle, plafonnée à la taille de strate, le reste
 * redistribué aux plus grands restes fractionnaires (ordre déterministe). */
function allocationProportionnelle(
	effectifs: Array<{ cle: string; taille: number }>,
	quota: number,
	total: number,
): Map<string, number> {
	const sortie = new Map<string, number>();
	const restes: Array<{ cle: string; taille: number; reste: number }> = [];
	let alloue = 0;
	for (const s of effectifs) {
		const exact = (quota * s.taille) / total;
		const plancher = Math.min(s.taille, Math.floor(exact));
		sortie.set(s.cle, plancher);
		alloue += plancher;
		restes.push({ cle: s.cle, taille: s.taille, reste: exact - Math.floor(exact) });
	}
	restes.sort((a, b) => b.reste - a.reste || (a.cle < b.cle ? -1 : 1));
	let restant = quota - alloue;
	while (restant > 0) {
		let progres = false;
		for (const r of restes) {
			if (restant === 0) break;
			const cur = sortie.get(r.cle) ?? 0;
			if (cur < r.taille) {
				sortie.set(r.cle, cur + 1);
				restant--;
				progres = true;
			}
		}
		if (!progres) break; // population plus petite que la demande
	}
	return sortie;
}

async function phaseTirage(): Promise<void> {
	const population = JSON.parse(readFileSync(POPULATION, "utf8")) as Population;
	const unites = population.unites;
	const effectifs = new Map<string, Unite[]>();
	for (const u of unites) {
		const liste = effectifs.get(u.strate);
		if (liste) liste.push(u);
		else effectifs.set(u.strate, [u]);
	}
	const cles = [...effectifs.keys()].sort();
	const totalPopulation = unites.length;
	const demande = Math.min(TAILLE, totalPopulation);

	const quotas = allocationProportionnelle(
		cles.map((cle) => ({ cle, taille: (effectifs.get(cle) as Unite[]).length })),
		demande,
		totalPopulation,
	);

	const prochain = mulberry32(GRAINE);
	// Mélange par strate (graine), puis SÉLECTION SELON LES QUOTAS — le
	// round-robin seul prenait une unité par strate à chaque tour et produisait
	// une allocation égale au lieu de l'allocation proportionnelle (défaut
	// trouvé en S1.5 : le corpus gelé, vérifié sur cette base, reste valable
	// comme tirage mais son estimateur brut n'est pas celui de la population ;
	// l'estimateur stratifié pondéré le corrige). L'entrelacement round-robin
	// des unités SÉLECTIONNÉES conserve son seul rôle : que les premiers
	// numéros d'ordre échantillonnent toutes les strates pour la calibration.
	const files = cles.map((cle) => melanger([...(effectifs.get(cle) as Unite[])], prochain));
	const fileParCle = new Map<string, Unite[]>();
	for (const [i, cle] of cles.entries()) {
		const quota = quotas.get(cle) ?? 0;
		fileParCle.set(cle, (files[i] as Unite[]).slice(0, quota));
	}
	const tirees: Unite[] = [];
	while (tirees.length < demande) {
		let progres = false;
		for (const cle of cles) {
			if (tirees.length >= demande) break;
			const suivante = fileParCle.get(cle)?.shift();
			if (suivante) {
				tirees.push(suivante);
				progres = true;
			}
		}
		if (!progres) break;
	}

	// Enrichissement : le référentiel tel que la vérification en aura besoin.
	const orgIds = [...new Set(tirees.map((u) => u.orgId))];
	const orgRows = (
		await query<{
			id: number;
			name: string;
			slug: string;
			kind: string;
			sector: string | null;
			city: string | null;
			dept: string | null;
			website: string | null;
			domain: string | null;
			siren: string | null;
			naf: string | null;
			valid_to: string | null;
			superseded_at: string | null;
		}>(
			`SELECT id, name, slug, kind, sector, city, dept, website, domain, siren, naf,
			        valid_to::text AS "valid_to", superseded_at::text AS "superseded_at"
			   FROM org WHERE id = ANY($1::int[])`,
			[orgIds],
		)
	).rows;
	const orgs = new Map<number, Record<string, unknown>>();
	for (const o of orgRows) {
		orgs.set(o.id, {
			id: o.id,
			name: o.name,
			slug: o.slug,
			kind: o.kind,
			sector: o.sector,
			city: o.city,
			dept: o.dept,
			website: o.website,
			domain: o.domain,
			siren: o.siren,
			naf: o.naf,
			obsolete: o.valid_to !== null || o.superseded_at !== null,
		});
	}

	const entrees = tirees.map((u, i) => ({
		ordre: i + 1,
		cle: u.cle,
		indice: u.indice,
		indiceNorm: u.indiceNorm,
		domaineIndice: u.domaineIndice,
		source: u.source,
		sourceUrl: u.sourceUrl,
		groupe: u.groupe,
		claimedAt: u.claimedAt,
		status: u.status,
		lignesSource: u.lignesSource,
		confiance: u.confiance,
		via: u.via,
		type: u.type,
		strate: u.strate,
		org:
			orgs.get(u.orgId) ?? {
				id: u.orgId,
				name: "(disparu du référentiel)",
				slug: "",
				kind: "",
				sector: null,
				city: null,
				dept: null,
				website: null,
				domain: null,
				siren: null,
				naf: null,
				obsolete: false,
			},
		verdict: null,
	}));

	const corpus = {
		vague: "precision",
		etape: "S1.1",
		labelTirage: ETIQUETTE,
		date: AUJOURDHUI,
		graine: GRAINE,
		population: POPULATION,
		commande: `tsx scripts/precision-echantillon.mts --phase=tirage --population=${POPULATION} --json=${SORTIE} --graine=${GRAINE} --taille=${TAILLE} --label=${ETIQUETTE}`,
		protocole: population.protocole,
		populationComptes: population.population,
		tirage: { demande: TAILLE, obtenu: entrees.length, quotas: Object.fromEntries(quotas) },
		entrees,
	};
	mkdirSync("bench/precision", { recursive: true });
	writeFileSync(SORTIE, JSON.stringify(corpus, null, "\t") + "\n");
	console.log(`Corpus écrit : ${SORTIE} (${entrees.length} entrées)`);

	console.log("Répartition du tirage par strate :");
	for (const [cle, quota] of [...quotas.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
		console.log(`  ${cle}: ${quota}/${population.population.repartitionStrates[cle] ?? 0}`);
	}
	await closePools();
}

if (PHASE === "population") {
	await phasePopulation();
} else if (PHASE === "sans-temoin") {
	await phaseSansTemoin();
} else if (PHASE === "tirage") {
	await phaseTirage();
} else {
	console.error(`phase inconnue : ${PHASE} (attendu : population | tirage)`);
	process.exitCode = 1;
	await closePools();
}
