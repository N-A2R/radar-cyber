# Attribution des services par URL observée — Nouvelle-Aquitaine

Tranche suivante de la détection de phase de reconnaissance (PR #347). Mesure
exécutée le 2026-11-22 sur la base réelle, avec le même détecteur et la même
définition des candidats que la tranche précédente.

**432 organisations ont désormais un service fingerprinté attribué**, contre 5
sur le même état de base avant cette tranche. Le total des détections passe de
46 à 463 et le taux de faux positifs de 99,53 % à 95,30 % sur 9 850 candidats.

## Ce qui restait à faire

Le rapport précédent mesurait 57 détections sur 120 candidats (52,5 % de faux
positifs). Depuis, les observations de service sont passées de 83 à 9 849
organisations candidates (1 095 sources au lieu de 463) : le détecteur
n'attribuait plus que 5 de ces candidats, soit 9 804 faux positifs (99,53 %).
La cause mesurée est précise : sur 10 839 lignes d'exposition en
Nouvelle-Aquitaine, 10 344 n'ont aucun nom d'hôte dans leur preuve, alors que
l'URL utilisée pour l'observation HTTP est conservée dans
`exposition_service.source_url`. Cette URL n'était jamais lue par le détecteur.

## Règle ajoutée

L'hôte de l'URL observée est désormais une seconde observation possible, au même
titre que les noms d'hôtes de la preuve passive. Il est normalisé par la même
fonction (`normalizeHostname` : schéma, chemin, port, `www.`, joker et point
final retirés) puis comparé au domaine et au site web déclarés par
l'organisation, en correspondance exacte ou en sous-domaine. Toutes les garanties
précédentes restent intactes : IP partagée exclue, domaine générique exclu,
organisation hors Nouvelle-Aquitaine exclue, et un candidat non attribué compte
toujours comme faux positif. Aucun champ supplémentaire n'est publié : la
réponse HTTP et le JSON ne contiennent que des identifiants, départements,
signaux et compteurs — aucune URL, aucun hôte, aucune IP, aucun nom
d'organisation.

## Mesure

| Signal | Candidats | Vérifiés avant | Vérifiés après |
| --- | ---: | ---: | ---: |
| `service_fingerprint` | 9 849 | 5 | 432 |
| `subdomain_enumeration` | 12 | 4 | 4 |
| `dns_observation` | 39 | 39 | 39 |
| **Organisations distinctes** | **9 850** | **46 (99,53 % FP)** | **463 (95,30 % FP)** |

```bash
DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
  apps/api/node_modules/.bin/tsx scripts/measure-reconnaissance.mts \
  --json=bench/results/reconnaissance-url-2026-11-22.json
```

Le JSON publié contient les compteurs, les identifiants, les départements, les
signaux et le SQL exactement exécuté, sans donnée personnelle.

## Contraintes et vérification

- Nouvelle-Aquitaine uniquement ; sources grises autorisées ; aucun service
  payant ; aucune donnée personnelle de victime.
- `apps/api/src/server.ts` inchangé : 0 ligne de diff. La route reste celle du
  registre unique (`GET /api/reconnaissance`).
- Un test ajouté pour le comportement « une URL observée sur le domaine propre
  attribue le service » ; le cas négatif (URL tierce) est couvert par le même
  test. La suite ciblée passe, ainsi que `tsc --noEmit`.

OBJECTIF : atteint — 432 services attribués par URL / 400 services
