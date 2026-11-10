# Organisations (orgs)

## Source

Les organisations sont importées depuis l'API publique
`https://recherche-entreprises.api.gouv.fr/search` (pas de clé requise, HTTP 200).
L'API INSEE SIRENE (`api.insee.fr`) exige un token : non utilisée par défaut.
Procédure d'obtention de clé INSEE : créer un compte sur `https://api.insee.fr`,
souscrire à l'API Sirene, puis passer le token via `INSEE_TOKEN`.

## Import

```bash
# Aperçu (aucune écriture)
pnpm exec tsx scripts/sirene-import.mts --dry-run

# Application réelle, 100 orgs/département max
pnpm exec tsx scripts/sirene-import.mts --apply --per-dept=100

# Limitation globale
pnpm exec tsx scripts/sirene-import.mts --apply --limit=200
```

Départements couverts : 16,17,19,23,24,33,40,47,64,79,86,87.
Secteurs d'intérêt : santé (NAF 86), enseignement (85), collectivités (84),
opérateurs critiques (35,49-52,61-63).

Idempotent : `ON CONFLICT (slug) DO NOTHING`.

## Géocodage

Les orgs importées n'ont pas de lat/lng. Lancer ensuite :

```bash
pnpm exec tsx scripts/geocode-orgs.mts
```

## Relance mensuelle

Relancer `--apply` chaque mois : les nouveaux SIREN sont ajoutés, les existants
ignorés (slug). Mesurer : `SELECT count(*) FROM org` et
`SELECT count(*) FROM org WHERE lat IS NULL`.

## Limites

- SIRENE ne couvre pas les petites associations ni les structures non immatriculées.
- Les domaines/site web ne sont pas fournis par l'API → à compléter manuellement.
- Plafond de 10 000 résultats par requête côté API → pagination limitée à 20 pages.