# Dette de sécurité par secteur — Nouvelle-Aquitaine

## Résultat mesuré (22 novembre 2026)

**9 secteurs sur 9 portent un indice, calculé sur la région entière : 1 673 151 organisations (100 %).**

Le délai de patchage mesuré est de **2 jours** (médiane entre la publication NVD et la capture régionale, sur 21 CVE pertinentes pour les technologies observées en Nouvelle-Aquitaine).

| Secteur | Indice | Organisations | Base | Hôtes sondés | TLS | SPF | DMARC |
|---|---:|---:|---|---:|---:|---:|---:|
| agroalimentaire | 64 | 147 597 | secteur | 28 | 86 | 75 | 0 |
| industrie | 69 | 76 618 | régional | 0 | 95 | 87 | 1 |
| construction | 69 | 115 649 | régional | 0 | 95 | 87 | 1 |
| commerce | 69 | 175 593 | régional | 0 | 95 | 87 | 1 |
| sante | 69 | 82 455 | régional (TLS) | 15 | 95 | 87 | 0 |
| enseignement | 66 | 44 385 | secteur | 40 | 95 | 73 | 3 |
| public | 73 | 7 861 | secteur | 40 | 97 | 100 | 3 |
| services | 71 | 949 385 | secteur | 40 | 94 | 98 | 0 |
| autre | 69 | 73 608 | régional | 0 | 95 | 87 | 1 |

L'indice va de 0 (dette maximale) à 100 (aucun défaut observé). Le dénominateur organisationnel est toujours celui de la région entière : aucun secteur n'est exclu ni réduit à un échantillon.

## Périmètre et données réelles

- **Région** : les 12 départements de Nouvelle-Aquitaine. Aucune donnée hors région n'entre dans le calcul.
- **Organisations** : 1 673 151 lignes du référentiel, réparties par `org.secteur_groupe` (mesure du 21 novembre 2026, `docs/secteurs-groupe.md`). Le décompte figé est versionné dans `bench/results/sector-organizations-na.json`.
- **Sources** : corpus publics déjà vérifiés et versionnés (`sources-na-1000.jsonl`, `sante-enseignement.jsonl`, `institutions-complet.jsonl`, `institutions.jsonl`, `sources-agriculture.jsonl`). Sources grises autorisées ; aucun service payant.
- **Sondes** : 163 domaines publics d'organisation, interrogés par DNS-over-HTTPS (Cloudflare, gratuit) pour SPF/DMARC et par handshake TLS sortant sur le port 443 pour les certificats. Aucun nom de victime, aucune donnée personnelle, aucun contact n'est collecté ni stocké.

## Règle de calcul

Quatre sous-scores de 0 à 100, pondérés à 25 % chacun :

1. **Patch lag** — délai médian, en jours, entre la publication d'une CVE pertinente et la capture du corpus régional. Proxy assumé : le radar ne dispose d'aucune télémétrie de versions installées. Score = 100 à 0 jour, 0 à 30 jours.
2. **TLS** — part des hôtes joignables dont le certificat est valide et le nom d'hôte correct. Un certificat expiré, une clé RSA faible (< 2 048 bits) ou un protocole TLS 1.0/1.1 est un défaut. Les courbes EC (P-256) ne sont pas confondues avec une clé RSA faible. Les hôtes injoignables sont exclus du dénominateur.
3. **SPF** — présence d'un enregistrement `v=spf1` contraint. Un `+all` est compté comme permissif, pas comme valide.
4. **DMARC** — présence d'un enregistrement `v=DMARC1` avec politique `reject` ou `quarantine`. `p=none` est compté comme simple surveillance.

Quand un secteur n'a pas assez d'hôtes sondés (moins de 3) ou qu'un signal n'a aucun échantillon exploitable, ce signal est remplacé par le taux régional et l'enregistrement est marqué `regional-fallback` / `signalBasis`. Le secteur « sante » illustre le cas : ses 15 hôtes étaient injoignables en TLS, donc son score TLS régional (95) est utilisé, tandis que son absence de DMARC (0) reste une mesure sectorielle réelle.

## Reproduction

```bash
# 1. Sonde gratuite et bornée (budget interne 42 s, une seule commande < 60 s)
pnpm sondes:securite-secteurs -- --per-sector 40 --budget-ms 42000

# 2. Mesure reproductible hors réseau (< 1 s) — écrit bench/results/security-sector-index-na.json
pnpm mesure:securite-secteurs
```

La commande de mesure affiche le dénominateur, le nombre de secteurs indicés et le tableau ci-dessus. Le résultat est aussi servi en lecture publique par `GET /api/security/sector-index` (agrégats uniquement).

## Tests

Un comportement par test dans `apps/api/test/security-sector-index.test.ts` : couverture des 9 secteurs, sincérité du total régional, dégradation du score avec le délai, SPF permissif, DMARC non contraignant, défauts TLS (dont courbes EC), repli par signal, exclusion des hôtes injoignables, absence de champ personnel, mesure du délai depuis le corpus NVD et refus d'un dénominateur incomplet.

## Limites

- Le « patch lag » est un proxy de visibilité régionale, pas une mesure de versions corrigées installées ; aucun outil gratuit ne fournit cette télémétrie à l'échelle de 1,67 M d'organisations.
- Quatre secteurs (industrie, construction, commerce, autre) n'ont pas de corpus public labellisé : leurs signaux DNS/TLS sont le taux régional explicite, pas une invention de données sectorielles.
- La sonde couvre 163 domaines publics, pas les 1,67 M d'organisations : les taux sont des indicateurs de tendance, pondérés par le dénominateur régional complet.
- Les hôtes injoignables ne prouvent pas une absence de protection ; ils sont retirés du dénominateur TLS et signalés dans les données sondées.
