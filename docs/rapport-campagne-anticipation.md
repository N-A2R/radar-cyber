# Anticiper la prochaine campagne d'un groupe actif en Nouvelle-Aquitaine

## Résultat mesuré

Sur l'état réel de la base de test au 22 novembre 2026 : **5 groupes actifs en
Nouvelle-Aquitaine** reçoivent chacun un secteur et une période de prochaine
campagne, et la règle est vérifiée sur **20 campagnes passées mises de côté**
(10/20 secteurs justes, 10/20 périodes justes, erreur médiane de 42 jours sur
la date de début). Aucune prédiction n'est publiée sans ce rejeu.

| Groupe | Revendications NA | Campagnes | Secteur anticipé | Période anticipée | Rejeu secteur | Rejeu période |
|---|---:|---:|---|---|---:|---:|
| qilin | 15 | 10 | services | 2027-01-11 → 2027-01-25 | 4/9 | 5/9 |
| the gentlemen | 10 | 6 | services | 2026-11-25 → 2026-12-09 | 1/5 | 4/5 |
| play | 4 | 4 | services | 2027-04-14 → 2027-04-28 | 2/3 | 0/3 |
| everest | 3 | 3 | services | 2026-08-01 → 2026-08-15 | 2/2 | 1/2 |
| lynx | 3 | 2 | services | 2025-12-03 → 2025-12-17 | 1/1 | 0/1 |
| **Total** | **35** | **25** | — | — | **10/20** | **10/20** |

## État de départ

| Mesure | Valeur relevée |
|---|---:|
| Organisations | 1 673 220 |
| Sources déclarées | 463 |
| Événements | 27 899 |
| Revendications de sites de fuite | 34 992 |
| Revendications rattachées à la NA | 78 |

Les deux premiers ordres de grandeur du chantier sont confirmés ; le nombre de
sources déclarées a évolué depuis le relevé initial (312). La prédiction ne
consomme que les 78 revendications `na = true` de `leak_claim` : groupes, dates,
libellés de secteur et secteur groupe de l'organisation rattachée. Aucun nom de
victime, aucun identifiant d'organisation et aucun texte libre ne sortent de la
base.

## Méthode

1. **Groupes actifs** — noms normalisés (minuscules, espaces et ponctuation),
   puis seuls les groupes ayant au moins 3 revendications NA sont retenus ; les
   cinq plus actifs sont publiés. C'est exactement cinq groupes sur cet état.
2. **Campagnes** — une campagne regroupe les revendications d'un même groupe
   espacées d'au plus 21 jours, sur 45 jours maximum. Les cinq groupes donnent
   25 campagnes historiques.
3. **Secteur** — les libellés des sites de fuite sont ramenés aux neuf groupes
   sectoriels du référentiel (`Healthcare` → `sante`, `Software` → `services`…).
   Quand le libellé manque, le `secteur_groupe` de l'organisation rattachée est
   utilisé ; un libellé inconnu n'est jamais deviné. Le secteur d'une campagne
   est le plus fréquent, départagé par la revendication la plus récente.
4. **Période** — l'écart médian entre les débuts des campagnes passées donne le
   délai attendu après la dernière campagne ; la fenêtre publiée dure au moins
   14 jours. Le secteur prédit est le mode des secteurs passés.
5. **Vérification** — pour chaque campagne historique, on reconstruit la
   prévision avec l'historique qui la précède seulement. Un rejeu compte un
   secteur juste en cas d'égalité exacte et une période juste si le début réel
   tombe dans la fenêtre prévue élargie de 30 jours de part et d'autre.

## Limites assumées

- Les cinq groupes prédits ont tous `services` comme secteur mode : les victimes
  rattachées à la NA sont majoritairement des organisations de services. Le
  score de secteur (10/20) ne bat donc pas une baseline « toujours services » ;
  il est publié comme mesure, pas comme une performance prétendue.
- Deux groupes (`everest`, `lynx`) n'ont pas de revendication récente : leur
  fenêtre calculée est antérieure au dernier relevé. Elle est laissée telle
  quelle et doit se lire comme une campagne **en retard**, pas comme une date
  future garantie.
- Le drapeau `na` repose en grande partie sur un rattachement par nom ; certaines
  victimes de sites de fuite peuvent être des homonymes hors région. Les sources
  grises sont autorisées par le chantier, mais cette incertitude reste attachée
  aux résultats.
- Aucun service payant, aucun réseau externe supplémentaire, aucune donnée
  personnelle de victime. `apps/api/src/server.ts` n'est pas modifié (0 ligne).

## Rejouer la mesure

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  pnpm mesure:campagnes-prochaines
```

La commande écrit `bench/results/campaign-forecast.json` et affiche les cinq
prévisions ainsi que le bilan du rejeu. Elle est en lecture seule et s'achève en
moins de deux secondes sur l'état mesuré. Les sept tests d'un comportement chacun
se lancent avec :

```bash
cd apps/api && ./node_modules/.bin/tsx --test test/campaign-forecast.test.ts
```
OBJECTIF : atteint — 5 groupes avec secteur + période vérifiés / 5
