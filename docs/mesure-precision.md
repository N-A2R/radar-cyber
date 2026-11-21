# Mesure de précision du rattachement — protocole

Vague « précision » (docs/plans/wave-precision.md), état dans
`bench/state/wave-precision.json`. Ce document est le protocole complet :
quelqu'un d'autre peut le rejouer et retrouver les mêmes chiffres.

## Définitions (figées pour toute la vague)

| Verdict | Sens |
|---|---|
| **exacte** | l'organisation trouvée est celle que le texte désigne |
| **partielle** | bonne enseigne ou groupe, mauvaise entité (siège/établissement, filiale/maison mère) |
| **hors_sujet** | aucune relation réelle (homonyme, mot générique, TLD) |
| **indécidable** | le texte ne permet pas de trancher, même avec le registre |

**Précision** = `(exacte + partielle/2) / (exacte + partielle + hors_sujet)`.
Les indécidables sortent du dénominateur et se comptent à part.

## Population et unité

Population : les indices réels traités par le flux — lignes `quarantine_raw`
de type `claim` portant un `org_hint` non vide. Le rattachement proposé est
calculé par le moteur livré (`matchOrgInIndex`,
`apps/api/src/quarantine/promote.ts`). Unité de tirage : la paire (indice
normalisé, organisation proposée) — une même victime citée dix fois pèse une
fois. Population mesurée au S1.1 : 16 752 lignes, 15 918 indices distincts,
**1 992 unités** rattachées.

Strates : confiance (haute ≥ 0,85 = seuil de promotion automatique ;
moyenne ≥ 0,7 ; faible) × source × type (règle gagnante du moteur :
domaine, nom, sigle, ville). Répartition : 1 403 sigle, 243+1 nom moyenne,
257 nom haute, 76+4 domaine, 3 ville.

## Étape 1 — tirage (`scripts/precision-echantillon.mts`)

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  tsx scripts/precision-echantillon.mts --phase=population
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  tsx scripts/precision-echantillon.mts --phase=tirage --taille=500 \
  --graine=20261121 --json=bench/precision/corpus-v1.json
```

Le préfiltre mémoire (index jeton→organisations, 2,7 M paires) est prouvé
sur-ensemble du moteur et vérifié équivalent au préfiltre livré
(`loadCandidateIndex`) sur 40 indices — le livré coûte ~1,3 s par indice sur
1,24 M d'organisations, le mémoire 0,07 ms (S4.3).

## Étape 2 — preuves et verdicts (`scripts/precision-verifier.mts`)

Chaque entrée reçoit deux canaux de preuve, puis un verdict posé à la main :

1. **registre** — recherche-entreprises.api.gouv.fr interrogé sur le SIREN
   de l'organisation, sinon son code d'entité à 9 chiffres, sinon par nom ;
   requête + réponse consignées ;
2. **site** — le domaine cité par l'indice et le site du référentiel ;
   URL finale + extrait verbatim (titre, og:site_name, début du texte).

Les verdicts se posent par lots (`--verdicts=…`) et vivent dans le corpus.
Un verdict sans preuve n'existe pas ; un verdict comparant deux noms par
script est circulaire et interdit.

## Étape 3 — gel (`S1.4`)

`bench/precision/corpus-v1.json` figé, SHA-256 écrite dans l'état
(`71e835ac…`). On peut ajouter des champs, jamais changer un verdict ; un
changement passe par un fichier séparé, daté et motivé.

## Étape 4 — précision et bruit (`scripts/precision-baseline.mts`)

Deux tirages neufs de 100 (graines 20261201, 20261202), vérifiés par le même
protocole : l'écart entre leurs précisions est le bruit à n=100.

## Étape 5 — règles (`scripts/precision-regles.mts`)

Les règles candidates sont appliquées au corpus et à un échantillon frais
(graine neuve) ; une règle qui ne tient pas sur le frais est retirée.
Retenues (spec : `apps/api/src/match/regles-precision.ts`, tests :
`apps/api/test/regles-precision.test.ts`) :

| # | Règle | Ce qu'elle casse |
|---|---|---|
| 1 | un seul jeton ne fonde pas un rattachement (0,7) | les victimes désignées par un nom d'un mot passent en revue |
| 2 | à 0,75 l'indice doit être couvert par le nom | les indices porteurs de mots descriptifs hors du nom |
| 3 | un indice masqué ne fonde jamais de rattachement | rien de vérifié exact |
| 4 | les indices à marqueur de fuite ne matchent que par le domaine | rien (défensive) |
| 5 | TLD — couvert par la règle 1, sans effet propre | — |
| 6 | le chemin ville+nom (0,6) est retiré | rien de vérifié exact |

## Étape 6 — généralisation et coût (`S4`)

Échantillon frais de 500 (graine 20261225, tirage corrigé proportionnel),
500 verdicts : la précision brute du frais EST l'estimateur de population.
Coût mesuré par `scripts/precision-cout.mts` sur les mêmes indices contre
1 244 106 organisations.

## Étape 7 — jeu d'or (`scripts/precision-gold.mts`)

50 cas pièges tirés du corpus gelé (verdict + comportement de règles
épinglés). Vérification : `tsx scripts/precision-gold.mts --verifier` —
branché dans `verify-all.sh`.

## Résultats (2026-11-21)

| Mesure | valeur |
|---|---|
| Précision de départ (population, stratifié) | **4,5 %** |
| Précision de départ (frais proportionnel, brut) | **5,7 %** |
| Bruit à n=100 (deux tirages, stratifié) | 0,5 point |
| Après le jeu complet de règles (frais, brut) | **83,3 %** |
| Après les règles (population ; 29 % encore rattachée) | **13,8 %** |
| Coût du rattachement (chemin livré / mémoire / +règles) | 1 254 ms / 0,07 ms / +0,00 ms par indice |
| Jeu d'or | 50/50 |

Modes d'échec des hors_sujet (282 du gelé, `bench/precision/modes-echec-v1.json`) :
sigle 123, homonyme 95, commentaire 30, masquage 24, TLD 5, ville 3, encodage 2.

## Limites connues du protocole

- Le tirage S1.1 (corpus gelé) a une allocation **égale** entre strates au
  lieu de la proportionnelle documentée — l'estimateur brut du gelé (21,8 %)
  n'est pas celui de la population ; l'estimateur stratifié pondéré le
  corrige et le tirage est corrigé depuis (S4 utilise le tirage corrigé).
- Les indécidables (égalités de nom sans site ni domaine) sortent du
  dénominateur : la vraie précision des strates concernées est bornée, pas
  mesurée. C'est une voie de revue humaine, pas une règle.
- Le frein des domaines : le référentiel ne porte le domaine que pour 69
  organisations — les rattachements par domaine exact (les seuls ~95 %
  précis) dépendent de l'enrichissement du référentiel, pas du moteur.
