# Attribution des services par provenance de répertoire — Nouvelle-Aquitaine

Mesure exécutée le 2026-11-22 sur la base réelle de production.

**8 910 services sont désormais attribués par la provenance du répertoire
d'origine** (432 avant cette tranche). Le détecteur publie 8 927 détections sur
9 850 candidats, soit un taux de faux positifs de **9,37 %** (contre 95,30 %
après la tranche précédente). L'objectif de cette tranche était d'atteindre
5 000 services attribués par provenance.

## Ce qui restait

La tranche précédente comparait l'hôte de `source_url` au domaine et au site web
déclarés par l'organisation. Or 1 713 organisations de Nouvelle-Aquitaine
portant un service fingerprinté ne déclarent ni domaine ni site web : aucun
service ne pouvait leur être attribué, et 8 399 observations reposent sur une IP
partagée, exclue par le garde-fou historique. Le résultat plafonnait à 432
services vérifiés pour 9 849 candidats.

## Règle ajoutée

La source HTTP porte une provenance dans `evidence.provider` : annuaires
publics (`dila`, `annuaire-education`, `rna`, `annuaire-administration`,
`data-inclusion`) et répertoires ouverts (`osm`, `wikidata`). Ces répertoires
attachent le site observé à l'organisation : cette provenance est le second fait
d'attribution, indépendamment du domaine déclaré et du caractère partagé de
l'IP. Les URL des autres sources (par exemple un scanner réseau) restent soumises
à l'ancienne règle : hôte correspondant au domaine déclaré et IP non partagée.

Les garde-fous restent identiques : suffixe public (`gouv.fr`, `com`, `fr`, …)
et hôte à terminaison numérique (adresse IP) exclus ; Nouvelle-Aquitaine
uniquement ; aucune URL, aucun hôte, aucune IP ni nom d'organisation dans la
réponse ou dans le JSON publié.

## Mesure

| Comptage | Avant | Après |
| --- | ---: | ---: |
| Services vérifiés par attribution de domaine | 432 | 432 |
| Services vérifiés par provenance de répertoire | 0 | 8 910 |
| Détections toutes signatures confondues | 463 | 8 927 |
| Faux positifs | 9 387 | 923 |
| Taux de faux positifs | 95,30 % | 9,37 % |
| Candidats | 9 850 | 9 850 |

Les signaux vérifiés sont `service_fingerprint` 8 910,
`subdomain_enumeration` 4 et `dns_observation` 39. Le taux résiduel de 9,37 %
mesure les candidats dont aucune provenance n'a pu être vérifiée ; ce n'est pas
une validation manuelle de chaque détection.

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-reconnaissance.mts \
  --json=bench/results/reconnaissance-directory-2026-11-22.json
```

Le JSON publié contient les compteurs, les identifiants, les départements, les
signaux et le SQL exactement exécuté, sans donnée personnelle.

## Contraintes et vérification

- Nouvelle-Aquitaine uniquement (12 codes départementaux et libellés régionaux).
- Sources grises autorisées ; aucun service payant ; aucune donnée personnelle
  de victime.
- `apps/api/src/server.ts` inchangé : 0 ligne de diff. La route reste celle du
  registre unique (`GET /api/reconnaissance`).
- Un test ajouté pour le comportement « une URL de répertoire attribue un
  service sans domaine déclaré » ; ses cas négatifs (URL non issue d'un
  répertoire, suffixe public, hôte IP) sont couverts par le même test.
- 25 tests ciblés réussis (`reconnaissance`, couverture de sécurité des routes,
  RBAC), `tsc --noEmit` réussi, commandes de mesure bornées à 55 s.

OBJECTIF : atteint — 8 910 services attribués par provenance / 5 000 services
