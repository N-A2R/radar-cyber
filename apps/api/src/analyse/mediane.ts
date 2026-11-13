/**
 * Médiane, y compris sur un effectif pair.
 *
 * `Math.floor(n / 2)` sur une liste triée rend la valeur *haute* d'un
 * effectif pair : sur deux retards de 2 h et 12 h, il annonce 12 h. Ce biais
 * va toujours dans le sens du chiffre qui arrange — un retard, une avance —
 * et c'est exactement le genre d'erreur qui ne se voit pas. On moyenne.
 */
export function mediane(valeurs: readonly number[]): number | null {
	if (valeurs.length === 0) return null;
	const triees = [...valeurs].sort((a, b) => a - b);
	const milieu = Math.floor(triees.length / 2);
	if (triees.length % 2 === 1) return triees[milieu] ?? null;
	const bas = triees[milieu - 1];
	const haut = triees[milieu];
	return typeof bas === "number" && typeof haut === "number" ? (bas + haut) / 2 : null;
}
