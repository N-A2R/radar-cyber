/**
 * Détection des configurations de certificats CT qui élargissent la surface
 * d'attaque. Trois motifs, calculés uniquement à partir des champs observés
 * dans les CT logs (identités SAN et émetteur) :
 *
 *  - wildcard            : une identité SAN commence par '*.' ;
 *  - emetteur_hors_liste : émetteur absent de la liste blanche versionnée ;
 *  - certificat_etendu   : plus de cinq identités SAN distinctes.
 *
 * Une ligne `ct_anomalie` vaut pour un élément fautif précis : une identité
 * wildcard, une identité surnuméraire ou un émetteur. Un même certificat peut
 * donc produire plusieurs lignes, de motifs différents ou non. Le nombre de
 * lignes reste ainsi proportionnel au nombre d'élargissements observés, pas au
 * nombre de certificats.
 *
 * Doctrine : ces lignes sont des signaux de revue. Un émetteur inconnu de la
 * liste blanche n'est pas une fraude prouvée ; c'est une chaîne que personne
 * n'a encore vérifiée pour l'inventaire de Nouvelle-Aquitaine.
 */
import { ingestQuery, query } from "../db.js";

export const MOTIFS_CT = ["wildcard", "emetteur_hors_liste", "certificat_etendu"] as const;
export type MotifCT = (typeof MOTIFS_CT)[number];

/** Au-delà de cinq identités, chaque identité surnuméraire élargit la surface. */
export const SEUIL_IDENTITES_ETENDUES = 5;

export type CertificatCT = {
	certificatId: string;
	identites: string[];
	emetteur?: string | null;
	source?: string | null;
	domaine?: string | null;
	sousDomaine?: string | null;
	premiereVue?: string | null;
};

export type ListeBlancheCT = { version: string; emetteurs: ReadonlySet<string> };

export type AnomalieCT = {
	certificatId: string;
	motif: MotifCT;
	cible: string;
	emetteur: string | null;
	emetteurNorm: string | null;
	whitelistVersion: string;
	domaine: string | null;
	sousDomaine: string | null;
	source: string | null;
	premiereVue: string | null;
};

export type LigneInventaireCT = {
	sous_domaine: string;
	domaine: string | null;
	certificat_id: string | null;
	emetteur: string | null;
	source: string | null;
	premiere_vue: string | Date | null;
};

/** Découpe un DN en respectant les virgules à l'intérieur des guillemets. */
function attributsDn(dn: string): string[] {
	const parties: string[] = [];
	let courant = "";
	let guillemet = false;
	for (const caractere of dn) {
		if (caractere === '"') {
			guillemet = !guillemet;
			courant += caractere;
		} else if (caractere === "," && !guillemet) {
			parties.push(courant);
			courant = "";
		} else {
			courant += caractere;
		}
	}
	parties.push(courant);
	return parties;
}

/**
 * Clé stable d'un émetteur : valeurs O= et CN= du DN (ou nom brut si le DN
 * n'en porte pas), minuscules, guillemets retirés, triées puis jointes.
 * Le tri déterministe absorbe les variations d'ordre des attributs.
 */
export function normaliserEmetteur(emetteur: string): string {
	const valeurs = attributsDn(emetteur.trim())
		.map((partie) => partie.trim())
		.filter((partie) => /^(o|cn)=/i.test(partie))
		.map((partie) => partie.slice(partie.indexOf("=") + 1).trim())
		.map((valeur) => valeur.replace(/^"|"$/g, "").trim())
		.filter(Boolean)
		.map((valeur) => valeur.toLowerCase().replace(/\s+/g, " "))
		.sort();
	if (valeurs.length === 0) return emetteur.trim().toLowerCase().replace(/\s+/g, " ");
	return valeurs.join("|");
}

/** Dernière version publiée de la liste blanche (versions au format ISO). */
export async function versionCouranteWhitelist(): Promise<string> {
	const { rows } = await query<{ version: string }>(
		"SELECT version FROM ct_emetteur_whitelist GROUP BY version ORDER BY version DESC LIMIT 1",
	);
	const version = rows[0]?.version;
	if (!version) throw new Error("liste blanche des émetteurs absente : appliquer db/migrate-200-ct-anomalies.sql");
	return version;
}

/** Charge une version explicitement demandée, ou la version courante. */
export async function chargerListeBlanche(version?: string): Promise<ListeBlancheCT> {
	const retenue = version ?? (await versionCouranteWhitelist());
	const { rows } = await query<{ emetteur_norm: string }>(
		"SELECT emetteur_norm FROM ct_emetteur_whitelist WHERE version = $1",
		[retenue],
	);
	if (rows.length === 0) throw new Error(`version de liste blanche inconnue: ${retenue}`);
	return { version: retenue, emetteurs: new Set(rows.map((ligne) => ligne.emetteur_norm)) };
}

