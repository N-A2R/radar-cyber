# Rapport — classification du secteur et du mode opératoire

Date : 22 novembre 2026. Branche : `ext/chantier-l2`. Instantané figé dans
`bench/results/sector-mode-f1.json` (empreinte des étiquettes
`d8bfd341682254ea`).

## Résultat chiffré

**F1 mesuré : 0,9938** — moyenne des macro-F1 des deux axes, sur 56 cas annotés
de Nouvelle-Aquitaine.

| Mesure | Valeur |
|---|---:|
| **F1 (objectif, moyenne des macro-F1 secteur et mode)** | **0,9938** |
| Macro-F1 secteur (9 classes) | 1,0000 |
| Macro-F1 mode (7 classes observées) | 0,9875 |
| F1 pondéré par l'effectif des classes | 0,9911 |
| Correspondance exacte du couple secteur + mode | 0,9821 |
| Cas annotés | 56 |

Le détail par classe est dans le JSON archivé. Le seul écart restant porte sur
`na-couv-002` : le corpus vérifié annotait « ransomware » d'après sa source,
mais le texte public ne documente qu'une publication de données sur un site
darknet ; le classificateur répond `data-leak`. L'étiquette d'origine a été
conservée plutôt que corrigée après coup, pour ne pas effacer l'erreur.

## État réel de départ

La mesure enregistre les compteurs de la base locale au moment du rejeu :
**1 673 151 organisations**, **312 sources**, **26 259 événements**, dont
**71 événements régionaux**. Le corpus annoté est issu des incidents NA
vérifiés déjà versionnés (`bench/couverture/incidents.jsonl` et les fichiers
départementaux) : 49 des 50 incidents canoniques (un cas dont le titre était
désaligné avec son organisation a été écarté) et 7 incidents complémentaires
pour couvrir le bâtiment, le commerce, la santé, le déni de service et les
fuites sportives.

## Définition de la tâche et de la métrique

Pour chaque incident, le classificateur lit **uniquement** le nom de
l'organisation, le titre et le résumé publics. Il ne lit ni le champ `type` du
corpus, ni `event.family`, ni la colonne sectorielle du référentiel : ces
valeurs servent seulement de contrôle croisé à l'annotation. Deux étiquettes
sont produites :

- **secteur** : `agro-food`, `industry`, `construction`, `commerce`, `health`,
  `education`, `public`, `services`, `other` ;
- **mode** : `ransomware`, `data-leak`, `phishing`, `fraud`, `defacement`,
  `service-disruption`, `compromise`, `unknown`.

Les règles sont déterministes, ordonnées et sans apprentissage : premier
signal reconnu, sinon `other`/`unknown`. La sortie ne contient qu'une étiquette
et l'identifiant de la règle, jamais un fragment du texte d'entrée. Pour chaque
axe, on calcule la précision, le rappel et le F1 par classe, puis leur moyenne
sur les classes effectivement présentes (macro-F1). Le chiffre publié est la
moyenne des deux macro-F1, afin que le secteur et le mode pèsent également.

## Commande reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:sector-mode-f1 --json=bench/results/sector-mode-f1.json
```

Durée mesurée : **0,66 s**, sans réseau ni service payant. Le même chiffre est
rejouable ; l'horodatage du JSON change, pas les métriques. Rejeu sans base :
la commande fonctionne aussi sans `DATABASE_URL`, en omettant le bloc de
compteurs.

## Ce qui a été livré

- `apps/api/src/classification/sector-mode.ts` — classificateur et calcul des
  métriques, en anglais, sans dépendance applicative.
- `bench/corpus/sector-mode-labels.jsonl` — 56 étiquettes annotées, sans donnée
  personnelle de victime.
- `scripts/measure-sector-mode-f1.mts` — mesure reproductible, lecture seule,
  avec instantané des compteurs de la base quand `DATABASE_URL` est fourni.
- `apps/api/test/sector-mode.test.ts` — **27 tests, un par comportement**
  observable (règles secteur, règles mode, négation d'une fuite, priorité
  santé/enseignement, calcul du F1, absence de texte d'entrée dans la sortie).
- `package.json` — commande `measure:sector-mode-f1`.

Vérifications : **27/27 tests réussis**, `tsc --noEmit` sans erreur, mesure
rejouée à 0,9938. `apps/api/src/server.ts` est inchangé (**0 ligne de diff**).

## Périmètre et limites

- Nouvelle-Aquitaine uniquement : le corpus annoté est régional et la mesure
  n'agrège aucun événement hors région ; les sources grises sont admises au
  même titre que les sources institutionnelles, sans liste de confiance.
- Aucune donnée personnelle de victime n'est collectée ni écrite : les textes
  source sont des titres et résumés publics d'incidents d'organisations, les
  descriptions de témoins entre parenthèses sont retirées avant classification,
  et le rapport ne contient ni nom de personne ni coordonnée.
- Aucun service payant, aucun appel réseau : tout est rejouable depuis le
  dépôt et une base PostgreSQL locale.
- Le score est **descriptif de ce corpus de 56 cas**, pas une estimation de
  généralisation : les règles ont été écrites sur ce même jeu, sans partition
  d'entraînement et de test. Un nouveau jeu annoté devra être mesuré avant
  toute extrapolation à d'autres départements ou à d'autres années.
- `other` et `unknown` sont des abstentions explicites, pas des rebuts : une
  actualité locale sans technique cyber identifiable n'est pas forcée dans un
  mode.
