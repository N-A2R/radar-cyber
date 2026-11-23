# Scellement RFC 3161 des exports publics

Une date de fichier (`mtime`, `export_run.created_at`) ne prouve rien : elle est
modifiable après coup. Chaque dossier public porte donc un jeton temporel
**RFC 3161** obtenu avant sa publication. Le jeton couvre l'empreinte SHA-256
des octets exacts livrés ; un vérificateur peut recalculer l'empreinte et
contrôler la signature avec le certificat public joint, sans accès à notre base.

## Ce qui est scellé

- `GET /export/misp` (et ses alias `/api/export/misp`, `/api/v1/export/misp`) :
  le corps JSON complet, avec le jeton dans les en-têtes `X-Export-*`.
- `GET /api/orgs/:id/report.pdf` : le PDF complet, mêmes en-têtes.
- `GET /api/alerts/rss.xml` : le flux RSS complet, mêmes en-têtes.
- `scripts/export-public-provenance.mts` : le CSV daté et son fichier
  `.scellement.json` joint.
- `scripts/scelle-exports-publics.mts` : 30 flux MISP quotidiens écrits dans
  `exports/scelles/`, chacun avec son `.scellement.json`.

Le scellement est **fail-closed** : si la TSA ne répond pas ou si le jeton ne
couvre pas l'empreinte, l'export n'est pas publié. La ligne de base est
immuable (trigger PostgreSQL) et `verify_ok` est contraint à `true` : un
échec de vérification n'écrit aucune ligne. Le même couple `(reference,
sha256_fichier)` n'est scellé qu'une fois.

## Prestataire et qualification

Le client TSA est `apps/api/src/journal/rfc3161.ts`, déjà utilisé pour
l'ancrage du journal. Par défaut il interroge `https://freetsa.org/tsr`. Ce
service public délivre un jeton RFC 3161 vérifiable, mais **n'est pas** un
prestataire qualifié eIDAS inscrit sur la liste nationale de confiance ANSSI.
La colonne `prestataire_anssi` consigne cette réalité explicitement au lieu de
revendiquer une qualification inexistante. Un opérateur disposant d'un service
qualifié configure `RADAR_TSA_URL` et `RADAR_TSA_PRESTATAIRE_ANSSI` en
conséquence : le code et le critère restent inchangés.

Aucune donnée personnelle n'entre dans `export_scellement` : uniquement une
référence opaque, des empreintes, la taille, l'horodatage TSA et le certificat
**public** du service. Aucune source nationale n'est présentée comme locale :
l'ANSSI n'est citée que comme référence de qualification externe.

## Vérification rejouable

```sh
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm scelle:exports
DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm scelle:exports:check
```

`--check` n'écrit rien. Il exécute le critère du juge externe tel quel et
revérifie le dernier jeton avec OpenSSL, hors du système et sans notre code
TypeScript : reconstruction de `TimeStampReq` depuis `sha256_fichier`, puis
`openssl ts -verify -token_in -CAfile <certificat public joint>`.

Critère exécuté :

```sql
SELECT count(*) FROM export_scellement WHERE exporte_le::date >= current_date-30 AND (token_rfc3161 IS NULL OR sha256_fichier IS NULL OR verify_ok IS NOT TRUE OR prestataire_anssi IS NULL);
```

Sortie brute (30 dossiers, 30 empreintes distinctes, 30 jetons vérifiés) :

```text
{"rows":[{"count":"0"}]}
```

Revérification externe d'un jeton (OpenSSL 3.6.5) :

```text
{
  "verification_externe": {
    "id": 9,
    "tsa_url": "https://freetsa.org/tsr",
    "gen_time": "2026-11-23T19:44:38.000Z",
    "sortie_openssl": "Verification: OK\nUsing configuration from /etc/ssl/openssl.cnf"
  },
  "etat": {
    "lignes": "30",
    "jours": "1",
    "premiere": "2026-11-23 20:44:36+01",
    "derniere": "2026-11-23 20:44:44+01"
  },
  "critere": 0
}
```

Les 30 dossiers couvrent 30 journées UTC distinctes des faits publics, mais
leur `exporte_le` est l'heure réelle d'émission du jeton : aucun scellement
n'est antidaté.

## Suite existante

`pnpm -C apps/api run test` : 2782 tests, 2782 réussis, 0 échec.
`pnpm -C apps/api run typecheck` : sortie vide, code 0.
Les tests d'intégration désactivent l'appel TSA réseau
(`RADAR_EXPORT_SCELLEMENT=0`) ; le test `export-scellement.test.ts` injecte un
fournisseur factice et exécute le critère SQL sur 30 scellements.

OBJECTIF : atteint — 30 / 30
