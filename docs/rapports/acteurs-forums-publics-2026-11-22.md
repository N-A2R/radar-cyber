# Acteurs francophones sur forums publics — mesure reproductible

Mesure exécutée le 2026-11-22T03:42:34.457Z.

**9 acteurs identifiés** et **12 mentions d'activité** sur 11 messages francophones admis, issus de 8 forums publics suivis.

État réel de départ : 1 673 151 organisations, 312 sources, 26 214 événements (capture du 2026-11-22, base `postgres://radar:radar@localhost:5432/radar`). Le corpus gelé compte 139 messages publics relus ; 24 sont admis, dont 11 en français.

## Définition mesurée

- **Acteur** : entité publique nommée agissant dans un message admis — groupe menaçant, organisme public, entreprise ou communauté de sécurité. Seules les étiquettes publiques sont conservées.
- **Francophone** : message admis dont la langue détectée est le français (`languageVerdict`), sur un flux public gratuit à périmètre Nouvelle-Aquitaine (Bordeaux, Gironde, Poitiers).
- **Activité** : une mention par acteur et par message public, avec le nombre de messages, le nombre de forums distincts et la fenêtre entre la première et la dernière observation publique.
- **Sans interaction** : lecture seule de flux publics ; aucun compte, aucune publication, aucune réponse, aucun message privé, aucun service payant.

## Acteurs identifiés et activité

| Acteur | Rôle | Messages | Forums | Première observation | Dernière observation | Jours actifs |
| --- | --- | ---: | ---: | --- | --- | ---: |
| ZATAZ | communauté | 3 | 1 | 2024-11-20 | 2026-10-11 | 691 |
| Gendarmerie Nationale | organisme public | 2 | 2 | 2023-02-19 | 2024-11-20 | 641 |
| Éducation Nationale | organisme public | 1 | 1 | 2014-07-12 | 2014-07-12 | 1 |
| NoName | groupe menaçant | 1 | 1 | 2026-10-11 | 2026-10-11 | 1 |
| Police Judiciaire | organisme public | 1 | 1 | 2023-02-19 | 2023-02-19 | 1 |
| RansomHouse | groupe menaçant | 1 | 1 | 2026-03-18 | 2026-03-18 | 1 |
| Santé publique France | organisme public | 1 | 1 | 2026-08-12 | 2026-08-12 | 1 |
| TheDestroyer | groupe menaçant | 1 | 1 | 2014-07-12 | 2014-07-12 | 1 |
| Vitalis | entreprise | 1 | 1 | 2025-03-23 | 2025-03-23 | 1 |

8 messages mentionnent au moins un acteur. Les sources grises (discussions communautaires) sont autorisées ; aucun nom d'auteur de forum et aucune donnée personnelle de victime ne sont ingérés.

## Contraintes vérifiées

- Nouvelle-Aquitaine uniquement : seuls les flux thématiques Bordeaux, Gironde et Poitiers peuvent fournir des acteurs.
- Sources grises autorisées, aucune donnée personnelle de victime (courriel, téléphone, nom de victime, date de naissance).
- Aucun service payant : tous les flux sont publics et gratuits, sans compte.
- Code et interface en anglais (`/api/forum-actors`, `actorsIdentified`, `mentions`) ; le présent rapport est en français.
- `apps/api/src/server.ts` inchangé (0 ligne de diff supplémentaire) ; chaque commande de mesure dure moins de 60 secondes.

## Reproduction

```bash
pnpm forums:corpus
pnpm mesure:forum-actors -- --json=bench/results/forum-actors-2026-11-22.json --out=docs/rapports/acteurs-forums-publics-2026-11-22.md
```

La première commande capture les flux publics ; la seconde est hors réseau et rejoue exactement les chiffres ci-dessus.
OBJECTIF : atteint — 9 acteurs identifiés et 12 mentions d'activité / 9 acteurs identifiés et 12 mentions d'activité (rejeu reproductible le 22/11/2026 : `pnpm mesure:forum-actors | jq '{actorsIdentified, mentions}'` → 9 et 12).
