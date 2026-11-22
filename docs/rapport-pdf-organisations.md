# Rapport — rapport PDF de 10 pages par organisation (22 novembre 2026)

## Objectif mesuré

Objectif : **un rapport de 10 pages généré automatiquement pour n'importe laquelle des 1 673 151 organisations** du référentiel de Nouvelle-Aquitaine.

| Mesure | Résultat |
| --- | ---: |
| Organisations valides éligibles | 1 673 151 |
| Organisations pour lesquelles le rapport a été construit | **1 673 151** |
| Pages par rapport | **10 / 10** |
| Rapports avec un nombre de pages incorrect | 0 |
| PDF sérialisés et vérifiés (échantillon) | **13 / 13** |
| PDF invalides | 0 |
| Durée de la mesure | 20,8 s |

**Chiffre obtenu : 1 673 151 / 1 673 151 organisations produisent un rapport de 10 pages**, avec 13 PDF réellement écrits et vérifiés (un par département de Nouvelle-Aquitaine, plus un organisme sans département). Aucune organisation n'est exclue : le générateur est total sur le référentiel, y compris pour les organismes sans événement, sans actif et sans domaine.

État réel de la base au moment de la mesure : 1 673 151 organisations valides, 315 sources, 26 240 événements courants. Le chiffre de 312 sources annoncé au départ correspond à l'instantané du cadrage ; la mesure lit les compteurs de la base, elle ne les recopie pas.

## Commande reproductible

Mesure en lecture seule, aucune écriture en base, moins de 25 s observées :

```bash
apps/api/node_modules/.bin/tsx scripts/measure-org-reports.mts \
  --json=bench/results/org-report.json
```

Sortie observée :

```text
BASELINE_ORGS=1673151
BASELINE_SOURCES=315
BASELINE_EVENTS=26240
ORG_REPORT_ELIGIBLE=1673151/1673151
ORG_REPORT_PAGES=10/10
ORG_REPORT_PDF_SAMPLES=13/13
MEASURE_MS=20846
```

Le résultat machine est enregistré dans `bench/results/org-report.json`. La commande échoue (code de sortie 1) si une organisation manque, si un rapport n'a pas exactement dix pages dans l'ordre prévu, ou si l'un des PDF échantillonnés est invalide.

## Ce qui est livré

- `apps/api/src/report/org-report.ts` : les dix pages et l'écrivain PDF 1.4, sans dépendance ni service externe (polices Helvetica de base, encodage WinAnsi pour les accents français).
- `apps/api/src/report/org-report-data.ts` : les agrégats réels, avec un chemin par requête pour l'API et un index préchargé pour la mesure exhaustive.
- `GET /api/orgs/:id/report.pdf` : un PDF téléchargeable pour n'importe quel identifiant connu, `404` sinon. Le nombre de pages est aussi renvoyé dans `X-Report-Pages`.
- `apps/web/src/components/OrgSheet.tsx` : bouton anglais « Download 10-page report (PDF) » sur la fiche organisation. Le rapport lui-même est en français.
- `apps/api/src/server.ts` : **0 ligne de diff**. La route passe par le registre unique, donc le serveur et l'application de test partagent la même surface.

Les dix pages sont : identité et périmètre ; empreinte numérique ; événements ; chronologie sur douze mois ; sources et provenance ; revendications ; exposition et actifs ; liens et dépendances ; limites et conformité ; méthode et reproductibilité.

## Étapes testables

Neuf tests, un par comportement observable, dans `apps/api/test/org-report.test.ts` :

1. dix pages dans l'ordre documenté ;
2. un identifiant inconnu ne produit pas de rapport ;
3. le PDF contient dix objets page et un arbre de pages cohérent ;
4. aucun nom de victime ni extrait de revendication n'apparaît dans le rapport ou le PDF ;
5. seules les sources liées à la Nouvelle-Aquitaine comptent dans le total régional ;
6. les sources grises (`relevance = 'context'`) sont conservées ;
7. le chemin groupé de la mesure donne les mêmes dix pages que le chemin de l'API ;
8. la route HTTP sert un PDF téléchargeable de dix pages ;
9. un identifiant inconnu renvoie `404`.

Vérifications exécutées : 9/9 tests réussis sur une base de test isolée, typecheck API sans erreur, `status=200 content-type=application/pdf pages=10` sur l'application complète (`buildApp()`), et mesure exhaustive ci-dessus.

## Contraintes

- **Nouvelle-Aquitaine uniquement** : les douze départements de la région sont utilisés pour le décompte régional des sources ; le rapport étiquette explicitement le département de l'organisation.
- **Sources grises autorisées** : aucune source n'est écartée pour son caractère non institutionnel ; le nombre de sources grises est imprimé dans le rapport.
- **Aucune donnée personnelle de victime** : seuls des volumes, des familles et des mois sont sérialisés. Titres d'événements, corps de revendications, URLs de sources et valeurs d'actifs (IP, noms d'hôte, certificats) ne sont jamais écrits dans le PDF.
- **Aucun service payant** : génération locale, aucune police distante, aucun appel réseau, aucune clé d'API.
- **Code et interface en anglais, rapport en français** : identifiants, commentaires, messages de test et bouton en anglais ; contenu du PDF et ce document en français.
- **`server.ts` inchangé** : 0 ligne de diff ; aucune commande de mesure ou de test dépassant 60 secondes.

## Périmètre de la preuve

La mesure construit effectivement les dix pages de chaque organisation du référentiel (1 673 151) et vérifie leur structure. Pour rester sous la limite de 60 s, la sérialisation PDF complète est vérifiée sur 13 organisations représentatives plutôt que sur 1,67 M de fichiers ; toute autre organisation produit son PDF à la demande via la route HTTP, avec le même générateur. C'est ce même générateur qui est exercé par les neuf tests et par la mesure.

La PR #385 (export PDF/CSV sur 13/13 écrans) concerne l'export d'écran, pas ce rapport de dix pages par organisation : son objectif chiffré ne couvre pas celui-ci, d'où cette livraison distincte.
