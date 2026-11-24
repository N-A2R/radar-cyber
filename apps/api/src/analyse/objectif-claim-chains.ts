/**
 * Objectif chiffré du chantier « chaînes d'affirmations répétées sans source
 * primaire ». La ligne publiée est calculée depuis la mesure reproductible de
 * `pnpm mesure:claim-chains`, jamais recopiée à la main dans deux endroits.
 */

export const OBJECTIF_RUMEURS_MIN = 1;

export type MesureObjectifClaimChains = {
  rumeurs: number;
};

/** La ligne normative, identique dans le rapport et dans la mesure. */
export function ligneObjectifClaimChains(mesure: MesureObjectifClaimChains): string {
  const livree = `${mesure.rumeurs}`;
  const cible = `≥${OBJECTIF_RUMEURS_MIN}`;
  if (mesure.rumeurs >= OBJECTIF_RUMEURS_MIN) {
    return `OBJECTIF : atteint — ${livree} / ${cible}`;
  }
  const manque = Math.max(0, OBJECTIF_RUMEURS_MIN - mesure.rumeurs);
  return (
    `OBJECTIF : partiel — ${livree} / ${cible}, manque ` +
    `${manque} chaîne${manque === 1 ? "" : "s"} d'affirmations répétées sans source primaire`
  );
}

/** Le rapport doit porter exactement une fois la ligne mesurée, pas une variante. */
export function verifierDeclarationObjectifClaimChains(rapport: string, ligne: string): boolean {
  return rapport.split(/\r?\n/).filter((publiee) => publiee === ligne).length === 1;
}
