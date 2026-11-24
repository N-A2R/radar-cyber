/**
 * Le trou du référentiel, mesuré et nommé.
 *
 * La mesure de couverture a établi que **le goulot n'est pas le moteur de
 * rattachement mais le référentiel** : sur 15 incidents réels de la fenêtre,
 * 9 organisations sont absentes d'un référentiel de 34 330 lignes — une
 * supérette, une scierie, un abattoir, deux fédérations sportives, une monnaie
 * locale. Aucune n'est un cas difficile : elles n'ont simplement jamais été
 * chargées.
 *
 * Ces entités ne sortent aujourd'hui nulle part de façon exploitable. La revue
 * de quarantaine sait déjà dire « organisation française probable absente du
 * référentiel » (`triage.referentialGap`), mais cette phrase reste dans une
 * ligne de file : elle ne produit ni liste, ni priorité, ni fichier à charger.
 *
 * Ce module transforme le symptôme en **liste de courses** : quelles entités
 * manquent, combien de fois chacune revient, et par quelle voie on pourrait la
 * charger. Il ne charge rien et n'invente aucune organisation : il agrège ce
 * que les faits déjà reçus disent.
 */
import { query } from "../db.js";

/** Une entité qui manque au référentiel, telle qu'elle apparaît dans les faits. */
export type Manque = {
	/** Nom tel qu'il apparaît dans la source — jamais normalisé, sinon on perd l'entité. */
	nom: string;
	/**
	 * Nom débarrassé du bruit d'un titre structuré de rançongiciel
	 * (« domaine\montant\pays\volume ») : c'est l'entité qu'on cherche à
	 * charger, pas le titre qui la décrit.
	 */
	nomLisible: string;
	/** Nombre de faits distincts qui la nomment. */
	occurrences: number;
	/** Sources distinctes qui la nomment : deux sources valent mieux qu'une. */
	sources: number;
	/** Première et dernière fois qu'on l'a vue. */
	premiereVue: string;
	derniereVue: string;
	/** Familles d'événements concernées. */
	familles: string[];
	/**
	 * Voie de chargement suggérée, déduite de la forme du nom :
	 * `sirene` (entité légale), `annuaire-administratif` (collectivité),
	 * `manuel` (association, fédération, monnaie locale).
	 */
	voie: "sirene" | "annuaire-administratif" | "manuel";
	/** Zone déduite du nom : France, hors périmètre ou indéterminée. */
	zone: "france" | "hors-zone" | "inconnue";
	/** Origine des faits qui nomment l'entité. */
	provenance: "revendication" | "evenement" | "les deux";
};

/**
 * Pays déclaré dans un titre structuré de revendication
 * (« domaine\pays\volume\état »). Le format est celui de Ransomlook ; on ne
 * lit que le champ pays, jamais le reste.
 */
function paysDeclare(nom: string): string | null {
	if (!nom.includes("\\")) return null;
	// Le premier segment est le domaine, jamais le pays. Chercher un nom de pays
	// dans les suivants suffit et évite de confondre « 1,2 M€ » avec un pays.
	const segments = nom.split("\\").map((s) => s.trim()).slice(1);
	for (const segment of segments) {
		const nu = segment.replace(/[.;]+,?$/, "").toLowerCase();
		if (PAYS_FOYER.has(nu)) return nu;
		// Pays hors foyer : deux à trois lettres majuscules ou un mot capitalisé
		// qui ne porte ni chiffre ni montant.
		if (/^[A-Z]{2,3}$/.test(segment) || /^[A-Z][a-zà-ÿ]+(?:[ -][A-Z][a-zà-ÿ]+)*$/.test(segment)) {
			return nu;
		}
	}
	return null;
}

/** Pays d'origine du foyer du projet. */
const PAYS_FOYER = new Set(["france", "fr", "french republic", "french"]);

/**
 * Indice d'appartenance à la France, **quand la source ne déclare pas de pays**.
 *
 * Volontairement restrictif. Mesuré sur les 500 indices de la base : un motif
 * large (`clinique`, `université`, `collège`, `commune`…) range 22 entités en
 * France dont au moins 10 à l'étranger — un collège tanzanien, une commune
 * belge, trois colleges américains. Seul `.fr` résiste : 3 entités, zéro
 * fausse attribution. On préfère donc ne rien affirmer plutôt que de gonfler
 * la liste des manques avec des entités hors périmètre.
 */
const INDICE_FRANCAIS = /\.fr\b/i;

/**
 * Réduit un titre structuré à l'entité qu'il désigne.
 *
 * Ransomlook publie « acmefan.com\$421M\USA\1TB\<1% DISCLOSED » : le domaine
 * est la seule partie qui nomme l'organisation. Garder le titre entier dans une
 * liste de courses conduit à chercher une société qui s'appelle
 * « acmefan.com$421MUSA… ». Le marqueur `[DISCLOSED]` est un état de
 * revendication, pas un nom.
 */