/** Détection pure : aucune écriture, reproductible pour un certificat donné. */
export function detecterAnomalies(certificat: CertificatCT, liste: ListeBlancheCT): AnomalieCT[] {
	const identites = [...new Set(certificat.identites.map((s) => s.trim()).filter(Boolean))];
	const emetteur = certificat.emetteur?.trim() || null;
	const emetteurNorm = emetteur ? normaliserEmetteur(emetteur) : null;

	const anomalie = (motif: MotifCT, cible: string): AnomalieCT => ({
		certificatId: certificat.certificatId,
		motif,
		cible,
		emetteur,
		emetteurNorm,
		whitelistVersion: liste.version,
		domaine: certificat.domaine ?? null,
		sousDomaine: certificat.sousDomaine ?? null,
		source: certificat.source ?? null,
		premiereVue: certificat.premiereVue ?? null,
	});

	const resultat: AnomalieCT[] = [];
	for (const identite of identites) {
		if (identite.startsWith("*.")) resultat.push(anomalie("wildcard", identite));
	}
	for (const identite of identites.slice(SEUIL_IDENTITES_ETENDUES)) {
		resultat.push(anomalie("certificat_etendu", identite));
	}
	if (emetteurNorm && !liste.emetteurs.has(emetteurNorm)) {
		resultat.push(anomalie("emetteur_hors_liste", emetteurNorm));
	}
	return resultat;
}

const LOT = 200;

/** Insère les anomalies détectées ; les rejeux ne comptent aucune nouvelle ligne. */
export async function enregistrerAnomalies(anomalies: AnomalieCT[]): Promise<number> {
	let inserees = 0;
	for (let debut = 0; debut < anomalies.length; debut += LOT) {
		const lot = anomalies.slice(debut, debut + LOT);
		const valeurs: unknown[] = [];
		const places: string[] = [];
		for (const a of lot) {
			valeurs.push(
				a.certificatId, a.motif, a.cible, a.emetteur, a.emetteurNorm,
				a.whitelistVersion, a.domaine, a.sousDomaine, a.source, a.premiereVue,
			);
			places.push(`($${valeurs.length - 9}, $${valeurs.length - 8}, $${valeurs.length - 7}, $${valeurs.length - 6}, $${valeurs.length - 5}, $${valeurs.length - 4}, $${valeurs.length - 3}, $${valeurs.length - 2}, $${valeurs.length - 1}, $${valeurs.length})`);
		}
		const resultat = await ingestQuery(
			`INSERT INTO ct_anomalie
			 (certificat_id, motif, cible, emetteur, emetteur_norm, whitelist_version,
			  domaine, sous_domaine, source, premiere_vue)
			 VALUES ${places.join(", ")}
			 ON CONFLICT (certificat_id, motif, cible) DO NOTHING`,
			valeurs,
		);
		inserees += resultat.rowCount ?? 0;
	}
	return inserees;
}

/** Détecte puis persiste les anomalies d'un ensemble de certificats. */
export async function analyserCertificats(
	certificats: CertificatCT[],
	version?: string,
): Promise<{ inserees: number; detectees: number; parMotif: Record<MotifCT, number> }> {
	const liste = await chargerListeBlanche(version);
	const anomalies = certificats.flatMap((certificat) => detecterAnomalies(certificat, liste));
	const parMotif: Record<MotifCT, number> = { wildcard: 0, emetteur_hors_liste: 0, certificat_etendu: 0 };
	for (const anomalie of anomalies) parMotif[anomalie.motif] += 1;
	return { inserees: await enregistrerAnomalies(anomalies), detectees: anomalies.length, parMotif };
}

/** Regroupe les lignes de l'inventaire CT par certificat (une ligne par SAN). */
export function certificatsDepuisInventaire(lignes: LigneInventaireCT[]): CertificatCT[] {
	const parCertificat = new Map<string, CertificatCT>();
	for (const ligne of lignes) {
		const certificatId = ligne.certificat_id?.trim();
		const identite = ligne.sous_domaine?.trim();
		if (!certificatId || !identite) continue;
		let certificat = parCertificat.get(certificatId);
		if (!certificat) {
			certificat = {
				certificatId,
				identites: [],
				emetteur: null,
				source: ligne.source,
				domaine: ligne.domaine,
				sousDomaine: identite,
				premiereVue: ligne.premiere_vue ? new Date(ligne.premiere_vue).toISOString() : null,
			};
			parCertificat.set(certificatId, certificat);
		}
		certificat.identites.push(identite);
		if (!certificat.emetteur && ligne.emetteur?.trim()) certificat.emetteur = ligne.emetteur;
	}
	return [...parCertificat.values()];
}
