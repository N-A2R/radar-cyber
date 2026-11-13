# Prompts Exa Agent prêts à coller — mode Ultra

> Tout est prêt. Tu copies l'un des deux dans ton dashboard Exa Agent
> (ou tu lances `scripts/exa-agent-manques.py` avec `EXA_API_KEY`).
> Aucun code du radar n'appelle Exa — c'est un rattrapage manuel hors prod.

---

## PROMPT A — le trou du référentiel (recommandé, 1 run)

C'est celui qui débloque le programme : il enrichit les 411 entités qu'on sait
manquer, avec preuves.

### Query à coller

```
Tu es un chercheur OSINT chargé d'enrichir une liste d'entités vues dans des
revendications cyber (ransomware, fuites) mais absentes d'un référentiel de
34 330 organisations françaises (focus Nouvelle-Aquitaine).

On te donne 302 entités en inputData (les 411 du trou moins 109 horsZone déjà
écartées). Chacune a : nomLisible, nom (titre brut), zone actuelle
(france/inconnue), provenance, sources (nombre de sources distinctes),
premiereVue, derniereVue.

Ta mission : pour CHAQUE entité d'inputData, déterminer si c'est une
organisation française, et si oui retrouver son identité légale.

Règles dures :
- Ne JAMAIS répondre "absent" si un site était bloqué, inaccessible ou non rendu.
  Dans ce cas réponds "cannot_verify" avec raison="site inaccessible".
- Distingue bien present (preuve trouvée que c'est français) vs absent (preuve
  trouvée que ce n'est pas français) vs cannot_verify (pas de preuve).
- Le domaine canonique est le domaine officiel actuel, pas un sous-domaine.
- SIREN = 9 chiffres, SIRET = 14 chiffres. Ne les invente jamais.
- Une ville seule ne prouve pas la France (homonymes). Cherche pays + adresse.
- Privilégie : site officiel, societe.com, pappers.fr, annuaire-administration,
  Wikipedia sourcée. Ignore les blogs sans source.

Pour chaque entité, produis exactement un objet selon outputSchema.
Si l'entité est clairement étrangère et clairement étrangère, mets est_francaise="absent"
avec preuves, ne cherche pas de SIREN.
```

### Paramètres à mettre dans le dashboard

