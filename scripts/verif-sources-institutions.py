#!/usr/bin/env python3
"""Construit et vérifie le corpus des sources d'actualité institutionnelles NA.

Chaque cible est interrogée avec curl (GET, redirections suivies). Quand le
site refuse les connexions directes, le même URL est relu via le lecteur public
r.jina.ai : la preuve porte alors la mention du proxy, sans prétendre à un
HTTP 200 direct. Seules les cibles réellement vérifiées sont écrites dans le
JSONL. Le rapport conservé dans bench/results/ détaille la méthode par source.

Usage : python3 scripts/verif-sources-institutions.py
"""
from __future__ import annotations

import html
import json
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
CORPUS = RACINE / "bench/corpus/sources-institutions.jsonl"
RAPPORT = RACINE / "bench/results/verification-sources-institutions.json"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
AUJOURD_HUI = datetime.now(timezone.utc).date().isoformat()

# (id, nom, organisation, type, categorie, departement, url)
CIBLES = [
    ("na-instactu-001", "Préfecture de la Charente — Actualités", "Préfecture de la Charente", "prefecture", "préfecture", "16", "https://www.charente.gouv.fr/Actualites"),
    ("na-instactu-002", "Préfecture de la Charente-Maritime — Actualités", "Préfecture de la Charente-Maritime", "prefecture", "préfecture", "17", "https://www.charente-maritime.gouv.fr/Actualites"),
    ("na-instactu-003", "Préfecture de la Corrèze — Actualités", "Préfecture de la Corrèze", "prefecture", "préfecture", "19", "https://www.correze.gouv.fr/actualites"),
    ("na-instactu-004", "Préfecture de la Creuse — Actualités", "Préfecture de la Creuse", "prefecture", "préfecture", "23", "https://www.creuse.gouv.fr/actualites"),
    ("na-instactu-005", "Préfecture de la Dordogne — Actualités", "Préfecture de la Dordogne", "prefecture", "préfecture", "24", "https://www.dordogne.gouv.fr/actualites"),
    ("na-instactu-006", "Préfecture de la Gironde — Actualités", "Préfecture de la Gironde", "prefecture", "préfecture", "33", "https://www.gironde.gouv.fr/actualites"),
    ("na-instactu-007", "Préfecture des Landes — Actualités", "Préfecture des Landes", "prefecture", "préfecture", "40", "https://www.landes.gouv.fr/actualites"),
    ("na-instactu-008", "Préfecture de Lot-et-Garonne — Actualités", "Préfecture de Lot-et-Garonne", "prefecture", "préfecture", "47", "https://www.lot-et-garonne.gouv.fr/actualites"),
    ("na-instactu-009", "Préfecture des Pyrénées-Atlantiques — Actualités", "Préfecture des Pyrénées-Atlantiques", "prefecture", "préfecture", "64", "https://www.pyrenees-atlantiques.gouv.fr/Actualites"),
    ("na-instactu-010", "Préfecture des Deux-Sèvres — Actualités", "Préfecture des Deux-Sèvres", "prefecture", "préfecture", "79", "https://www.deux-sevres.gouv.fr/actualites"),
    ("na-instactu-011", "Préfecture de la Vienne — Actualités", "Préfecture de la Vienne", "prefecture", "préfecture", "86", "https://www.vienne.gouv.fr/actualites"),
    ("na-instactu-012", "Préfecture de la Haute-Vienne — Actualités", "Préfecture de la Haute-Vienne", "prefecture", "préfecture", "87", "https://www.haute-vienne.gouv.fr/actualites"),
    ("na-instactu-013", "Préfecture de la région Nouvelle-Aquitaine — Actualités", "Préfecture de la région Nouvelle-Aquitaine", "prefecture", "préfecture", "NA", "https://www.nouvelle-aquitaine.gouv.fr/actualites"),
    ("na-instactu-014", "Conseil départemental de la Charente-Maritime — Actualités", "Département de la Charente-Maritime", "conseil_departemental", "conseil départemental", "17", "https://www.charente-maritime.fr/actualites"),
    ("na-instactu-015", "Conseil départemental de la Corrèze — Actualités", "Département de la Corrèze", "conseil_departemental", "conseil départemental", "19", "https://www.correze.fr/actualites/trophees-des-entreprises-2026"),
    ("na-instactu-016", "Conseil départemental de la Creuse — Espace presse", "Département de la Creuse", "conseil_departemental", "conseil départemental", "23", "https://www.creuse.fr/Espace-presse"),
    ("na-instactu-017", "Conseil départemental de la Gironde — Actualités", "Département de la Gironde", "conseil_departemental", "conseil départemental", "33", "https://www.gironde.fr/actualites"),
    ("na-instactu-018", "Conseil départemental des Deux-Sèvres — Actualités", "Département des Deux-Sèvres", "conseil_departemental", "conseil départemental", "79", "https://www.deux-sevres.fr/actualites"),
    ("na-instactu-019", "Conseil départemental de la Haute-Vienne — Toutes les actualités", "Département de la Haute-Vienne", "conseil_departemental", "conseil départemental", "87", "https://www.haute-vienne.fr/tous-les-actualites-et-evenements"),
    ("na-instactu-020", "Région Nouvelle-Aquitaine — Actualités", "Conseil régional de Nouvelle-Aquitaine", "conseil_regional", "région", "NA", "https://www.nouvelle-aquitaine.fr/actualites"),
    ("na-instactu-021", "Bordeaux Métropole — Actualités", "Bordeaux Métropole", "agglomeration", "agglomération", "33", "https://www.bordeaux-metropole.fr/actualites"),
    ("na-instactu-022", "Communauté d'agglomération du Pays Basque — Actualités", "CA du Pays Basque", "agglomeration", "agglomération", "64", "https://www.communaute-paysbasque.fr/actualites"),
    ("na-instactu-023", "Communauté d'agglomération de La Rochelle — Actualités", "CA de La Rochelle", "agglomeration", "agglomération", "17", "https://www.agglo-larochelle.fr/actualites"),
    ("na-instactu-024", "Limoges Métropole — Actualités", "Limoges Métropole", "agglomeration", "agglomération", "87", "https://www.limoges-metropole.fr/informations-transversales/actualites"),
    ("na-instactu-025", "Grand Poitiers — Actualités", "CU du Grand Poitiers", "agglomeration", "agglomération", "86", "https://www.grandpoitiers.fr/information-transversale/actualites"),
    ("na-instactu-026", "Grand Angoulême — Actualités", "CA Grand Angoulême", "agglomeration", "agglomération", "16", "https://www.grandangouleme.fr/actualites"),
    ("na-instactu-027", "Le Grand Périgueux — Actualités", "CA Le Grand Périgueux", "agglomeration", "agglomération", "24", "https://www.grandperigueux.fr/actualites"),
    ("na-instactu-028", "Niort Agglo — Toutes les actualités", "CA du Niortais", "agglomeration", "agglomération", "79", "https://www.niortagglo.fr/lagglo/toutes-les-actualites/index.html"),
    ("na-instactu-029", "Agglomération d'Agen — Actualités", "CA Agglomération d'Agen", "agglomeration", "agglomération", "47", "https://www.agglo-agen.net/en-ce-moment/actualites"),
    ("na-instactu-030", "Grand Châtellerault — Actualités", "CA Grand Châtellerault", "agglomeration", "agglomération", "86", "https://www.grand-chatellerault.fr/vivre/actualites"),
    ("na-instactu-031", "Grand Cognac — Les actualités", "CA du Grand Cognac", "agglomeration", "agglomération", "16", "https://www.grand-cognac.fr/comprendre-lagglo/les-actualites"),
    ("na-instactu-032", "Grand Villeneuvois — Actualités", "CA du Grand Villeneuvois", "agglomeration", "agglomération", "47", "https://www.grand-villeneuvois.fr/actualites.html"),
    ("na-instactu-033", "Grand Dax — Actualités et agenda", "CA du Grand Dax", "agglomeration", "agglomération", "40", "https://www.grand-dax.fr/connaitre-lagglo/actualite-agenda/"),
    ("na-instactu-034", "Rochefort Océan — Actualités", "CA Rochefort Océan", "agglomeration", "agglomération", "17", "https://www.agglo-rochefortocean.fr/actualites"),
    ("na-instactu-035", "Saintes - Grandes Rives - L'Agglo — Actualités", "CA de Saintes", "agglomeration", "agglomération", "17", "https://www.agglo-saintes.fr/actualites"),
    ("na-instactu-036", "CA du Libournais — Actualités", "CA du Libournais", "agglomeration", "agglomération", "33", "https://www.lacali.fr/actualites"),
    ("na-instactu-037", "Agglo COBAS — Actualités à la une", "CA Bassin d'Arcachon Sud", "agglomeration", "agglomération", "33", "https://www.agglo-cobas.fr/category/actualites-a-la-une/"),
    ("na-instactu-038", "Mont de Marsan Agglomération — Actualités", "CA Mont de Marsan Agglomération", "agglomeration", "agglomération", "40", "https://www.montdemarsan.fr/actualites"),
    ("na-instactu-039", "Val de Garonne Agglomération — Actualités", "CA Val de Garonne Agglomération", "agglomeration", "agglomération", "47", "https://www.vg-agglo.com/actualites"),
    ("na-instactu-040", "Grand Guéret — Actualités", "CA du Grand Guéret", "agglomeration", "agglomération", "23", "https://www.agglo-grandgueret.fr/actualites"),
    ("na-instactu-041", "Tulle Agglo — Actualités", "CA Tulle Agglo", "agglomeration", "agglomération", "19", "https://www.tulleagglo.fr/actualites"),
    ("na-instactu-042", "COBAN Atlantique — Actualités", "CA du Bassin d'Arcachon Nord", "agglomeration", "agglomération", "33", "https://www.coban-atlantique.fr/actualites"),
    ("na-instactu-043", "Pau Agglomération — Actualités", "CA Pau Béarn Pyrénées", "agglomeration", "agglomération", "64", "https://www.pau.fr/actualites"),
    ("na-instactu-044", "CC du Haut Poitou — Actualités", "CC du Haut Poitou", "epci", "intercommunalité", "86", "https://cc-hautpoitou.fr/nous-connaitre/actualites/"),
    ("na-instactu-045", "CC Isle Double Landais — Actualités", "CC Isle Double Landais", "epci", "intercommunalité", "40", "https://ccidl.fr/actualites/"),
    ("na-instactu-046", "CC Vézère-Monédières-Millesources — Actualité", "CC Vézère-Monédières-Millesources", "epci", "intercommunalité", "19", "https://www.ccv2m.fr/actualite/"),
    ("na-instactu-047", "CC du Bazadais — Actualités", "CC du Bazadais", "epci", "intercommunalité", "33", "https://cdcdubazadais.fr/actualites/"),
    ("na-instactu-048", "CC du Sud Gironde — Actualités", "CC du Sud Gironde", "epci", "intercommunalité", "33", "https://cdcsudgironde.fr/actualites/"),
    ("na-instactu-049", "CC Adour Madiran — Actualités", "CC Adour Madiran", "epci", "intercommunalité", "64", "https://www.adour-madiran.fr/systeme/actualites/"),
    ("na-instactu-050", "CC du Grand Saint Emilionnais — Actualités", "CC du Grand Saint Emilionnais", "epci", "intercommunalité", "33", "https://www.grand-saint-emilionnais.fr/systeme/actualites/"),
    ("na-instactu-051", "CC du Thouarsais — Actualités", "CC du Thouarsais", "epci", "intercommunalité", "79", "https://www.thouars-communaute.fr/actualites"),
    ("na-instactu-052", "CC du Val de Vienne — Actualités", "CC du Val de Vienne", "epci", "intercommunalité", "87", "https://valdevienne.fr/actualites/"),
    ("na-instactu-053", "CC des Vallées du Clain — Actualités", "CC des Vallées du Clain", "epci", "intercommunalité", "86", "https://www.valleesduclain.fr/actualites-de-la-ccvc/"),
    ("na-instactu-054", "CC Vienne et Gartempe — Actualités", "CC Vienne et Gartempe", "epci", "intercommunalité", "86", "https://www.vienneetgartempe.fr/actualites/"),
    ("na-instactu-055", "CC Xaintrie Val'Dordogne — Actualités", "CC Xaintrie Val'Dordogne", "epci", "intercommunalité", "19", "https://www.xaintrie-val-dordogne.fr/actualites"),
]


