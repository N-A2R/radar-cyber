# Mesure par injection contrôlée en préproduction — 2026-11-23

La détection est **mesurée**, pas déclarée : le jeu `injection-eval-v1` écrit de vrais événements en préproduction, exécute le moteur d'alertes réel, puis relit les alertes en base. La base reste la source du critère ; `bench/results/injection-eval.json` est un artefact d'audit. Les migrations `db/migrate-220-injection-eval.sql` (schéma) et `db/migrate-221-injection-eval-seed.sql` (résultats du 2026-11-23) décrivent le dispositif.

## Ce qui est injecté

- **30 scénarios synthétiques**, générés de façon déterministe par `buildScenarios()` (`apps/api/src/eval/injection.ts`) : 6 règles × 5 thèmes. Règles : `ransomware-revendication`, `incident-confirme`, `fuite-donnees`, `avis-cert-fr`, `certificat-observé`, `presse-cyber`. Un scénario = une organisation fictive et trois événements.
- **3 sources distinctes par scénario** (`injection-eval-src-a`, `injection-eval-src-b`, `injection-eval-src-c`), avec des titres différents : c'est la règle de corroboration réelle du moteur, et cela évite l'écrasement par le dédoublage inter-flux (même fait, même jour).
- **30 jours de contrôle bénins** : un événement `ambient` / `ambient_signal` par jour sur la source `injection-eval-control`, du 2026-10-25 au 2026-11-23 (agenda et météo régionaux, sans fait cyber), sans organisation rattachée.

Organismes fictifs, villes de Nouvelle-Aquitaine et URL de preuve `example.invalid` : aucune victime réelle, aucune donnée personnelle, aucune source nationale présentée comme locale.

## Moteur réel utilisé

Aucun détecteur de substitution : chaque événement est soumis à `evaluateEvent()` dans `apps/api/src/detect/engine.ts`. Pour les scénarios, le contexte de corroboration est préchargé avec `loadCorroborationContext([orgId], observedAt)` puis transmis à `evaluateEvent(eventId, { corroboration })` ; le contrôle appelle `evaluateEvent(eventId)` directement. Les identifiants d'alertes sont ensuite relus en base (`SELECT id FROM alert WHERE event_id = ANY(...)`) : `detected` et `alerted` traduisent une alerte réellement visible, jamais une valeur attendue.

## Définition de `latency_s`

`latency_s` (`numeric(10, 3)` dans `injection_eval`) est le nombre de secondes écoulées entre `injected_at` — début de l'injection du scénario, avant la première écriture — et la première alerte visible en base. Le chronomètre couvre donc l'écriture de l'organisation et des trois événements, la passe de détection par `evaluateEvent` et la relecture des alertes. Il est calculé par `(Date.now() - started) / 1000`, arrondi à trois décimales. Une contrainte de table impose `latency_s IS NOT NULL` dès que `detected` est vrai, et `latency_s >= 0`. Cible : alerte visible au plus tard **60 s** après l'injection (`LATENCY_CIBLE_S = 60`).

## Commandes de reproduction

```sh
DATABASE_URL=<url-de-la-base-de-preproduction> pnpm migrate
DATABASE_URL=<url-de-la-base-de-preproduction> pnpm mesure:injection
DATABASE_URL=<url-de-la-base-de-preproduction> pnpm verifie:injection
```

`mesure:injection` exécute `mesurerInjection()`, remplace de façon idempotente les lignes du run `injection-eval-v1` (`DELETE` puis `INSERT ... ON CONFLICT DO UPDATE`) et écrit le rapport JSON dans `bench/results/injection-eval.json` (options `--json=<chemin>` ou `--stdout`). `verifie:injection` échoue si le total n'est pas 30, si le taux est inférieur à 0,90, si une alerte apparaît en période de contrôle, si le nombre de jours de contrôle n'est pas 30 ou si des alertes sont présentes sur ces jours.

## Valeurs mesurées le 2026-11-23

| Mesure | Valeur observée |
| --- | --- |
| Scénarios injectés / alertes en ≤ 60 s | 30/30 |
| Taux de détection | 1 |
| Latence maximale | 0,618 s |
| Jours de contrôle | 30 |
| Alertes sur la période de contrôle | 0 |

Le détail par scénario et par jour figure dans `bench/results/injection-eval.json` ; la migration 221 rejoue ces valeurs de façon idempotente.

## Critère SQL : requêtes et résultats bruts

```sql
SELECT count(*) FILTER (WHERE detected AND latency_s<=60)::float/count(*) FROM injection_eval;
-- résultat brut : 1  (total = 30 ; cible >= 0,90)

SELECT count(*) FROM injection_eval WHERE control_period AND alerted;
-- résultat brut : 0  (cible = 0)
```

Sortie brute affichée par `verifie:injection` :

```text
[{"taux":1,"total":30}]
[{"nb":0}]
[{"jours":30,"alertes":0}]
```

Bloc `critere` du rapport JSON : `{"taux":1,"total":30,"alertes_controle":0,"jours_controle":30,"alertes_jours_controle":0}`.

## Contrôle hors du dénominateur

Les 30 observations de contrôle sont stockées dans `injection_control_eval`, pas dans `injection_eval`. Pour les 30 scénarios actifs, `injection_eval.control_period` vaut systématiquement `false` : aucune ligne n'est à la fois scénario et observation de contrôle. Le dénominateur `count(*)` de la première requête porte donc uniquement sur les 30 scénarios actifs, et la latence n'est mesurée que pour eux. La deuxième requête est une garde-fou : elle vérifie qu'aucune ligne d'`injection_eval` n'est marquée `control_period AND alerted`, ce qui est le cas (0). Le bruit bénin est quant à lui vérifié à part sur `injection_control_eval` : 30 jours, 0 alerte. Ce découpage évite de mélanger taux de détection (rappel, avec contrainte de latence) et taux de faux positifs (contrôle sur 30 jours).
