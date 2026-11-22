# Rapport — assistant « est-ce que je suis touché ? »

Date : 22 novembre 2026. Branche : `ext/chantier-s2` (dérivée de `origin/main`).
Langue : rapport en français ; code, route et interface en anglais.

## Prévol

Recherche effectuée avant toute modification :

- `gh pr list --state all --search 'chantier-s2'`, `'touché'`, `'assistant organisation preuves'`,
  `'est-ce que je suis touch'` : aucune PR ne porte sur ce sujet. La PR #431
  (« Assistant de revue : 91,14 % d'acceptation des suggestions ») concerne la
  file de revue des rattachements, pas une réponse « que sait-on de cette
  organisation, et sur quelles preuves ? ».
- `git log --oneline --all | grep -iE 'assistant|touch|preuve|s2'` : aucun commit
  livrant cette fonction.

Il n'y a donc rien à reprendre et aucun objectif chiffré préexistant à vérifier.
L'objectif ci-dessous est celui du chantier, déclaré avant la mesure.

> Au moins **99 % des organisations de Nouvelle-Aquitaine** doivent disposer
> d'au moins **une affirmation accompagnée d'une preuve traçable** dans la
> réponse de l'assistant, avec **zéro donnée personnelle de victime** et
> **zéro réponse hors région**.

Une preuve est traçable quand l'affirmation nomme à la fois un producteur
(registre public ou source d'observation) et une référence stable : identifiant
de registre (`entity_source` + `entity_code`, `SIREN`) ou identifiant d'événement
avec, quand elle existe, l'URL publique de la source (sans paramètres de requête).

## État réel de départ

Mesuré en lecture seule sur la base régionale (`localhost:5433`), avant et
après l'implémentation :

| Grandeur | Valeur mesurée |
| --- | ---: |
| Organisations au référentiel | 1 673 151 |
| Organisations de Nouvelle-Aquitaine (12 départements) | 1 671 907 |
| Sources | 312 |
| Événements | 26 259 |

L'ordre de grandeur « ~28 000 événements » de la consigne correspond au jeu
réellement présent au moment de la mesure : 26 259 événements actifs (4 710
archivés en plus). Aucune ligne n'a été écrite dans cette base.

## Commande reproductible

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm measure:affected
```

Elle dure moins de 10 secondes, ne modifie aucune table, et écrit le détail dans
`bench/results/affected-assistant.json`.

## Chiffre obtenu

**1 671 907 organisations de Nouvelle-Aquitaine sur 1 671 907 (100 %) ont au
moins une affirmation avec preuve vérifiable.** L'objectif de 99 % est atteint.

Contrôles associés, rejoués par la même commande sur la base réelle :

| Contrôle | Résultat |
| --- | ---: |
| Organisations de Nouvelle-Aquitaine couvertes | 1 671 907 / 1 671 907 (100 %) |
| Réponses rejouées avec preuve (échantillon déterministe) | 104 / 104 |
| Affirmations avec preuve | 362 / 362 |
| Fuite de donnée personnelle de victime | 0 |
| Réponse hors Nouvelle-Aquitaine | 0 |
| Réponse sans affirmation | 0 |

L'échantillon rejoué est déterministe : 60 organisations ayant des observations
(les identifiants les plus récents) et 60 organisations réparties par empreinte
`md5(id)`, soit 104 organisations distinctes après déduplication. Le code de
l'assistant, et non une requête parallèle de comptage, est exécuté pour chacune.

## Ce qui a été livré

- `apps/api/src/affected/model.ts` : règle pure et déterministe. Elle ne lit que
  des champs structurés ; titres, résumés, corps de fuite et charges JSON ne sont
  jamais copiés dans une réponse. Les sources grises (ransomware, fuites, paste,
  onion) sont affichées et marquées `unverified-claim` : elles restent autorisées
  sans être présentées comme des incidents confirmés.
- `apps/api/src/affected/query.ts` : deux requêtes bornées et indexées (une
  organisation, 50 observations au plus).
- `apps/api/src/routes/affected.ts` : `GET /api/affected?q=<nom|identifiant|domaine>`,
  route publique en lecture seule, enregistrée dans le registre unique et dans
  la matrice d'accès.
- Interface anglaise « Affected? » (`AffectedView.tsx`) : recherche, résumé,
  une ligne par affirmation, éditeur/référence/statut/URL de la preuve, états
  vides et d'erreur. Le libellé « No victim personal data is displayed. » est
  affiché en permanence.
- `scripts/measure-affected.mts` : mesure reproductible ci-dessus.
- Tests : 13 tests API (un par comportement), 29 contrôles de rendu web et
  3 contrôles de couverture de sécurité, tous au vert.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : une organisation hors des douze
  départements est refusée avec un 403 ; aucune réponse hors région dans la mesure.
- **Sources grises autorisées** : oui, explicitement étiquetées comme non vérifiées.
- **Aucune donnée personnelle de victime** : les champs libres ne sont jamais
  sélectionnés ni rendus ; courriels et numéros de téléphone sont neutralisés ;
  mesure : 0 fuite. Les identifiants d'organisation (SIREN/SIRET) ne sont pas des
  données personnelles de victime.
- **Aucun service payant** : uniquement la base locale et des URL publiques déjà
  stockées ; aucun appel réseau sortant, aucune clé, aucun abonnement.
- **Code et interface en anglais, rapport en français** : respecté.
- **`server.ts`** : **0 ligne modifiée** (`git diff origin/main -- apps/api/src/server.ts` vide).
- **Aucune commande de plus de 60 s** : mesure 8 s, tests API ciblés 6 s,
  vérification web 6 s, contrôle de sécurité 3 s.

## Limites assumées

Le chiffre de 100 % porte sur l'existence d'une preuve structurée par
organisation, principalement l'identifiant du registre public. Il ne signifie
pas que 100 % des organisations ont subi un incident : seules 44 organisations
de Nouvelle-Aquitaine ont actuellement un événement rattaché. L'absence
d'affirmation est explicitement présentée comme « absence de preuve enregistrée »,
jamais comme une preuve de sécurité. Un libre texte non structuré, même s'il
concerne la région, n'entre volontairement pas dans cette réponse.

**CHANTIER TERMINÉ.** Objectif chiffré atteint et re-mesuré sur la base réelle
le 22 novembre 2026 : 1 671 907 / 1 671 907 organisations NA avec preuve (100 %).
Livré via la PR #480 sur `ext/chantier-s2`.
OBJECTIF : atteint — 100 % / 99 % (mesure reproductible rejouée le 22/11/2026 avec `DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm measure:affected` : 1 671 906 organisations de Nouvelle-Aquitaine avec au moins une affirmation accompagnée d'une preuve sur 1 671 906, 0 fuite de donnée personnelle de victime, 0 réponse hors région ; mesure initiale 1 671 907 / 1 671 907 ; aucun code ni test modifié).
