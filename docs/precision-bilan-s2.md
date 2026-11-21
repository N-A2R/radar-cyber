# Bilan S2 — les deux modes d'échec dominants

Date : 2026-11-21. Corpus gelé : `bench/precision/corpus-v1.json`
(SHA-256 `71e835ac…`, inchangée). Mesures :
`bench/results/precision-regle1-s2.json`, `bench/results/precision-regle12-s2.json`,
échantillon frais `bench/precision/tirage-frais-s2.json` (graine 20261210,
tirage corrigé — allocation proportionnelle vérifiée : 71 sigle/100).

## Rappel : la précision de départ

L'estimateur brut du corpus gelé (21,8 %) n'est pas celui de la population :
le round-robin du tirage S1.1 a produit une allocation égale entre strates.
L'estimateur stratifié pondéré donne la précision de population :
**4,5 %** — la strate sigle (70 % des 1 992 unités de la population) sort
~0 % de précision, la strate domaine (4 %) sort ~95 %.

## Règle n°1 — « un seul jeton ne fonde pas un rattachement »

Le chemin jeton-unique du moteur (via=name, confiance 0,7) est éliminé.

| Mesure | avant | après |
|---|---|---|
| Écartées | — | 140/500 (128 hors_sujet, 12 indécidables, **0 exacte, 0 partielle**) |
| Précision brute (corpus) | 21,8 % | 33,7 % |
| Précision population | 4,5 % | **15,4 %** (le moteur ne rattache plus que 29,4 % de la population) |
| Échantillon frais (n=100, 29 survivants vérifiés) | 13,2 % | — |

**Tient sur le frais** : 13,2 % mesuré contre 15,4 % prédit — l'écart est
dans le bruit d'échantillonnage (n=29). La règle casse les rattachements à
un seul jeton distinctif que le moteur visait (« Kenall/Legrand ») : aucun
n'a été vérifié exact dans le corpus ; les victimes à nom d'un seul mot
repassent en revue humaine.

## Règle n°2 — « le nom de l'organisation doit couvrir l'indice »

Sur le chemin tous-jetons (via=name, confiance 0,75), chaque jeton
discriminant de l'indice doit figurer dans le nom de l'organisation —
l'indice ne peut pas être plus précis que le nom.

| Mesure | avant (règle 1) | après (règles 1+2) |
|---|---|---|
| Écartées (cumulé) | 140/500 | 257/500 (116 hors_sujet de plus, 1 partielle, 12 indécidables) |
| Précision brute (corpus) | 33,7 % | **66,4 %** |
| Précision population | 15,4 % | **19,1 %** (16,7 % de la population encore rattachée) |
| Échantillon frais (17 survivants vérifiés) | 13,2 % | **22,8 %** (brut : 66,7 %) |

**Tient sur le frais** : 66,7 % mesuré contre 66,4 % prédit.
Ce qu'elle casse : une partielle — « Atos (Business Services · France) » vers
ATOS FRANCE, dont l'indice porte « Business Services », absent du nom. Les
règles 1+2 cassent au total **0 exacte**.

## Ce qui reste (pour S3)

Les 38 hors_sujet qui survivent aux deux règles, par mode :
masquage 24 (noms masqués de la liste rattachés à des orgs de 1-2 lettres —
la longueur du masque prouve la non-identité : règle candidate évidente),
commentaire ~12 (jetons du commentaire de fuite), TLD 2 (domaine étranger).
Et la masse d'indécidables (124) : des égalités de nom sans site ni domaine
— ce n'est pas une règle qui les règle, c'est une voie de revue humaine ou
l'ajout de domaines dans le référentiel.

## Décision

Les deux règles sont retenues (elles tiennent toutes deux sur l'échantillon
frais). Elles deviennent des tests de régression en S5.1 ; le moteur livré
n'est pas modifié dans cette vague — la mesure est faite hors ligne sur les
rattachements que le moteur proposerait, pas en production.