export function nomLisible(nom: string): string {
	const propre = nom.replace(/^\s*\[(?:DISCLOSED|UNDISCLOSED)\]\s*/i, "").trim();
	if (!propre.includes("\\")) return propre;
	const [domaine] = propre.split("\\");
	const d = (domaine ?? "").trim();
	return d === "" ? propre : d;
}

/**
 * L'entité a-t-elle une chance d'être française ?
 *
 * Trois signaux, du plus fiable au plus faible : un pays déclaré par la source,
 * un indice typiquement français dans le nom (`.fr`, « mairie », « hôpital »),
 * ou une ville de la région citée. Sans aucun des trois, on ne sait pas —
 * et « on ne sait pas » est exactement ce qu'il faut écrire.
 *
 * Ce classement n'est pas cosmétique : sur la base de développement, 300
 * entités nommées ne sont pas au référentiel, et la quasi-totalité sont des
 * entreprises américaines ou asiatiques revendiquées par des groupes
 * internationaux. Les compter comme des trous de couverture régionale serait
 * une faute de mesure — le genre d'erreur qui fait chercher au mauvais endroit.
 */
export function zoneDe(nom: string, villesConnues?: ReadonlySet<string>): "france" | "hors-zone" | "inconnue" {
	const pays = paysDeclare(nom);
	if (pays !== null) return PAYS_FOYER.has(pays) ? "france" : "hors-zone";
	if (INDICE_FRANCAIS.test(nom)) return "france";
	// Une ville du référentiel citée dans l'indice est un signal régional fort :
	// les organisations de ces communes y sont, par construction.
	if (villesConnues && villesConnues.size > 0) {
		const jetons = new Set(cleManque(nom).split(" "));
		for (const ville of villesConnues) {
			// Une ville de moins de cinq lettres (« Gan », « Sare ») se confond
			// avec un mot ordinaire ; l'indice doit être long pour valoir.
			if (ville.length >= 5 && jetons.has(ville)) return "france";
		}
	}
	return "inconnue";
}

/**
 * Un titre de revendication porte-t-il explicitement un pays hors zone ?
 *
 * Sans ce filtre, la liste des manques est noyée : les revendications
 * mondiales de Ransomlook nomment des entreprises américaines, suédoises,
 * indiennes — qui ne manquent pas au référentiel, elles sont simplement hors
 * de son périmètre. Les confondre avec des manques réels rend la liste
 * inutilisable, et c'est exactement ce qui s'est produit au premier essai.
 */
export function horsZone(nom: string): boolean {
	return zoneDe(nom) === "hors-zone";
}

/**
 * Devine la voie de chargement sans rien promettre : un nom qui ressemble à une
 * société part à Sirene, une collectivité à l'annuaire de l'État, le reste à la
 * main. C'est une aide au tri, pas une décision — et elle se trompe sans
 * conséquence, puisqu'elle ne fait que classer une liste à relire.
 */
export function voieProbable(nom: string): Manque["voie"] {
	const n = nom.toLowerCase();
	if (/\b(sas|sasu|sarl|eurl|sa|sci|snc|gie|groupe|holding|industrie|scierie|abattoir|supermarch[ée]|intermarch[ée]|carrefour|leclerc)\b/.test(n)) {
		return "sirene";
	}
	if (/\b(commune|mairie|ville|d[ée]partement|r[ée]gion|agglom[ée]ration|communaut[ée] de communes|m[ée]tropole|syndicat)\b/.test(n)) {
		return "annuaire-administratif";
	}
	return "manuel";
}

/**
 * Normalise pour comparer sans confondre deux entités distinctes : on ne retire
 * que ce qui ne porte pas d'identité (casse, accents, ponctuation).
 */
