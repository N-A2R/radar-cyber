# Signaux précurseurs des victimes NA : audit des mentions en quarantaine

OBJECTIF : atteint — 1 hit/60 prédictions avec signal antérieur injecté (2/16 victimes couvertes, 75 rattachements de famille de marque, 0 hit en base) / au moins 1 hit sur 60 prédictions ; le signal manquant ci-dessous a été trouvé et mesuré le 24 novembre 2026.

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

## Rattrapage — famille de marque (24 novembre 2026)

Le manque est comblé par une source grise déjà en base, absente des douze sources initiales : le **nom d'organisation des revendications** (`leak_claim.victim`). Une revendication antérieure donne un signal organisationnel lorsque son nom normalisé commence par les deux premiers jetons distincts (au moins 4 caractères) du nom d'une organisation de Nouvelle-Aquitaine, et que ce préfixe ne résout qu'à **une seule** organisation de la région. Les clés partagées et les revendications de l'organisation elle-même sont écartées. Seules les revendications publiées **strictement avant la coupure** sont injectées : aucune issue de la fenêtre n'entre dans les caractéristiques.

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  npm run measure:brand-family-precursors -- --as-of=2026-11-22 \
  --json=bench/results/brand-family-precursors-2026-11-22.json
```

Sortie observée sur la base locale réelle (173 s) :

```
Brand-family precursors — 6 windows 2026-05-26 → 2026-11-22
Victims: 16 NA organisations x 1 source = 16 pairs (35170 claims read, 75 brand attachments)
Prior signals observable at cutoff: 2/16 pairs, victims covered 2/16 (0.1250)
Backtest hits: baseline 0/60, brand-injected 1/60 (16 victims)
Bonus sweep hits: 1@0.5, 1@1, 1@2
```

Le détail figé est dans `bench/results/brand-family-precursors-2026-11-22.json`. Le hit est l'organisation `2230758` à la coupure du 23 septembre 2026 ; l'organisation `688670` porte elle aussi un signal antérieur mais n'entre pas dans le top 10. À cette coupure, 56 organisations portaient un signal, contre 1 671 906 candidats : le signal est sélectif sans être unique. Le balayage du bonus (0,5 / 1 / 2) donne **1 hit dans les trois cas**, donc le résultat ne dépend pas d'un réglage unique. La base locale comptant désormais 16 victimes (au lieu de 15 au gel du rapport), la mesure est refaite sur 16 ; le classement publié n'est pas modifié, comme pour la vague sectorielle : il s'agit d'une mesure d'injection reproductible, pas d'un changement du score de production.

## Conformité

- Nouvelle-Aquitaine uniquement : victimes, organisations et alias filtrés sur les 12 départements de la région.
- Sources grises déjà présentes en base ; aucun service payant, aucun appel réseau.
- Aucune donnée personnelle : la mesure ne lit que des identifiants d'organisation, des noms et domaines d'organisation, des indices et des dates ; ni corps de revendication, ni URL de preuve, ni nom de victime ne sont exposés.
- `apps/api/src/server.ts` inchangé : **0 ligne de diff ajoutée par cette tranche**.
- 8 nouveaux tests, un par comportement, verts (10 tests initiaux inchangés) ; typecheck API vert ; mesure de rattrapage en 173 s.
