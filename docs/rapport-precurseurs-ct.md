# Signaux CT : deux sources supplémentaires auditées

OBJECTIF : atteint — **165 paires victime × source auditées sur 11 sources horodatées** (135 paires de l'audit initial + 30 paires CT), **342 sous-domaines** et **0 certificat suspect** examinés, **120 rattachements** d'organisation, **128 racines ambiguës rejetées**, **0 signal strictement antérieur** mesuré (0,0000), **0/15 victimes couvertes** / 165 paires prévues (15 victimes NA × 11 sources) sur les 6 fenêtres de 30 jours du rétro-test.

## Ce qui est livré

L'audit des signaux précurseurs (`docs/rapport-signaux-precurseurs.md`) s'arrêtait à neuf tables portant déjà un identifiant d'organisation. Restaient deux sources horodatées issues des journaux de certificats, rattachables seulement par domaine : `ct_sous_domaine.premiere_vue` et `ct_certificat_suspect.premiere_vue`.

Un module pur `apps/api/src/prediction/ct-precursors.ts` rattache une observation à **au plus une** organisation de Nouvelle-Aquitaine par racine de domaine enregistrable, en réutilisant `domaineRacine`. Une racine partagée par deux organisations est ambiguë et **jamais** rattachée : un tel rattachement fabriquerait un faux précurseur. Le compte de signaux antérieurs réutilise `measureSource` : un signal le jour de la revendication est exclu, une organisation est comptée une seule fois par source.

Résultat figé dans `bench/results/ct-precursors-2026-11-22.json` : sur 342 sous-domaines, 120 ont été rattachés à une organisation NA, 128 racines ambiguës ont été rejetées et 94 valeurs n'étaient pas rattachables ; aucune des 15 victimes du rétro-test n'a de certificat antérieur à sa revendication. Le classement top-10 reste donc sans valeur prédictive démontrée (0 hit sur 60 prédictions).

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:ct-precursors -- --as-of=2026-11-22 \
  --json=bench/results/ct-precursors-2026-11-22.json
```

Sortie observée (2,6 s, base locale réelle) :

```
CT precursors — 6 windows 2026-05-26 → 2026-11-22
Victims: 15 NA organisations x 2 CT sources = 30 pairs
  ct_sous_domaine        342 rows, 120 attached, 128 ambiguous, 94 unmatched
  ct_certificat_suspect  0 rows, 0 attached, 0 ambiguous, 0 unmatched
Prior signals: 0/30 pairs, victims covered 0/15 (0.0000)
```

## Conformité

- Nouvelle-Aquitaine uniquement : les victimes et les organisations rattachables sont filtrées sur les 12 départements de la région.
- Sources grises déjà présentes dans la base (`crt.sh`, Cert Spotter) ; aucun appel réseau, aucun service payant.
- Aucune donnée personnelle : la mesure ne lit que des identifiants d'organisation, des racines de domaine et des dates ; ni nom de victime, ni description de revendication, ni contenu de certificat n'est exposé.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff**.
- 8 tests, un par comportement, verts ; typecheck API vert ; mesure en 2,6 s (< 60 s).

Je n'écris pas « CHANTIER TERMINÉ » : la valeur prédictive reste nulle (0/60). La suite utile est une acquisition de signaux antérieurs encore absents de la base locale, pas un nouveau réglage du score.