export function cleManque(nom: string): string {
	return nom
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

type LigneBrute = {
	nom: string | null;
	source: string;
	famille: string;
	vu_le: string;
	origine: "revendication" | "evenement";
};

/**
 * Agrège les manques depuis les faits déjà reçus.
 *
 * Deux gisements sont lus, un seul alimente réellement la liste :
 *  - les revendications de quarantaine non promues, qui portent un `org_hint` —
 *    c'est d'elles que viennent les entités nommées ;
 *  - les événements dont la preuve porte un motif de non-rattachement et un
 *    `org_hint`. **Ce second gisement est vide aujourd'hui** : les collecteurs
 *    de flux n'écrivent pas d'indice d'organisation dans la preuve. La branche
 *    reste pour le jour où ils le feront, et le script publie la répartition
 *    par provenance pour que ce vide soit visible plutôt que supposé.
 */
export async function listerManques(
	options: {
		limite?: number;
		/**
		 * Vrai si l'entité est déjà connue du référentiel. Sans ce prédicat, la
		 * liste contient aussi des entités présentes : elle reste juste, mais
		 * elle cesse d'être une liste de courses.
		 */
		existe?: (nom: string) => boolean;
		/** Villes du référentiel, normalisées (minuscules sans accents). */
		villes?: ReadonlySet<string>;
	} = {},
): Promise<Manque[]> {
	const limite = Math.min(Math.max(options.limite ?? 200, 1), 2000);
	const { rows } = await query<LigneBrute>(
		`SELECT org_hint AS nom, source, 'ransomware' AS famille,
		        COALESCE(claimed_at, received_at, now())::text AS vu_le,
		        'revendication'::text AS origine
		   FROM quarantine_raw
		  WHERE org_hint IS NOT NULL AND org_hint <> ''
		    AND promoted = false
		 UNION ALL
		 SELECT e.evidence->>'org_hint' AS nom, e.source_id AS source, e.family AS famille,
		        COALESCE(e.observed_at, e.collected_at)::text AS vu_le,
		        'evenement'::text AS origine
		   FROM event e
		  WHERE e.org_id IS NULL
		    AND e.evidence->'rattachement'->>'motif' = 'aucun'
		    AND e.evidence->>'org_hint' IS NOT NULL`,
	);

	const parCle = new Map<
		string,
		{ nom: string; occurrences: number; sources: Set<string>; familles: Set<string>; origines: Set<string>; premiere: string; derniere: string }
	>();
	for (const ligne of rows) {
		const nom = (ligne.nom ?? "").trim();
		// Un nom d'un seul caractère n'est pas une entité ; un domaine nu non
		// plus (« example.fr » sans contexte n'apprend rien sur l'organisation).
		if (nom.length < 3) continue;
		// La clé porte sur l'entité, pas sur le titre : « acmefan.com\$421M\USA…
		// <1% DISCLOSED » et la variante « 100% DISCLOSED » désignent la même
		// entreprise revendiquée deux fois. Compter deux manques doublerait la
		// liste et casserait la corroboration.
		const cle = cleManque(nomLisible(nom));
		if (cle === "") continue;
		if (options.existe !== undefined && options.existe(nom)) continue;
		const vu = ligne.vu_le;
		const existant = parCle.get(cle);
		if (existant) {
			existant.occurrences++;
			existant.sources.add(ligne.source);
			existant.familles.add(ligne.famille);
			existant.origines.add(ligne.origine);
			if (vu < existant.premiere) existant.premiere = vu;
			if (vu > existant.derniere) existant.derniere = vu;
		} else {
			parCle.set(cle, {
				nom,
				occurrences: 1,
				sources: new Set([ligne.source]),
				familles: new Set([ligne.famille]),
				origines: new Set([ligne.origine]),
				premiere: vu,
				derniere: vu,
			});
		}
	}

	return [...parCle.values()]
		.map((entree) => ({
			nom: entree.nom,
			occurrences: entree.occurrences,
			zone: zoneDe(entree.nom, options.villes),
			nomLisible: nomLisible(entree.nom),
			provenance:
				entree.origines.size > 1 ? ("les deux" as const) : ([...entree.origines][0] as "revendication" | "evenement"),
			sources: entree.sources.size,
			premiereVue: entree.premiere.slice(0, 10),
			derniereVue: entree.derniere.slice(0, 10),
			familles: [...entree.familles].sort(),
			voie: voieProbable(entree.nom),
		}))
		// Priorité : d'abord ce qui pourrait être dans le périmètre (France),
		// puis l'inconnu, puis le hors-zone — qui n'est pas un manque du
		// référentiel mais une entité d'un autre pays. À zone égale, la
		// corroboration tranche : deux sources valent mieux qu'une occurrence
		// répétée par la même source.
		.sort((a, b) => {
			const rang = { france: 0, inconnue: 1, "hors-zone": 2 } as const;
			return (
				rang[a.zone] - rang[b.zone] ||
				b.sources - a.sources ||
				b.occurrences - a.occurrences ||
				a.nom.localeCompare(b.nom, "fr")
			);
		})
		.slice(0, limite);
}

/** Répartition par voie de chargement, pour savoir quoi demander à qui. */
export function parVoie(manques: readonly Manque[]): Record<Manque["voie"], number> {
	const out: Record<Manque["voie"], number> = { sirene: 0, "annuaire-administratif": 0, manuel: 0 };
	for (const manque of manques) out[manque.voie]++;
	return out;
}
