# Extrait daté du catalogue ANSSI — fiches prestataires Nouvelle-Aquitaine

## Provenance

- **Source officielle (nationale)** : ANSSI, *Catalogue des produits, services, profils de protection et sites certifiés, qualifiés ou agréés*.
- **URL** : https://messervices.cyber.gouv.fr/visas/catalogue-produits-services-profils-de-protection-sites-certifies-qualifies-agrees-anssi.pdf
- **Édition du catalogue** : 19/11/2026 à 18:34:21 (mention portée par le PDF).
- **Extrait relevé le** : 23/11/2026.
- **Empreinte SHA-256 du PDF téléchargé** : `bacf0616b839b6d25fc5c0d29d055370f8d22ef1c0f66f5ddcac61518bd8b87c`.
- **Pages utilisées** : PACS p. 47 ; PASSI p. 49–50 ; PRIS p. 52 ; SecNumCloud p. 78.

Cette source est **nationale**. Elle n'est pas présentée comme une liste régionale : le périmètre « Nouvelle-Aquitaine » est celui du dossier de veille dans lequel les fiches sont produites. L'ancrage régional vérifié est indiqué pour chaque ligne (`siège SIRENE`, `observation DNS sur des domaines NA` ou `dossier NA seulement`).

## Vingt fiches recensées

Référence = numéro imprimé dans la colonne « Lien vers la décision de qualification » du catalogue. Les dates sont celles du catalogue (début / fin de qualification), sans extrapolation.
Le catalogue imprime le numéro seul dans la colonne « Lien vers la décision de qualification » ; la référence stockée est préfixée du référentiel pour rester non ambiguë (par exemple `2728` en section PASSI devient `PASSI-2728`).

| Prestataire | Référentiel | Référence ANSSI | Qualifié le | Validité fin | Ancrage régional vérifié |
|---|---|---|---|---|---|
| Adacis | PASSI | PASSI-2728 | 2026-04-20 | 2029-04-20 | Siège SIRENE en Gironde (33) |
| Dipole Security | PASSI | PASSI-2432 | 2026-03-03 | 2029-03-03 | Siège SIRENE en Charente-Maritime (17) |
| Heliaq Solutions | PASSI | PASSI-3391 | 2026-07-31 | 2029-07-31 | Siège SIRENE en Gironde (33) |
| Serma Safety & Security | PASSI | PASSI-435 | 2025-03-14 | 2027-02-07 | Siège SIRENE en Gironde (33, Pessac) |
| OVH | SecNumCloud | SecNumCloud-3393 | 2026-07-31 | 2029-07-31 | Observé sur des domaines d'organisations NA |
| Orange Business Services | SecNumCloud | SecNumCloud-1147 | 2025-07-11 | 2028-07-11 | Observé sur des domaines d'organisations NA |
| Orange Cyberdefense | PASSI | PASSI-1473 | 2025-09-11 | 2028-08-09 | Dossier NA seulement (prestataire national) |
| Thales Cyber Solutions | PRIS | PRIS-1514 | 2025-09-18 | 2028-09-18 | Dossier NA seulement (prestataire national) |
| Accenture SAS | PASSI | PASSI-4262 | 2026-11-10 | 2029-11-10 | Dossier NA seulement (prestataire national) |
| Capgemini Technology Services | PASSI | PASSI-2246 | 2026-02-04 | 2029-02-04 | Dossier NA seulement (prestataire national) |
| CGI France | PASSI | PASSI-426 | 2025-03-14 | 2027-09-16 | Dossier NA seulement (prestataire national) |
| Atos Digital Security | PASSI | PASSI-2470 | 2026-03-09 | 2029-03-09 | Dossier NA seulement (prestataire national) |
| Advens | PASSI | PASSI-421 | 2025-03-14 | 2027-08-04 | Dossier NA seulement (prestataire national) |
| Airbus Protect | PASSI | PASSI-422 | 2025-03-14 | 2027-11-05 | Dossier NA seulement (prestataire national) |
| Intrinsec Sécurité | PASSI | PASSI-4257 | 2026-11-10 | 2029-12-22 | Dossier NA seulement (prestataire national) |
| Formind | PASSI | PASSI-1872 | 2025-12-02 | 2028-05-27 | Dossier NA seulement (prestataire national) |
| Lexfo | PASSI | PASSI-3046 | 2026-06-10 | 2028-12-07 | Dossier NA seulement (prestataire national) |
| Sopra Steria Infrastructures and Security | PRIS | PRIS-2064 | 2025-12-18 | 2028-12-18 | Dossier NA seulement (prestataire national) |
| Cloud Temple | SecNumCloud | SecNumCloud-919 | 2025-05-30 | 2028-05-30 | Dossier NA seulement (prestataire national) |
| Alcyconie | PACS | PACS-4246 | 2026-11-10 | 2028-05-13 | Dossier NA seulement (prestataire national) |

## Règle de publication

Une fiche n'est affichée comme qualifiée que si `reference_anssi`, `qualifie_le` et `validite_fin` sont renseignés et si `validite_fin >= date du jour` pour une fiche active. Le déclencheur PostgreSQL `prestataire_qualifie_actif` refuse l'écriture d'une fiche active échue ; la route `GET /api/na/prestataires-qualifies` ne publie que les fiches courantes et joint systématiquement l'extrait daté.

## Vérification

```sql
SELECT count(*) FROM prestataire_qualifie WHERE reference_anssi IS NULL OR qualifie_le IS NULL OR validite_fin IS NULL OR (validite_fin<current_date AND active);
SELECT count(*) FROM prestataire_qualifie WHERE region = 'Nouvelle-Aquitaine';
```

Résultat attendu : `0` puis `20`.
Rejeu reproductible sur une base jetable : `pnpm verifie:prestataires-qualifies`.
