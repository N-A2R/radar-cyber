# Filtre cyber — un événement sans terme cyber est de la presse

## Règle
`apps/api/src/collectors/classify.ts` : le **texte** décide.
- `isCyberText(title, summary)` : vrai si titre+résumé contient au moins un terme de `CYBER_TERMS` (casse et accents neutralisés, pluriel `s` toléré).
- `classifyFamily({title, summary, sourceFamily, sourceName})` : contenu cyber → la famille de la source est conservée ; sinon → `presse`. Les familles `ransomware` et `cert_fr` sont rendues telles quelles.
- `SOURCE_ALLOWLIST` : sources qui ne publient que du cyber (NVD/NIST, CISA, CERT-FR/CERT-EU, Unit 42, RansomLook, Exploit-DB, Krebs, BleepingComputer, MISP…) et contournent le test de texte.
- Branchement : `generic.ts`, à l'insertion d'un événement narratif. Rien n'est jeté, tout est reclassé.

## Termes
FR : cyber, cyberattaque, cybercriminalite, cybersecurite, menace, attaque, piratage, rançongiciel, rançon, fuite/violation de données, vulnérabilité, faille, cve-, phishing, hameçonnage, maliciel, intrusion, compromission, exfiltration, DDoS, botnet, adware, spyware, cryptolocker, défiguration, sécurité informatique, identifiants volés, cheval de troie, zero-day, backdoor, rootkit, keylogger, RGPD, données personnelles, virus.
EN : cyberattack, attack, threat actor/intelligence, vulnerability, breach, leak, malware, spearphishing, compromised, exploit, zeroday, hacker, rce, apt, lateral movement, credentials, patch tuesday, security advisory, cybersecurity, infosec, personal data.

## Reclasser l'historique
```bash
pnpm exec tsx scripts/reclassify-events.mts            # DRY-RUN par défaut : transaction annulée
pnpm exec tsx scripts/reclassify-events.mts --apply    # copie dans event_reclass_archive puis bascule
```
Affiche la répartition par famille avant/après. `ransomware` et `cert_fr` sont intouchés ; aucune ligne supprimée.
