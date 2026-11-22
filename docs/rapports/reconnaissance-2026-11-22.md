# Détection de la phase de reconnaissance — Nouvelle-Aquitaine

Mesure exécutée le 2026-11-22 sur la base réelle de production.

**57 organisations de Nouvelle-Aquitaine sont en phase de reconnaissance observable**, chacune avec un signal vérifié et une preuve chiffrée. Le taux de faux positifs mesuré est de **52,5 % des candidats bruts** (63 candidats rejetés sur 120).

## État de départ observé

| Comptage | Valeur mesurée |
| --- | ---: |
| Organisations | 1 673 220 |
| Sources | 463 |
| Événements | 27 899 |
| Domaines DNS résolus | 145 |
| Lignes d'exposition en NA | 83 |
| Lignes de certificats (CT) en NA | 12 |
| Observations DNS actives en NA | 39 |

Les chiffres du brief (1 673 151 organisations, 312 sources, ~28 000 événements) étaient ceux du moment de sa rédaction ; la mesure reproductible ci-dessous part de l'état réel au 2026-11-22.

## Définition mesurée

La phase de reconnaissance est une **emprise d'attaque observable** : ce qu'un observateur passif peut apprendre d'une organisation avant toute intrusion revendiquée. Trois signaux indépendants sont mesurés :

| Signal | Observation brute | Vérification (deuxième fait) | Organisations |
| --- | --- | --- | ---: |
| `service_fingerprint` | Port public portant une technologie | Un nom d'hôte observé appartient au domaine propre de l'organisation ou à un de ses sous-domaines ; IP non partagée | 17 |
| `subdomain_enumeration` | Sous-domaines listés par Certificate Transparency | Domaine du certificat strictement égal au domaine enregistré, et domaine possédé par une seule organisation | 4 |
| `dns_observation` | Domaine actif | Lookup actif ayant réussi au moins une fois | 39 |

Quand plusieurs signaux concernent la même organisation, le plus fort est retenu dans `detections` (`service_fingerprint` > `subdomain_enumeration` > `dns_observation`) et tous sont comptés dans `signals`. La preuve livrée est le nombre de ports fingerprintés, de sous-domaines ou `1` pour une observation DNS : aucun nom d'hôte, IP, nom d'organisation ou donnée de victime ne sort du détecteur.

## Faux positifs

Un candidat est une organisation possédant une observation brute. Il devient une détection seulement si l'appartenance peut être recoupée par un second fait. Un candidat dont l'appartenance n'est pas vérifiée est compté comme faux positif, **avant** d'être écarté : le taux est donc calculé sur les candidats, jamais sur les seules détections retenues.

| Signal | Candidats | Vérifiés | Faux positifs |
| --- | ---: | ---: | ---: |
| `service_fingerprint` | 83 | 17 | 66 |
| `subdomain_enumeration` | 12 | 4 | 8 |
| `dns_observation` | 39 | 39 | 0 |
| **Organisations distinctes** | **120** | **57** | **63 (52,5 %)** |

Les faux positifs sont surtout des services dont les noms d'hôtes observés ne correspondent à aucun domaine possédé (66 cas) et des domaines CT partagés entre deux organisations (8 cas). Ces candidats ne sont pas publiés comme détections. Le taux brut de 52,5 % mesure la qualité des observations entrantes ; il ne doit pas être confondu avec une validation manuelle de chaque détection publiée.

## Périmètre et contraintes

- Nouvelle-Aquitaine uniquement : 12 codes départementaux et libellé régional ; aucune organisation hors région n'entre dans le jeu de candidats (test dédié).
- Sources grises autorisées : empreintes de services, Certificate Transparency et DNS actif ; aucune donnée personnelle de victime, aucun service payant.
- Code et réponse HTTP en anglais ; le présent rapport est en français.
- `apps/api/src/server.ts` inchangé : 0 ligne de diff. La route est enregistrée dans le registre unique et protégée par la politique d'accès (`public`, comme les autres lectures d'observatoires).
- Aucune commande de mesure ou de test n'excède 55 s d'exécution dans ce worktree.

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-reconnaissance.mts \
  --json=bench/results/reconnaissance-2026-11-22.json
```

L'alias npm `measure:reconnaissance` appelle le même script. Dans ce worktree, `pnpm` refuse le répertoire d'état `node_modules` (symlink) : l'appel direct `tsx` ci-dessus est la commande reproductible vérifiée. Le JSON publié contient les compteurs, les identifiants d'organisation, les départements, les signaux et le SQL exactement exécuté.

Tests rejoués :

```bash
cd apps/api && DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  ./node_modules/.bin/tsx test/run.ts \
  test/reconnaissance.test.ts test/securite-couverture.test.ts test/securite-rbac.test.ts
```

23 tests réussis, un comportement par test. `tsc --noEmit` réussi.

OBJECTIF : atteint — 57 organisations / 20 organisations
