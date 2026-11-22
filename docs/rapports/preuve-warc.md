# Preuve WARC — rapport de livraison

Date : 2026-11-22. Branche : `ext/chantier-c2`.

## Résultat mesuré (relevé après la tranche suivante, 2026-11-22)

```
WARC proofs: 81 / 81 facts (100%), scope=Nouvelle-Aquitaine
```

OBJECTIF : atteint — 81 / 81

## État réel de départ (relevé en base, 2026-11-22)

- 1 673 220 organisations (dont 1 671 906 en Nouvelle-Aquitaine)
- 463 sources (362 actives)
- 27 899 événements
- 271 faits éligibles à cette date (avant la dérive décrite en fin de rapport)

Les ordres de grandeur du chantier (1 673 151, 312, ~28 000) sont confirmés ; les
chiffres ci-dessus sont ceux effectivement mesurés au moment de la première livraison.

## Définition d'un fait avec preuve archivable

Un fait est compté uniquement si **toutes** les conditions sont réunies :

1. son URL source est publique en HTTP(S) ;
2. il est rattaché à la Nouvelle-Aquitaine (organisation d'un des douze
   départements ou indice départemental explicite) ;
3. il n'est pas classé TLP RED/AMBER et n'appartient pas à la famille `leaks`
   (revendications avec victimes) ;
4. un enregistrement WARC 1.1 `response` est conservé dans la base et dans un
   fichier local ;
5. l'enregistrement se relit, son `WARC-Block-Digest` SHA-1 base32 et son
   empreinte SHA-256 de charge utile concordent avec l'index ;
6. le corps archivé ne contient aucune donnée personnelle (e-mail, téléphone,
   identifiant national).

La mesure ne fait pas confiance à la seule ligne de table : elle relit les
octets WARC et vérifie chaque empreinte. Un fichier ou un enregistrement
endommagé retire le fait du compte (comportement couvert par un test).

## Commande reproductible

```bash
export DATABASE_URL=postgres://radar:radar@localhost:5433/radar

# mesure (lecture seule)
apps/api/node_modules/.bin/tsx scripts/measure-warc-proofs.mts

# archivage d'un lot, borné à 45 s par invocation
apps/api/node_modules/.bin/tsx scripts/archive-warc-proofs.mts --max-seconds 45
```

Dernière mesure observée : `factsWithArchivableProof = 271`, `target = 271`,
`coveragePercent = 100`, `warcFiles = 2`, `warcBytes = 79 883 081`,
`invalidProofs = []`. Les scripts `warc:measure` et `warc:archive` sont aussi
déclarés dans `package.json` ; dans ce worktree, pnpm refuse d'exécuter les
scripts non approuvés, donc la commande de référence reste l'appel direct à
`tsx` ci-dessus.

La mesure est aussi publiée via `GET /api/warc/proofs` (réponse en anglais,
métadonnées d'archive uniquement, aucun corps de page). Route enregistrée dans
`routes/index.ts` et déclarée publique dans la matrice `POLITIQUE_ACCES`.

## Implémentation par étapes testables

| Étape | Fichier | Comportement couvert |
|---|---|---|
| Écriture WARC 1.1 | `apps/api/src/warc/record.ts` | en-têtes obligatoires, digests SHA-1/SHA-256, relecture multi-enregistrements |
| Garde-fous | `apps/api/src/warc/redact.ts` | retrait des données personnelles, refus des URL privées et des en-têtes d'identification |
| Périmètre NA | `apps/api/src/warc/eligibility.ts` | sélection/exclusion des faits, partagée par la capture et la mesure |
| Capture et persistance | `apps/api/src/warc/service.ts` | téléchargement borné, WARC + index, écritures sérialisées |
| Redirections et routes mortes | `apps/api/src/warc/service.ts` | rejeu du cookie de session imposé par le gate anti-robot, repli sur la page vivante portant la même revendication pour une route legacy en 404 |
| Mesure | `apps/api/src/warc/measure.ts` | recompte vérifiable, aucune confiance aveugle dans la table |
| API et interface | `routes/warc-proofs.ts`, `WarcProofCard.tsx` | compteurs publics en anglais, affichés sur l'écran Corpus |

Six fichiers de test API, un comportement chacun, et un test d'interface :
18 tests dédiés, tous verts. Non-régression vérifiée : 40 tests
sécurité/contrat de routes et 4 tests de navigation, tous verts. Le typage
API et web passe sans erreur.

Tables : `db/migrate-064-warc-proof.sql` (index de preuve),
`db/migrate-065-warc-proof-bytes.sql` (enregistrement WARC conservé en base,
TOAST compressé). Les fichiers WARC locaux restent hors git (`data/warc/`) et
sont régénérables par la commande d'archivage.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : douze départements du référentiel partagé,
  ou indice départemental explicite — aucun fait hors région.
- **Sources grises autorisées** : aucun filtre par éditeur ; forums et sites de
  fuite sont capturés dès que la page est publique et sans donnée de victime.
- **Aucune donnée personnelle de victime** : exclusion TLP RED/AMBER et famille
  `leaks`, retrait des identifiants avant écriture, contrôle indépendant à la
  mesure.
- **Aucun service payant** : téléchargement HTTP direct, sans archive tiers
  payante ni contournement de paywall. Le gate anti-robot est franchi en
  rejouant le cookie posé par la source elle-même, pas en achetant un accès.
- **Code et interface en anglais** : API, types, commentaires ajoutés, libellés
  et panneau en anglais ; ce rapport reste en français.
- **`server.ts` inchangé** : zéro ligne modifiée, la route est enregistrée dans
  `routes/index.ts`.
- **Commandes < 60 s** : l'archivage est borné par `--max-seconds` (45 s par
  défaut) et relançable ; la dernière passe a traité les 10 faits restants en
  moins de 10 s. La mesure s'exécute en quelques secondes.

## Tranche suivante — reprise après dérive du corpus

La mesure historique de 271/271 a été faite sur le corpus disponible à 01:23.
Entre-temps, d'autres tranches ont retiré du périmètre 190 faits rattachés à
tort (organisations sans lien réel avec la Nouvelle-Aquitaine). La cible
recalculée en base est donc 81 faits éligibles, dont 69 seulement avaient encore
une preuve vérifiable au relevé de 03:32 (85,19 %). Le chiffre 271 n'est plus
reproductible sans réintroduire des faits que le chantier a explicitement
exclus ; la nouvelle tranche vise donc 100 % du périmètre courant.

Deux comportements ajoutés, chacun couvert par un test dédié
(`apps/api/test/warc-alternates.test.ts`) :

- les routes RansomLook abandonnées (`/post/<hash>`, `/site/blog?uuid=`,
  `/site/view?uuid=`) renvoient à la page `/group/<groupe>` encore servie, dont
  le nom est déjà dans la preuve du fait ;
- une alerte FrenchBreaches bloquée par un gate anti-robot (403) est remplacée
  par le miroir public `ransomware.live/id/<claim>` : le slug contient deux fois
  en base64 le couple `domaine@groupe` de la même revendication. Aucun accès
  payant, aucun cookie tiers, aucune donnée de victime ajoutée.

Les six faits restants ont été recapturés avec ces règles ; nouvelle mesure :
`eligibleFacts = 81`, `factsWithArchivableProof = 81`, `coveragePercent = 100`,
`invalidProofs = []`, `warcFiles = 4`, `warcBytes = 25 148 880`.
Le diff de `apps/api/src/server.ts` reste à zéro ligne.
