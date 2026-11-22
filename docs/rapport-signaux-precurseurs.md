# Signaux précurseurs des victimes NA : audit des 9 sources horodatées

OBJECTIF : atteint — 135 paires victime × source auditées, 0 signal strictement antérieur mesuré (0,0000), 0/15 victimes couvertes / 135 paires prévues (15 victimes NA × 9 sources horodatées) sur les 6 fenêtres de 30 jours du rétro-test.

## Ce qui est livré

Un audit reproductible qui répond à la question ouverte par `docs/rapport-victimes-prochaines.md` : le score top-10 n'avait trouvé aucune victime en six mois (0 hit sur 60 prédictions, 0/15 victimes). Était-ce un défaut du score ou l'absence de signaux individuels exploitables dans la base réelle ?

L'audit interroge **neuf tables locales** portant un identifiant d'organisation et une date : `alert`, `archive_event`, `asset`, `event`, `event_archive`, `exposition_service`, `org_alias`, `org_enrichissement`, `public_mandate`. Pour chacune des **15 organisations victimes** des six fenêtres (26 mai → 22 novembre 2026), il compte les signaux de cette organisation **strictement antérieurs à sa propre revendication**. Unsignal le jour même est exclu ; les signaux d'une autre organisation sont ignorés ; une organisation est comptée une seule fois par source.

Résultat figé dans `bench/results/signal-coverage-2026-11-22.json` : **0 paire sur 135** porte un signal antérieur, donc **0 victime sur 15** est couverte, quelle que soit la source. Chaque source affiche 0/15.
Un signal le jour même est exclu ; les signaux d'une autre organisation sont ignorés ; une organisation est comptée une seule fois par source.
## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:precursors -- --as-of=2026-11-22 \
  --json=bench/results/signal-coverage-2026-11-22.json
```

Sortie observée (4,8 s, base locale réelle) :

```
Precursor coverage — 6 windows 2026-05-26 → 2026-11-22
Victims: 15 NA organisations x 9 dated sources = 135 pairs
Prior signals: 0/135 pairs, victims covered 0/15 (0.0000)
```

## Interprétation et limite

Le résultat négatif du pronostic n'est pas un artefact du score : aucune des 15 victimes du rétro-test n'a de trace horodatée la concernant dans ces neuf tables avant sa revendication. Un modèle, même parfait, ne peut pas les classer à partir de ces seuls signaux. Cela **ne prouve pas** qu'aucun signal n'existe ailleurs : les sources grises non horodatées ou non rattachées à une organisation (par exemple les corps de texte de quarantaine sans correspondance d'organisation) ne sont pas couvertes par cet audit.

La piste suivante, si elle est retenue, est donc d'abord une piste de **données** : rattacher une organisation à un signal antérieur (résolution d'alias, presse locale, annonces de prestataires) avant d'espérer améliorer la précision. Le score ne doit toujours pas être présenté comme une alerte fiable.

## Suite mesurée (22 novembre 2026)

Les deux sources CT rattachables par domaine ont depuis été auditées : voir `docs/rapport-precurseurs-ct.md`. Les indices de quarantaine non rattachés par organisation ont ensuite été audités : voir `docs/rapport-precurseurs-quarantaine.md`. Total des sources individuelles : **12 sources horodatées, 180 paires victime × source, 0 signal antérieur, 0/15 victimes couvertes**. Une treizième classe, collective cette fois, a ensuite été mesurée : voir `docs/rapport-precurseurs-groupe.md`. **7/15 victimes** portent un signal collectif antérieur, mais il est conditionné au groupe futur et reste inutilisable au classement : la valeur prédictive du top-10 reste nulle (0/60). Une vague sectorielle group-agnostique, calculable à la coupure, a ensuite été mesurée et injectée : voir `docs/rapport-vague-sectorielle.md`. **11/15 victimes** sont couvertes, mais le top-10 reste à 0 hit sur 60.

## Conformité

- Nouvelle-Aquitaine uniquement : les victimes et les signaux sont filtrés sur les 12 départements de la région.
- Sources grises locales autorisées ; aucun service payant.
- Aucune donnée personnelle : les requêtes ne lisent qu'un identifiant d'organisation et une date ; ni nom de victime, ni description de revendication, ni URL de preuve.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff**.
- 7 tests, un par comportement, verts ; typecheck API vert ; mesure en 4,8 s (< 60 s).
