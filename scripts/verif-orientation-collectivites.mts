#!/usr/bin/env -S npx tsx
/**
 * Contrôle du guichet d'orientation des collectivités victimes.
 *
 * Interroge réellement en HTTP l'URL de chaque alerte d'une organisation
 * `kind='collectivite'` (guichet NATIONAL 17Cyber), puis, si les 20 liens
 * répondent 200, écrit la date du contrôle dans `alert.lien_verifie_le`.
 *
 * C'est un contrôle de disponibilité, pas une collecte : aucune donnée
 * personnelle n'est lue ou stockée, et aucune source nationale n'est
 * présentée comme une source locale.
 *
 * Cadence : hebdomadaire. Le serveur API exécute le même contrôle au
 * démarrage puis chaque jour, et ne le rejoue que si la date stockée a plus
 * de 7 jours. En tâche de fond, l'équivalent est :
 *
 *   0 7 * * 1 cd /srv/radar-cyber && pnpm verif:orientation >> /var/log/radar-orientation.log 2>&1
 *
 * Usage :
 *   pnpm verif:orientation
 *   DATABASE_URL=postgres://... pnpm verif:orientation
 */
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
process.env.DATABASE_URL ??= DATABASE_URL;

// Import après fixation de DATABASE_URL : db.ts lit l'environnement au chargement.
const { query, closePools } = await import("../apps/api/src/db.js");
const { verifierOrientationCollectivites } = await import(
	"../apps/api/src/orientation/verification.js"
);

try {
	const r = await verifierOrientationCollectivites(query);
	for (const lien of r.liens) {
		console.log(`  alerte #${lien.alerte_id} ${lien.url} -> HTTP ${lien.code_http} (${lien.verifie_le})`);
	}
	console.log("--- Critère de sortie ---");
	console.log(`alertes org.kind='collectivite' : ${r.alertes}`);
	console.log(`HTTP 200 : ${r.ok}/${r.cible}`);
	console.log(`lien_verifie_le écrit : ${r.mises_a_jour} ligne(s)`);
	console.log(`lien_verifie_le : ${r.conforme ? r.verifie_le : "inchangé (contrôle en échec)"}`);
	console.log(r.conforme ? "CRITÈRE ATTEINT" : "CRITÈRE NON ATTEINT");
	if (!r.conforme) process.exitCode = 1;
} catch (err) {
	console.error(err);
	process.exitCode = 1;
} finally {
	await closePools();
}
