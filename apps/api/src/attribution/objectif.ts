/**
 * Objectif chiffré du chantier « attribution des revendications ».
 *
 * La ligne publiée est produite depuis la mesure (nombre de codes Admiralty
 * valides), jamais recopiée à la main dans le rapport et le vérificateur.
 */

export const OBJECTIF_CODES_ADMIRALTY_MIN = 50;

export type ObjectifAttributions = {
  valeur: number;
  cible: number;
  atteint: boolean;
  ligne: string;
};

export function mesurerObjectifAttributions(valeur: number): ObjectifAttributions {
  const cible = OBJECTIF_CODES_ADMIRALTY_MIN;
  const atteint = valeur >= cible;
  const ligne = atteint
    ? `OBJECTIF : atteint — ${valeur} / ${cible}`
    : `OBJECTIF : partiel — ${valeur} / ${cible}, manque ${cible - valeur} lignes avec code Admiralty valide`;
  return { valeur, cible, atteint, ligne };
}

/** La déclaration publiée doit être exacte et unique, jamais une variante périmée. */
export function verifierDeclarationObjectifAttributions(rapport: string, ligne: string): boolean {
  return rapport.split(/\r?\n/).filter((publiee) => publiee === ligne).length === 1;
}