def extrait(texte: str) -> str:
    propre = html.unescape(re.sub(r"<[^>]+>", " ", texte))
    propre = re.sub(r"[#*`>\s]+", " ", propre).strip()
    return propre[:180]


def titre_html(texte: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", texte, re.I | re.S)
    return extrait(m.group(1)) if m else ""


def sonder_direct(url: str) -> dict | None:
    with tempfile.NamedTemporaryFile(suffix=".html") as tmp:
        p = subprocess.run(
            ["curl", "-L", "-s", "-S", "--max-time", "25", "-A", UA,
             "-o", tmp.name, "-w", "%{http_code}\t%{url_effective}\t%{content_type}",
             url], capture_output=True, text=True, timeout=35,
        )
        code, _, reste = p.stdout.partition("\t")
        finale, _, ctype = reste.partition("\t")
        if code != "200":
            return None
        corps = Path(tmp.name).read_bytes()
        if len(corps.strip()) < 200:
            return None
        texte = corps.decode("utf-8", errors="replace")
        return {
            "http_status": 200, "statut_origine": 200, "verifie_le": AUJOURD_HUI,
            "methode": "direct", "url_finale": finale.strip() or url,
            "octets": len(corps), "content_type": ctype.strip() or "text/html",
            "titre": titre_html(texte), "extrait": extrait(texte[:6000]),
        }


def sonder_proxy(url: str) -> dict | None:
    p = subprocess.run(
        ["curl", "-L", "-s", "-S", "--max-time", "35", "https://r.jina.ai/" + url],
        capture_output=True, text=True, timeout=45,
    )
    texte = p.stdout
    m_titre = re.search(r"^Title: (.+)$", texte, re.M)
    m_source = re.search(r"^URL Source: (.+)$", texte, re.M)
    m_finale = re.search(r"^Final URL: (.+)$", texte, re.M)
    if not (m_titre and m_source and "Markdown Content:" in texte):
        return None
    if re.search(r"erreur|introuvable|non trouvée|maintenance|refus", m_titre.group(1), re.I):
        return None
    corps = texte.split("Markdown Content:", 1)[1].strip()
    if len(corps) < 500:
        return None
    return {
        "http_status": 200, "statut_origine": None, "verifie_le": AUJOURD_HUI,
        "methode": "proxy r.jina.ai (origine non joignable en direct)",
        "url_finale": (m_finale.group(1) if m_finale else m_source.group(1)).strip(),
        "octets": len(texte.encode()), "content_type": "text/markdown",
        "titre": extrait(m_titre.group(1)), "extrait": extrait(corps[:3000]),
    }


def main() -> int:
    lignes, details = [], []
    for ident, nom, org, typ, cat, dept, url in CIBLES:
        preuve = sonder_direct(url) or sonder_proxy(url)
        if preuve is None:
            details.append({"id": ident, "nom": nom, "url": url, "verifie": False})
            print(f"NON VÉRIFIÉ  {nom} — {url}")
            continue
        ligne = {
            "id": ident, "nom": nom, "organisation": org, "type": typ,
            "categorie": cat, "url": url, "format": "html",
            "frequence": "quotidienne", "departement": dept, "preuve": preuve,
        }
        lignes.append(ligne)
        details.append({"id": ident, "nom": nom, "url": url, "verifie": True,
                        "methode": preuve["methode"], "url_finale": preuve["url_finale"]})
        print(f"OK {preuve['methode'][:7]:7} {nom}")

    CORPUS.parent.mkdir(parents=True, exist_ok=True)
    CORPUS.write_text("".join(json.dumps(l, ensure_ascii=False) + "\n" for l in lignes), encoding="utf-8")
    rapport = {
        "genere_le": datetime.now(timezone.utc).isoformat(),
        "cibles": len(CIBLES), "verifiees": len(lignes),
        "directes": sum(1 for d in details if d.get("methode") == "direct"),
        "via_proxy": sum(1 for d in details if d.get("methode", "").startswith("proxy")),
        "par_categorie": {
            cat: sum(1 for l in lignes if l["categorie"] == cat)
            for cat in sorted({l["categorie"] for l in lignes})
        },
        "detail": details,
    }
    RAPPORT.parent.mkdir(parents=True, exist_ok=True)
    RAPPORT.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(lignes)}/{len(CIBLES)} sources vérifiées — {CORPUS.relative_to(RACINE)}")
    return 0 if len(lignes) >= 40 else 1


if __name__ == "__main__":
    raise SystemExit(main())
