/**
 * Identifiants SIREN synthétiques des fixtures.
 *
 * La suite partage une base unique : tout SIREN en dur réutilisé par deux
 * fichiers viole `org_siren_unique_idx`. On dérive donc neuf chiffres du nom
 * de la fixture — stables d'une exécution à l'autre, distincts entre noms —
 * sans jamais tirer au hasard, pour que les tests restent reproductibles.
 */
import { createHash } from "node:crypto";

export function sirenUnique(nom: string): string {
	const digest = createHash("sha256").update(nom).digest();
	return String(digest.readUInt32BE(0) % 1_000_000_000).padStart(9, "0");
}
