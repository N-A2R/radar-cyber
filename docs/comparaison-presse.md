# Comparaison presse / radar — dix incidents du corpus

Mesure du **21 novembre 2026**. Corpus : `bench/fixtures/corpus-reference-na.json`
 (60 incidents, fenêtre `2025-11-01 → 2026-10-31`).

**Objectif déclaré** (22 novembre 2026) : comparer dix incidents publics vérifiés de Nouvelle-Aquitaine — cible **presse 10 / 10, radar 0 / 10**, écart médian 134 jours. Mesure : `pnpm mesure:comparaison-presse -- --check`, sans base ni réseau ; sortie détaillée dans `bench/results/comparaison-presse.json`.

OBJECTIF : atteint — 10 / 10

## La question posée

Pour dix incidents publics vérifiés, **qui a vu l'incident en premier : la presse
ou le radar ?** C'est la mesure la plus simple de l'utilité du produit — et la
moins flatteuse. Elle ne demande ni taux de rattachement, ni scoring : deux
dates et une comparaison.

## Méthode

1. **Sélection déterministe** : les dix premiers incidents du corpus dont la
   preuve principale est un article de presse. Les communiqués d'organisation et
   les sites de revendication sont écartés de la sélection, pour que « date de
   publication par la presse » désigne bien un article de presse. Cela donne
   `na-2026-001` à `na-2026-008`, puis `na-2026-012` et `na-2026-013` : aucun
   choix a posteriori sur le résultat.
2. **Date presse** : champ `datePublique` de l'incident, c'est-à-dire la date de
   publication de l'article consigné dans `preuve` (vérifié à la consultation).
   Ce n'est pas `dateIncident`, qui date la survenue de l'attaque dans le monde.
3. **Date radar** : champ `preuve.consulteLe` — première trace datée de
   l'incident dans la mémoire du projet, lors de la constitution du corpus
   versionné. Les dix incidents concernés ont été consultés le **12 novembre
   2026** et versés dans le corpus committé le 13 (`ca40bf6`).
4. **Règle de décision** : en comparant les deux dates calendaires. Écart en jours
   = date radar − date presse. Un écart positif signifie que la presse a publié
   avant que l'incident n'entre dans le radar.

**Ce que la date radar n'est pas.** Ce n'est pas l'horodatage d'un détecteur.
Aucun événement de la table `event` ne correspond à ces dix incidents : requête
sur `title`, `summary` et `source_url` avec les noms d'entité et les URL des
articles, **0 correspondance** au 21 novembre 2026 (les seules occurrences de
« Ymed » dans la base sont du bruit de descriptions CVE sans rapport). La
collecte automatique de cette base n'a d'ailleurs démarré que le **13 novembre
2026** (premier `collected_at` : `2026-11-13T20:38:42Z`). La date du 12 novembre
est donc une **borne supérieure** : c'est au plus tôt à ce moment-là que le
radar a su, et il l'a su par une recherche humaine dans la presse, pas par ses
flux. Dire « première apparition dans le radar » ici, c'est dire « première
entrée dans la mémoire du projet », pas « première détection ».

## Résultat global

> **Presse : 10 / 10. Radar : 0 / 10.**
> Écart entre publication et première trace radar : **médiane 134 jours**,
> minimum 30 jours, maximum 636 jours.

