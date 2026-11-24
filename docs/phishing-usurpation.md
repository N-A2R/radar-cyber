# Usurpation de domaines — Nouvelle-Aquitaine (2026-11-21)

19 organisations, 532 variantes testées : 34 domaines actifs en DNS, 0 usurpations confirmées par la page publique.
Facteur de faux positifs : 34/34 alertes brutes sur un échantillon de 34 domaines actifs (100 %).
Certificats CT obtenus au relevé initial : 0/34 ; pages lisibles : 16/34.

Relevé CT complémentaire du 2026-11-24 : 34 requêtes publiques à Cert Spotter sur
les 34 domaines actifs archivés donnent **19/34 domaines avec certificat, 43 certificats
récents** (`bench/results/phishing-ct-spotter-2026-11-24.json`). Exemples : `univpoitiers.fr`
(Let's Encrypt, 2026-10-01 → 2026-12-30), `univ-poitiers.com` (2026-10-04 → 2027-01-02,
SAN `*.univ-poitiers.com`), `univ-nantes.net` (deux certificats en octobre 2026). Le
repli `certificatDepuisCertSpotter` comble l'angle mort de `crt.sh` : 19 candidats
passent de `certificat-absent-ou-ancien` (confiance faible) à `certificat-recent`.
Les pages publiques de ces 19 domaines ont été relues le 2026-11-24 : parkings,
sites touristiques ou commerciaux, ou redirection vers un hôte officiel
(`ch-poitiers.fr` → `ch-laborit.fr`, `larochelle.fr` → `www.larochelle.fr`) ;
**0 usurpation supplémentaire confirmée**. Aucune résolution intrusive, aucun
compte, aucune donnée personnelle de victime.
Reproduire : `pnpm mesure:typosquat -- --apply --max-variantes=25`.
