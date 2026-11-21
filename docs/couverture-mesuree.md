# Couverture mesurée — douze mois glissants

**Réponse mesurée le 21 novembre 2026** (fenêtre glissante
`2025-11-01 → 2026-10-31`, corpus de 60 incidents dont 42 publiés dans la
fenêtre) : le radar aurait vu **31 incidents sur 42 (73,8 %)**. Trois de ces
« vus » rattachent une autre organisation : **28 sont défendables (66,7 %)**,
c'est le chiffre à publier. Les 11 non vus ont tous une raison écrite : 0 refus
à l'admission, 6 organisations absentes du référentiel, 5 présentes mais non
reconnues par le moteur.

**Quand ?** Le délai médian entre la date du fait et sa première publication
est de **2 jours** (41 incidents datés sur 42 ; maximum 1 834 jours). C'est une
borne basse : le radar ne peut pas voir avant la publication. Ce n'est **pas**
sa latence de collecte, qui se mesure sur le flux réel (1,9 jour médian sur
933 faits, bulletins CVE exclus — `docs/mesure-couverture.md`) : le corpus est
rejoué contre le moteur, il n'est pas ingéré, donc aucun délai réel par incident
n'est mesurable ici.

La réponse est mauvaise mois par mois : **décembre 2025 (1/4, 25 %)** et
**mars 2026 (1/3, 33,3 %)** sont très sous la cible de 60 %, et le délai médian
de publication passe de **25 jours en février 2026** à **1 jour en octobre**.
La moyenne annuelle cache ces trous ; ils sont publiés ci-dessous.

## Mois par mois

| Mois de publication | Publiés | Vus | Couverture | Délai médian fait → publication | Délai max |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2025-11 | 2 | 2 | 100 % | 17 j | 31 j |
| 2025-12 | 4 | 1 | 25 % | 2 j | 1 834 j |
| 2026-01 | 1 | 1 | 100 % | 2 j | 2 j |
| 2026-02 | 3 | 2 | 66,7 % | 25 j | 122 j |
| 2026-03 | 3 | 1 | 33,3 % | 13 j | 107 j |
| 2026-04 | 6 | 4 | 66,7 % | 3 j | 4 j |
| 2026-05 | 1 | 1 | 100 % | 3 j | 3 j |
| 2026-06 | 1 | 1 | 100 % | 4 j | 4 j |
| 2026-07 | 3 | 3 | 100 % | 0 j | 2 j |
| 2026-08 | 5 | 5 | 100 % | 2 j | 30 j |
| 2026-09 | 4 | 3 | 75 % | 5 j | 7 j |
| 2026-10 | 9 | 7 | 77,8 % | 1 j | 2 j |
| **Total** | **42** | **31** | **73,8 %** | **2 j** | **1 834 j** |

Le délai maximum de décembre 2025 est un incident de 2021 relaté en 2026 :
ce n'est pas une latence, c'est l'âge du fait. La médiane l'absorbe ; la
moyenne aurait été faussée. Un incident n'a pas de `dateIncident` et est exclu
du délai, pas du dénominateur de couverture.

## Graphique ASCII — délai médian par mois

```
Délai médian fait → publication (1 # = 1 jour) :
  2025-11 |#################                   |    17 j  (2/2 vus, n=2)
  2025-12 |##                                  |     2 j  (1/4 vus, n=4)
  2026-01 |##                                  |     2 j  (1/1 vus, n=1)
  2026-02 |#########################           |    25 j  (2/3 vus, n=3)
  2026-03 |#############                       |    13 j  (1/3 vus, n=3)
  2026-04 |###                                 |     3 j  (4/6 vus, n=6)
  2026-05 |###                                 |     3 j  (1/1 vus, n=1)
  2026-06 |####                                |     4 j  (1/1 vus, n=1)
  2026-07 |                                    |     0 j  (3/3 vus, n=3)
  2026-08 |##                                  |     2 j  (5/5 vus, n=5)
  2026-09 |#####                               |     5 j  (3/4 vus, n=3)
  2026-10 |#                                   |     1 j  (7/9 vus, n=9)
```

Les mois sans publication resteraient des barres vides, pas des lignes omises.
Ici les douze mois ont au moins un incident.

## Ce que les trois « vus » non défendables disent

| Incident | Organisation trouvée |
| --- | --- |
| Magasins de grande distribution touchés en Béarn et Soule | carrefour city |
| Réseau Alumni de l'Université de Bordeaux | alumnforce |
| FFRandonnée — fichier adhérents | federation francaise de la randonnee pedestre |

Le dernier cas est probablement une erreur du *classificateur de qualité* : le
sigle `FFRandonnée` développe correctement le nom trouvé. Le publier quand même
vaut mieux que d'arrondir le taux à la hausse : la mesure doit exposer ses
doutes, pas les absorber.

## Méthode et reproductibilité

- La fenêtre est calculée : 12 mois calendaires clos, du premier jour du mois
  douze mois avant au dernier jour du mois précédant la mesure. Le mois en
  cours est exclu pour ne pas faire baisser le taux pour des raisons de
  calendrier. `--fin=YYYY-MM-DD` fige le dernier mois inclus pour un rejeu.
- Chaque incident passe par la porte d'admission du contrat
  (`contract/admit.ts`) puis par le moteur de rattachement réel
  (`match/gazetteer.ts`) — aucune simulation de détection.
- Base utilisée pour cette mesure : 1 244 048 organisations, issue de la
  restauration de l'image PostgreSQL locale du 20 novembre 2026, avec les
  migrations du dépôt appliquées. Le corpus et le script sont versionnés ;
  l'image de base ne l'est pas, ce qui limite la reproductibilité du taux brut.
- Limite du corpus : il s'arrête aux publications de novembre 2026. La fenêtre
  glisse, le corpus non : une mesure faite plus tard devra ajouter les incidents
  des nouveaux mois avant d'afficher un taux.
- Résultat publié : `bench/results/couverture-2026-11-21.json` (motif, cause,
  qualité et délai par incident).

```bash
pnpm tsx scripts/mesure-couverture.mts --json=bench/results/couverture-2026-11-21.json
pnpm tsx scripts/mesure-couverture.mts --fin=2026-10-31   # rejeu de cette fenêtre
```