| Incident | Entité | Presse (date, éditeur) | 1ʳᵉ trace radar | Écart | Premier | Couverture au 21/11 |
| --- | --- | --- | --- | --- | --- | --- |
| `na-2026-001` | Ymed / Sooncare | 2026-04-09 · Sud Ouest | 2026-11-12 | 217 j | **Presse** | non vu (`pas_rattache`) |
| `na-2026-002` | Mairie de Marennes-Hiers-Brouage | 2026-08-19 · Sud Ouest | 2026-11-12 | 85 j | **Presse** | vu (exact) |
| `na-2026-003` | Ville de Tarnos | 2026-08-29 · Sud Ouest | 2026-11-12 | 75 j | **Presse** | vu (exact) |
| `na-2026-004` | Mairie d'Espelette | 2026-09-16 · Sud Ouest | 2026-11-12 | 57 j | **Presse** | vu (exact) |
| `na-2026-005` | EHPAD Résidence du Parc de Champdeniers | 2025-12-11 · ICI Poitou | 2026-11-12 | 336 j | **Presse** | non vu (`pas_rattache`) |
| `na-2026-006` | Ville de Gradignan — police municipale | 2026-05-13 · Sud Ouest | 2026-11-12 | 183 j | **Presse** | vu (exact) |
| `na-2026-007` | Mairie de Fumel | 2025-10-03 · France 3 NA | 2026-11-12 | 405 j | **Presse** | hors fenêtre |
| `na-2026-008` | Collège La Salle de Brive-la-Gaillarde | 2025-02-14 · La Dépêche | 2026-11-12 | 636 j | **Presse** | hors fenêtre |
| `na-2026-012` | Intermarché d'Altillac | 2026-10-13 · France 3 NA | 2026-11-12 | 30 j | **Presse** | vu (exact) |
| `na-2026-013` | Magasins en Béarn et Soule | 2026-10-12 · La République des Pyrénées | 2026-11-12 | 31 j | **Presse** | vu (partiel) |

## Cas par cas

### `na-2026-001` — Ymed / Sooncare (217 j)

Sud Ouest publie le **9 avril 2026** l'alerte sur la fuite de données chez
l'éditeur de Sooncare, après une attaque du 6 avril. Le radar n'a alors aucune
collecte en cours : l'incident n'entre dans sa mémoire que le **12 novembre
2026**, lors de la consultation de l'article pour le corpus. **Premier : la
presse.** Le re-jeu de couverture ne rattache pas l'entité.

### `na-2026-002` — Marennes-Hiers-Brouage (85 j)

Sud Ouest rapporte le **19 août 2026** le piratage de la messagerie municipale
signalé le 17. Première trace radar le **12 novembre 2026**, 85 jours après.
**Premier : la presse.** L'incident est compté « vu » dans la mesure de
couverture : il a été reconnu au re-jeu, pas vu avant publication.

### `na-2026-003` — Tarnos (75 j)

Sud Ouest publie le **29 août 2026** l'annonce de l'attaque Zimbra avec demande
de rançon, survenue le 27. Première trace radar le **12 novembre 2026**.
**Premier : la presse**, de 75 jours. Cas « vu » au re-jeu, lui aussi sans
antériorité radar.

### `na-2026-004` — Espelette (57 j)

Sud Ouest décrit le **16 septembre 2026** les mails piégés envoyés depuis la
mairie après une attaque du 11 septembre. Première trace radar le **12 novembre
2026**. **Premier : la presse**, de 57 jours — le troisième écart le plus court
de l'échantillon, après Altillac (30 j) et la Béarn/Soule (31 j).

### `na-2026-005` — EHPAD de Champdeniers (336 j)

ICI Poitou publie le **11 décembre 2025** le rançongiciel visant l'EHPAD
Résidence du Parc (attaque du 8 décembre). Première trace radar le **12
novembre 2026**, soit 336 jours plus tard. **Premier : la presse.** L'incident
n'est pas rattaché au re-jeu de couverture.

### `na-2026-006` — Police municipale de Gradignan (183 j)

Sud Ouest révèle le **13 mai 2026** l'extraction de données de la police
municipale après une attaque du 10 mai. Première trace radar le **12 novembre
2026**. **Premier : la presse**, de 183 jours. Incident « vu » au re-jeu.

### `na-2026-007` — Mairie de Fumel (405 j)

France 3 Nouvelle-Aquitaine rapporte le **3 octobre 2025** la paralysie de la
mairie par chiffrement et rançon, le jour même de l'attaque. Première trace
radar le **12 novembre 2026**. **Premier : la presse**, de 405 jours. L'incident
est hors fenêtre de mesure, mais l'écart reste comparable.

### `na-2026-008` — Collège La Salle de Brive (636 j)

La Dépêche publie le **14 février 2025** le rançongiciel qui a fait perdre les
bulletins scolaires (attaque du 15 janvier). Première trace radar le **12
novembre 2026**, 636 jours après : le plus grand écart de l'échantillon.
**Premier : la presse.**

### `na-2026-012` — Intermarché d'Altillac (30 j)

