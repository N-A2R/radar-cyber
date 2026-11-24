# Horloge CRA des vulnérabilités graves

Depuis le 11 septembre 2026, une vulnérabilité grave (`family = 'vuln'`,
`sévérité >= 7`) doit porter, dès son entrée dans le radar, de quoi dire à un
éditeur de la région **quand** il doit signaler à l'ENISA et à ses utilisateurs.
Aucune ressaisie n'est nécessaire : les échéances sont écrites dans
`event.evidence` par la migration 217.

## Champs écrits

| Clé | Type | Origine |
| --- | --- | --- |
| `cpe` | texte | CPE déclarée par NVD, sinon construite depuis `vendor`/`product`, sinon depuis l'identifiant CVE. `non_renseigne` est explicite quand rien n'est connu. |
| `exploited` | booléen | Drapeau du collecteur, flux CISA KEV ou marqueur `known_exploited` / `in_kev` / `ransomware`. |
| `prise_de_connaissance` | ISO UTC | `event.at` (moment où le radar a appris le fait), avec replis historiques. |
| `deadline_24h` | ISO UTC | Alerte précoce à l'ENISA (24 h). |
| `deadline_72h` | ISO UTC | Notification à l'ENISA et aux utilisateurs quand la vulnérabilité est activement exploitée (72 h). |
| `deadline_14d` | ISO UTC | Rapport final (14 jours). |

Les valeurs déjà déclarées par un collecteur ne sont jamais écrasées. Le
trigger `cra_horloge_on_event` couvre les insertions et les mises à jour ; la
migration recharge aussi les lignes déjà présentes. Seuls des champs structurés
sont utilisés : ni titre, ni résumé, ni URL, ni donnée personnelle.

## Lecture par l'éditeur

Le module `apps/api/src/cra/horloge-cra.ts` fournit
`horlogeDepuisEvidence()` (échoue fermé si une clé manque) et
`renduHorlogeCra()` (dates UTC et destinataires). Les échéances affichées
sont exactement celles stockées en base.

## Critère exécuté tel quel

```sql
SELECT count(*) FROM event e WHERE e.family='vuln' AND e.severity>=7 AND (e.evidence->>'cpe' IS NULL OR e.evidence->>'exploited' IS NULL OR e.evidence->>'deadline_24h' IS NULL OR e.evidence->>'deadline_72h' IS NULL);
```

Résultat attendu : `0`.

Les cinq cas de tests (`apps/api/test/cra-horloge.test.ts`) couvrent les
échéances 24 h, 72 h et 14 jours, la qualification `cpe`/`exploited`, puis le
critère brut après rejeu du backfill.

```sh
apps/api/node_modules/.bin/tsx apps/api/test/run.ts apps/api/test/cra-horloge.test.ts
pnpm -F @radar/api test
pnpm -F @radar/api typecheck
```