- **effort**: `ultra`
- **budget.maxCostDollars**: `10`  (ou `15` si tu veux être large — plafond, pas prix fixe)
- **budget.maxDurationSeconds**: `1800` (30 min, extensible à 3600)
- **inputData**: le contenu de `bench/results/manques-referentiel-2026-11-13.json` → tableau `manques` (je l'ai préparé en `bench/results/input-exa-manques.json` si tu veux le glisser)
- **outputSchema**: coller le JSON ci-dessous

### outputSchema (à coller tel quel)

```json
{
  "type": "object",
  "required": ["entites", "resume"],
  "additionalProperties": false,
  "properties": {
    "entites": {
      "type": "array",
      "maxItems": 500,
      "items": {
        "type": "object",
        "required": ["nomLisible", "est_francaise", "raison"],
        "additionalProperties": false,
        "properties": {
          "nomLisible": { "type": "string", "description": "Nom tel que fourni en entrée" },
          "nomOriginal": { "type": ["string", "null"], "description": "Titre brut complet si disponible" },
          "est_francaise": {
            "type": "string",
            "enum": ["present", "absent", "cannot_verify"],
            "description": "present=preuve que c'est français, absent=preuve que non, cannot_verify=pas tranchable"
          },
          "raison": { "type": "string", "maxLength": 300, "description": "Courte justification (1 phrase) avec type de preuve" },
          "domaine_canonique": { "type": ["string", "null"], "description": "Domaine officiel, ex: demos.fr" },
          "denomination_legale": { "type": ["string", "null"], "description": "Raison sociale exacte" },
          "siren": { "type": ["string", "null"], "pattern": "^[0-9]{9}$", "description": "SIREN 9 chiffres si trouvé, sinon null" },
          "siret_siege": { "type": ["string", "null"], "pattern": "^[0-9]{14}$" },
          "ville": { "type": ["string", "null"] },
          "departement": { "type": ["string", "null"], "pattern": "^[0-9]{2,3}$" },
          "region": { "type": ["string", "null"] },
          "type_organisation": {
            "type": ["string", "null"],
            "enum": ["entreprise", "association", "collectivite", "etablissement_public", "autre", null]
          },
          "sources_preuves": {
            "type": "array",
            "maxItems": 5,
            "items": { "type": "string", "format": "uri" },
            "description": "1 à 5 URL qui prouvent est_francaise + identité"
          },
          "confiance": {
            "type": "string",
            "enum": ["haute", "moyenne", "faible"],
            "description": "haute=site officiel + SIREN, moyenne=2 sources concordantes, faible=1 source"
          }
        }
      }
    },
    "resume": {
      "type": "object",
      "required": ["france_present", "france_absent", "cannot_verify", "avec_siren"],
      "additionalProperties": false,
      "properties": {
        "france_present": { "type": "integer", "minimum": 0 },
        "france_absent": { "type": "integer", "minimum": 0 },
        "cannot_verify": { "type": "integer", "minimum": 0 },
        "avec_siren": { "type": "integer", "minimum": 0 },
        "note": { "type": ["string", "null"], "maxLength": 500 }
      }
    }
  }
}
```

### Ce que tu récupères

- `run.output.structured.entites` → 411 lignes enrichies
- `run.output.grounding` → citations par champ (url + title + confidence)
- `run.stop_reason` → `schema_satisfied` (ok) ou `budget_reached`/`time_limit_reached` (partiel mais utile)

On archivera le `runId` + JSON brut dans `bench/results/exa-manques-YYYY-MM-DD.json` avant relecture humaine. Aucun import auto dans le référentiel.

### Coût estimé

1 run ultra pour 302 entités (411 - 109 horsZone), plafond 10$ → **coût réel 5–10$, dans les 20$ offerts à l'inscription + 10$/mois sans carte**. 411 runs `minimal` coûteraient 4,93$ mais sans parallélisation ni preuves groupées — ultra est plus propre ici.

---

## PROMPT B — trouver de nouvelles sources CTI (optionnel, second run)

À lancer seulement après A, si tu veux élargir le radar au-delà de nos 265 sources actuelles.

```
Trouve des sources publiques d'incidents cyber couvrant la France et la
Nouvelle-Aquitaine : flux RSS, pages de revendications, comptes Telegram/Twitter
de groupes, bulletins CERT, presse régionale avec rubrique cyber.

Critères :
- Source encore active en 2025-2026 (au moins 1 publication dans les 90 derniers jours)
- Couvre ransomware, fuite de données, intrusion, DDoS ou hameçonnage
- Accessible sans paywall ni auth (URL directe)

Pour chaque source, donne : nom, url, type (rss/html/telegram/twitter), famille
principale, fréquence, langue, zone, et 2 exemples d'articles récents avec date.
```

outputSchema minimal pour B : `{ sources: [{nom, url, type, famille, frequence, langue, zone, exemples:[{titre, date, url}]}] }` — maxItems 50, effort `high` ou `auto` suffit, plafond 5$.

---

## Après le run : quoi faire du résultat

1. Sauvegarder le JSON brut (grounding inclus) — c'est l'audit.
2. Relecture humaine des `present` avec `confiance=faible` ou `cannot_verify` nombreux.
3. Pour les `present` avec SIREN : vérif ponctuelle sur pappers/societe.com, puis
   chargement via notre `scripts/load-manques.mts` ou `recherche-entreprises.api.gouv.fr`.
4. Pour les `absent` : on les marque horsZone définitivement — ils sortent du trou.