France 3 Nouvelle-Aquitaine publie le **13 octobre 2026** le témoignage des
gérants après la destruction des surgelés (attaque du 12). Première trace radar
le **12 novembre 2026**, 30 jours après — l'écart le plus court des dix.
**Premier : la presse.** Même ici, le radar n'arrive pas avant l'article.

### `na-2026-013` — Magasins en Béarn et Soule (31 j)

La République des Pyrénées rapporte le **12 octobre 2026** les congélateurs
transformés en fours dans plusieurs magasins, le jour de l'attaque. Première
trace radar le **12 novembre 2026**, 31 jours après. **Premier : la presse.**
L'incident est « vu » au re-jeu, mais avec un rattachement partiel.

## Ce que cette mesure autorise à dire

Sur ces dix cas, le radar n'a **jamais** eu le premier regard : la presse a
publié dix fois sur dix, avec un écart médian de 134 jours. Les six incidents
comptés « vus » par la mesure de couverture ne contredisent pas ce résultat :
« vu » signifie « reconnu quand on rejoue le corpus contre le moteur », pas
« détecté avant sa publication ». La valeur démontrée ici est donc **la
qualification rétrospective** — rattacher, dater, conserver une preuve et un
historique —, pas l'alerte précoce. Une phrase du type « le radar voit les
incidents avant la presse » serait fausse sur cette base.

Le chiffre de **1,9 jour** publié dans `docs/mesure-couverture.md` ne doit pas
être lu comme l'inverse de ce résultat : `scripts/mesure-delai.mts` mesure la
latence entre la date portée par une source et son écriture en base sur le flux
général (933 faits, bulletins CVE exclus). C'est une latence de collecte, pas
une avance sur la presse, et aucun des dix incidents ci-dessus n'y contribue.

## Limites

- **Pas de détecteur à l'époque des faits.** La collecte n'a commencé que le
  13 novembre 2026. La comparaison mesure donc l'écart entre une publication
  passée et la mise en connaissance du projet en novembre, pas ce qu'un
  détecteur hypotétique aurait fait s'il avait tourné en 2025.
- **`consulteLe` est un proxy explicite.** C'est la date de lecture de la
  preuve par le constructeur du corpus, retenue comme première trace datée ;
  ce n'est ni un `collected_at`, ni un `created_at` d'événement, et le corpus
  est rejoué contre le moteur, non ingéré.
- **Sélection biaisée par construction.** Les dix incidents sont ceux qui ont
  été publiés et vérifiés sur pièce. Les incidents non médiatisés, non trouvés
  ou payants ne peuvent pas figurer dans le dénominateur — et le radar ne les
  aurait pas vus davantage.
- **Date de publication ≠ première divulgation absolue.** Pour ces dix cas,
  la date retenue est celle de l'article de presse principal du corpus. Une
  annonce antérieure, même si elle existait, n'aurait pas changé le rang du
  radar : il n'a commencé à collecter qu'en novembre 2026.
- **Dix cas ne font pas une loi.** Le résultat est sans appel sur cet
  échantillon, mais il ne mesure pas la performance future du produit.

## Reproduire

```bash
# Mesure reproductible de l'objectif (sélection, 10 / 10 et écarts), sans base ni réseau
pnpm mesure:comparaison-presse -- --check

# Dates presse et dates de première trace (les 10 premiers articles de presse du corpus)
jq -r '[.incidents[]
  | select(.preuve.editeur | test("Sud Ouest|ICI Poitou|France 3|La Dépêche|La République des Pyrénées"))
  | [.id,.datePublique,.preuve.editeur,.preuve.consulteLe]][0:10][] | @tsv' \
  bench/fixtures/corpus-reference-na.json

# Début réel de la collecte automatique
psql "$DATABASE_URL" -c 'SELECT min(collected_at) FROM event;'

# absence de ces incidents dans le flux radar (exemple)
psql "$DATABASE_URL" -c "SELECT count(*) FROM event
  WHERE title ILIKE '%Marennes%' OR summary ILIKE '%Marennes%'
     OR source_url ILIKE '%marennes%';"
```

Sources : `bench/fixtures/corpus-reference-na.json` (champs `datePublique`,
`preuve.editeur`, `preuve.consulteLe`) ; table `event` de la base de
développement, relevée le 21 novembre 2026.
