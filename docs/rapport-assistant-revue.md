# Rapport — Assistant de revue

Date : 22 novembre 2026. Branche : `ext/chantier-l6`. Instantané figé :
`bench/results/review-assistant-acceptance.json`.

## Objectif et résultat

L'objectif du chantier est le **taux d'acceptation des suggestions** de
l'assistant de revue. Le chiffre mesuré est de **91,14 %** : **72 suggestions
acceptées sur 79 décisions humaines enregistrées**. La règle de référence
(« toujours proposer `review`, l'action majoritaire ») donne 68,35 % sur le
même corpus, soit 22,79 points de moins.

| Mesure | Valeur |
|---|---:|
| **Taux d'acceptation (objectif)** | **91,14 %** |
| Suggestions acceptées | 72 / 79 |
| Référence majoritaire | 68,35 % |
| `promote` proposé | 19 acceptées / 23 (82,61 %) |
| `review` proposé | 53 acceptées / 56 (94,64 %) |
| `reject` proposé | 0 / 0 |
| Données personnelles de victime | 0 |

Une suggestion est comptée comme acceptée lorsque l'action proposée est
**exactement** l'action que l'analyste a enregistrée pour la même réclamation
(identifiant `quarantine`). Il n'y a ni crédit partiel, ni correction après
coup, ni comparaison de texte. Les décisions automatiques (`moteur:triage`)
sont exclues du taux : ce ne sont pas des acceptations humaines.

## État réel de départ

La base de travail réelle (`localhost:5433/radar`) a été lue en lecture seule
au moment de la mesure :

| Compteur | Valeur relevée |
|---|---:|
| Organisations | 1 673 151 |
| Sources | 312 |
| Événements | 26 259 |
| Réclamations en quarantaine | 16 901 |
| Décisions de revue enregistrées | 16 664 |
| Événements de décision humaine | 92 |
| Réclamations distinctes décidées par un humain | 79 |

Les ordres de grandeur annoncés dans le chantier (1 673 151 organisations,
312 sources, ~28 000 événements) décrivent un état antérieur de cette même
base ; les compteurs ci-dessus sont ceux qui ont été relevés. Le corpus figé
utilisé pour la mesure ne contient que 79 lignes, une par réclamation décidée
par un humain, après déduplication par identifiant et conservation de la
décision la plus récente.

## Définition de l'assistant

L'assistant reçoit uniquement des éléments non personnels : l'indice
d'organisation, la source, la présence d'une description, un pays déclaré
éventuel et un département de Nouvelle-Aquitaine éventuel. Il renvoie une
action (`promote`, `review`, `reject`), une confiance, un périmètre
(`na`, `out-of-scope`, `unknown`) et un identifiant de règle en anglais. Il ne
lit ni le texte de la revendication, ni les noms de victimes, ni les coordonnées.

Les règles sont ordonnées ; la première qui s'applique gagne :

| Ordre | Identifiant de règle | Action |
|---:|---|---|
| 1 | `no-usable-hint` | `reject` |
| 2 | `declared-country-outside-scope` | `reject` |
| 3 | `na-department-needs-review` | `review` |
| 4 | `na-scope-signal` | `review` |
| 5 | `domain-hint-with-evidence` | `promote` |
| 6 | `domain-identifier-feed` | `promote` |
| 7 | `domain-hint-without-evidence` | `review` |
| 8 | `ambiguous-hint` | `review` |

Le périmètre est celui de la Nouvelle-Aquitaine : ses douze départements sont
déclarés explicitement, et un pays déclaré hors France fait rejeter la
réclamation. Les sources grises sont admises au même titre que les autres ;
aucune source n'est mise sur une liste d'exclusion. La source sert seulement
à reconnaître un **format** d'identifiant (nom de domaine), jamais à décider
de la fiabilité d'une publication. Quand le périmètre est `unknown`, la
suggestion reste une proposition de triage : la promotion effective demeure
une décision humaine.

## Commande reproductible

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm measure:review-assistant -- --with-db
```

Durée mesurée : **0,40 s**, sans réseau externe ni service payant. Sortie
observée :

```text
review assistant acceptance rate: 91.14%
accepted suggestions: 72/79
majority baseline: 68.35%
  promote: 19/23
  review: 53/56
  reject: 0/0
baseline: 1673151 organizations, 312 sources, 26259 events
```

La même commande sans `--with-db` rejoue le calcul depuis le corpus figé, sans
base de données. L'option `--export-corpus` régénère ce corpus depuis la base
en lecture seule ; c'est la seule écriture de fichier, aucune ligne n'est
écrite dans PostgreSQL. Le nom de fichier de sortie est fixe et l'horodatage
change à chaque rejeu, pas le taux.

## Ce qui a été livré

- `apps/api/src/review-assistant/suggest.ts` — moteur de suggestion pur, en
  anglais, sans dépendance applicative.
- `apps/api/src/review-assistant/acceptance.ts` — calcul du taux d'acceptation,
  déduplication et référence majoritaire, en anglais.
- `apps/api/src/routes/review-assistant.ts` — interface HTTP en anglais
  `GET /api/review-assistant/suggest`, en lecture seule, qui ne renvoie jamais
  le texte soumis.
- `apps/api/src/routes/index.ts` et `apps/api/src/security/rbac.ts` —
  enregistrement de la route et règle d'accès `analyste`.
- `bench/corpus/review-assistant-decisions.json` — 79 décisions humaines, sans
  texte de revendication ni donnée de victime.
- `scripts/measure-review-assistant.mts` — mesure reproductible, lecture seule,
  avec instantané des compteurs réels.
- `apps/api/test/review-assistant.test.ts` et
  `apps/api/test/review-assistant-route.test.ts` — **32 tests, un comportement
  par test**.
- `package.json` — commande `measure:review-assistant`.

Vérifications exécutées : **32/32 tests réussis**, contrôle de couverture des
règles d'accès **3/3**, `tsc --noEmit` sans erreur, mesure rejouée à 91,14 %.
`apps/api/src/server.ts` est inchangé (**0 ligne de diff** vs la base de
départ) : la route passe par le registre unique `registerApiRoutes`.

## Conformité et limites

- **Nouvelle-Aquitaine** : périmètre explicite dans les règles et dans le
  corpus régional ; les pays déclarés hors France sont rejetés.
- **Sources grises** : admises, sans liste de confiance ni exclusion.
- **Données personnelles de victimes** : aucune collecte, aucun stockage, aucune
  exposition. Le corpus ne garde qu'un indicateur booléen de présence d'une
  description, jamais son contenu ; l'interface ne renvoie pas l'indice soumis.
- **Aucun service payant**, aucun appel réseau sortant.
- **Langues** : code, interface et messages de mesure en anglais ; rapport en
  français.
- **Limite de mesure** : les trois décisions de rejet humaines portaient sur
  des homonymes (une organisation régionale et une revendication étrangère
  homonyme). La preuve de registre qui a permis ces rejets n'est pas fournie à
  l'assistant : il propose `promote` et échoue sur ces trois cas. Quatre
  décisions `review` reçoivent aussi une proposition `promote`.
- **Limite statistique** : les règles ont été écrites à partir de principes de
  triage puis mesurées sur ce même corpus de 79 cas, sans partition
  entraînement/test. Le chiffre est descriptif de ce corpus, pas une estimation
  de généralisation. Les 16 572 décisions automatiques du journal, les 14 258
  réclamations archivées sans jugement et les réclamations encore en attente
  ne sont pas incluses dans le dénominateur.
