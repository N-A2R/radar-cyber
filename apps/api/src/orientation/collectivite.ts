/**
 * Réflexe à joindre à toute alerte concernant une collectivité victime.
 *
 * 17Cyber / Cybermalveillance.gouv.fr est un dispositif NATIONAL d'assistance
 * aux victimes : il n'est pas une source locale et n'est pas présenté comme
 * telle. Les cinq actions ci-dessous sont la version courte, opérationnelle,
 * inscrite dans l'alerte elle-même (colonnes `url_orientation`, `actions`,
 * `lien_verifie_le`) et dans le message diffusé (webhook / Telegram).
 *
 * Le SQL de la migration 200 porte la même liste : le test
 * `apps/api/test/orientation-collectivite.test.ts` vérifie l'égalité afin
 * qu'aucune des deux copies ne dérive.
 */

export const URL_ORIENTATION_COLLECTIVITE = "https://www.cybermalveillance.gouv.fr";

/** Date du contrôle HTTP réel du guichet (GET -> 200), avant migration. */
export const ORIENTATION_VERIFIEE_LE = "2026-11-22T12:42:25.000Z";

/** Une vérification plus vieille que ce délai doit être rejouée. */
export const ORIENTATION_FRAICHEUR_MS = 7 * 24 * 3600 * 1000;

export const ACTIONS_ORIENTATION_COLLECTIVITE = [
  "Isoler sans éteindre : couper le réseau des postes touchés (câble/Wi-Fi) sans couper l'alimentation, pour préserver les traces volatiles.",
  "Conserver les preuves : photographier les écrans, garder courriels et journaux, noter l'heure de découverte et l'étendue des postes touchés.",
  "Demander de l'aide à 17Cyber (Cybermalveillance.gouv.fr) : https://www.cybermalveillance.gouv.fr — guichet national gratuit d'assistance aux victimes.",
  "Signaler sans attendre à la police ou à la gendarmerie (17) et prévenir le référent cyber de la collectivité ainsi que la préfecture.",
  "Si des données personnelles sont concernées, déclarer l'incident à la CNIL dans les 72 heures, puis consigner la chronologie et les mesures prises.",
] as const;

export type OrientationCollectivite = {
  url_orientation: string;
  actions: string[];
  lien_verifie_le: string;
};

export function orientationCollectivite(
  verifieLe: string = ORIENTATION_VERIFIEE_LE,
): OrientationCollectivite {
  return {
    url_orientation: URL_ORIENTATION_COLLECTIVITE,
    actions: [...ACTIONS_ORIENTATION_COLLECTIVITE],
    lien_verifie_le: verifieLe,
  };
}
