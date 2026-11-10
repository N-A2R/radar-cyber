\echo '=== Bruit par source (événements sans mot-clé cyber) ==='

WITH kw AS (
  SELECT unnest(ARRAY[
    'cyberattaque','cyber-attaque','ransomware','rançongiciel','fuite de données',
    'violation de données','vulnérabilité','faille','CVE-','zero-day','phishing',
    'hameçonnage','DDoS','ANSSI','CNIL','compromis','intrusion','piratage','rançon',
    'données personnelles','sécurité informatique','maliciel','cheval de Troie',
    'exfiltration','APT','botnet','serveur compromis','identifiants volés','revendication'
  ]) AS k
),
noisy AS (
  SELECT e.source_id, count(*) AS total,
         count(*) FILTER (WHERE NOT EXISTS (
            SELECT 1 FROM kw WHERE lower(coalesce(e.title,'')||' '||coalesce(e.summary,'')) LIKE '%'||lower(k)||'%'
         )) AS without_kw
  FROM event e
  GROUP BY e.source_id
)
SELECT s.id, s.name, n.total, n.without_kw,
       round(100.0*n.without_kw/NULLIF(n.total,0),1) AS pct_noise
FROM noisy n JOIN source s ON s.id=n.source_id
ORDER BY n.without_kw DESC, n.total DESC
LIMIT 20;

\echo '=== Top 20 pires sources (par volume de bruit) ==='
-- (déjà ci-dessus)

\echo '=== Part globale des événements sans mot-clé sur les 8749 ==='
SELECT count(*) AS total_events,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM unnest(ARRAY[
           'cyberattaque','cyber-attaque','ransomware','rançongiciel','fuite de données',
           'violation de données','vulnérabilité','faille','CVE-','zero-day','phishing',
           'hameçonnage','DDoS','ANSSI','CNIL','compromis','intrusion','piratage','rançon',
           'données personnelles','sécurité informatique','maliciel','cheval de Troie',
           'exfiltration','APT','botnet','serveur compromis','identifiants volés','revendication'
         ]) AS k WHERE lower(coalesce(event.title,'')||' '||coalesce(event.summary,'')) LIKE '%'||lower(k)||'%'
       )) AS without_kw,
       round(100.0*count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM unnest(ARRAY[
           'cyberattaque','cyber-attaque','ransomware','rançongiciel','fuite de données',
           'violation de données','vulnérabilité','faille','CVE-','zero-day','phishing',
           'hameçonnage','DDoS','ANSSI','CNIL','compromis','intrusion','piratage','rançon',
           'données personnelles','sécurité informatique','maliciel','cheval de Troie',
           'exfiltration','APT','botnet','serveur compromis','identifiants volés','revendication'
         ]) AS k WHERE lower(coalesce(event.title,'')||' '||coalesce(event.summary,'')) LIKE '%'||lower(k)||'%'
       ))/count(*),1) AS pct_noise
FROM event;
