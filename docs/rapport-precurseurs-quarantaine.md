# Signaux précurseurs des victimes NA : audit des mentions en quarantaine

OBJECTIF : partiel — 12 sources horodatées auditées, 180 paires victime × source (dont 15 nouvelles pour `quarantine_raw`), 0 signal strictement antérieur, 0/15 victimes couvertes et 0 hit/60 prédictions / au moins 1 hit sur 60 prédictions ; manque un signal organisationnel antérieur réellement observable.

## Ce qui est livré

La douzième source horodatée est auditée : les indices d'organisation (`org_hint`) des mentions de revendication en quarantaine, déjà présents dans la base locale (source grise, aucun appel réseau). Un indice n'est rattaché que par racine de domaine exacte ou par nom d'organisation normalisé exact ; une clé partagée par deux organisations est écartée, sans jamais deviner. Le jour de la revendication lui-même n'est pas compté comme précurseur.

## Mesure reproductible

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:quarantine-precursors -- --as-of=2026-11-22 \
  --json=bench/results/quarantine-precursors-2026-11-22.json
```

Sortie observée en 14,4 s sur la base locale réelle :

```
Quarantine precursors — 6 windows 2026-05-26 → 2026-11-22
Victims: 15 NA organisations x 1 source = 15 pairs
  quarantine_raw 16770 hints, 198 attached, 242 ambiguous, 16330 unmatched
Prior signals: 0/15 pairs, victims covered 0/15 (0.0000)
```

Le détail est gelé dans `bench/results/quarantine-precursors-2026-11-22.json`.

## Interprétation

Sur 16 770 mentions lues, 198 seulement se rattachent sans ambiguïté à une organisation de Nouvelle-Aquitaine, et aucune n'est antérieure à la propre revendication de l'une des 15 victimes du rétro-test. L'écart déjà constaté dans `docs/rapport-signaux-precurseurs.md` — les corps de texte de quarantaine sans correspondance d'organisation — est donc mesuré, et il reste nul. Ajouter cette source ne change ni le classement ni sa précision : le résultat nul (0/60) tient à l'absence de signal antérieur, pas au seul rattachement.

Les 242 clés ambiguës sont volontairement écartées : les compter comme des précurseurs fabriquerait des fanions faux. Les 16 330 indices sans correspondance ne sont pas des preuves d'absence de signal ailleurs, seulement l'absence de rattachement exact dans le référentiel local.

## Conformité

- Nouvelle-Aquitaine uniquement : victimes, organisations et alias filtrés sur les 12 départements de la région.
- Sources grises déjà présentes en base ; aucun service payant, aucun appel réseau.
- Aucune donnée personnelle : la mesure ne lit que des identifiants d'organisation, des noms et domaines d'organisation, des indices et des dates ; ni corps de revendication, ni URL de preuve, ni nom de victime ne sont exposés.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff ajoutée par cette tranche**.
- 10 tests, un par comportement, verts ; typecheck API vert ; mesure en 14,4 s (< 60 s).
