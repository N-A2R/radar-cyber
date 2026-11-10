INSERT INTO source (id, name, family, url, license, enabled, kind, format, interval_sec, description)
VALUES ('nvd_cve', 'NVD CVE 2.0', 'vuln', 'https://services.nvd.nist.gov/rest/json/cves/2.0', 'public', true, 'indicator', 'json', 21600, 'NVD CVE API 2.0')
ON CONFLICT (id) DO NOTHING;
