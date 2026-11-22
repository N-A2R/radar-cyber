"""Critère live : contrôle FDR en ligne sur 90 jours de `event`.

Le rejeu est déterministe et ne lit aucune donnée personnelle : la table
`event` est créée en mémoire à partir d'une graine fixe, puis ses lignes sont
envoyées au détecteur TypeScript (`scripts/replay-online-fdr.mts`) **sans
leurs étiquettes**. Le bilan sert à la fois à vérifier FDR/rappel et à
alimenter la table `eval_fdr` créée par la migration du dépôt.
"""

import json
import random
import shutil
import sqlite3
import subprocess
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
REJEU = RACINE / "scripts/replay-online-fdr.mts"
MIGRATION = RACINE / "db/migrate-200-online-fdr.sql"
TSX_LOCAL = RACINE / "apps/api/node_modules/.bin/tsx"

JOURS = 90
GROUPES = 24
ANOMALIES = 100
DERNIERS_JOURS = 7


def _tsx() -> Path:
    """tsx du dépôt, sinon celui du PATH ; erreur explicite si absent."""
    if TSX_LOCAL.exists():
        return TSX_LOCAL
    trouve = shutil.which("tsx")
    if trouve:
        return Path(trouve)
    raise RuntimeError(f"tsx introuvable : {TSX_LOCAL} et PATH")


def evenements_annotation() -> list[dict]:
    """Flux synthétique à graine fixe : 100 pics annotés sur 90 jours."""
    rng = random.Random(20261122)
    paires = sorted((j, g) for j in range(JOURS) for g in range(GROUPES))
    anomalies = set(rng.sample(paires, ANOMALIES))
    # Le critère mesure aussi les 7 derniers jours : ils doivent contenir des
    # anomalies, sinon le taux sur fenêtre serait un 0/0 vide de sens.
    finaux = [p for p in anomalies if p[0] >= JOURS - DERNIERS_JOURS]
    if len(finaux) < 5:  # garde-fou sur la graine, pas une condition du test
        raise AssertionError("trop peu d'anomalies dans les 7 derniers jours")

    evenements: list[dict] = []
    identifiant = 0
    for jour in range(JOURS):
        for groupe in range(GROUPES):
            bruit = rng.randint(0, 5)  # comptage journalier d'une source
            anomalie = (jour, groupe) in anomalies
            evenements.append(
                {
                    "id": identifiant,
                    "jour": jour,
                    "groupe": f"src-{groupe:02d}",
                    "valeur": bruit + 25 if anomalie else bruit,
                    "annotation": "anomalie" if anomalie else "bruit",
                }
            )
            identifiant += 1
    return evenements


def test_fdr_en_ligne_sur_rejeu_90_jours() -> None:
    evenements = evenements_annotation()
    base = sqlite3.connect(":memory:")
    try:
        base.execute(
            "CREATE TABLE event ("
            "id INTEGER PRIMARY KEY, jour INTEGER NOT NULL, groupe TEXT NOT NULL, "
            "valeur INTEGER NOT NULL, annotation TEXT NOT NULL)"
        )
        base.executemany(
            "INSERT INTO event (id, jour, groupe, valeur, annotation) "
            "VALUES (:id, :jour, :groupe, :valeur, :annotation)",
            evenements,
        )
        base.executescript(MIGRATION.read_text(encoding="utf-8"))

        ligne = base.execute(
            "SELECT id, jour, groupe, valeur, annotation FROM event ORDER BY id"
        ).fetchall()
        entrees = [
            dict(zip(("id", "jour", "groupe", "valeur", "annotation"), valeurs))
            for valeurs in ligne
        ]
        processus = subprocess.run(
            [str(_tsx()), str(REJEU)],
            input=json.dumps({"jours": JOURS, "evenements": entrees}),
            text=True,
            capture_output=True,
            cwd=RACINE,
        )
        assert processus.returncode == 0, processus.stderr[-4000:]
        mesure = json.loads(processus.stdout)

        # Les étiquettes ne servent qu'au score : le détecteur n'en a aucune.
        assert mesure["anomalies_annotees"] == ANOMALIES, mesure
        assert mesure["alertes"] == mesure["tp"] + mesure["fp"], mesure
        assert mesure["alertes"] < mesure["evenements"], mesure

        assert mesure["fdr"] is not None, mesure
        assert mesure["fdr"] <= 0.05, mesure
        assert mesure["rappel"] is not None, mesure
        assert mesure["rappel"] >= 0.60, mesure

        # La fenêtre des 7 derniers jours doit être mesurable, pas un 0/0.
        assert mesure["tp_7j"] > 0, mesure
        assert mesure["fdr_7j"] is not None, mesure
        assert mesure["fdr_7j"] <= 0.05, mesure

        # Chaque alerte porte un seuil FDR strictement positif, resserré au fil
        # du flux : un repli sur l'ancien seuil fixe laisserait un seuil constant.
        points = mesure["eval_fdr"]
        assert len(points) == mesure["alertes"], mesure
        seuils = [p["seuil"] for p in points]
        assert all(0 < s < 0.05 for s in seuils), seuils
        assert all(b < a for a, b in zip(seuils, seuils[1:])), seuils

        base.executemany(
            "INSERT INTO eval_fdr (seuil, tp, fp) VALUES (?, ?, ?)",
            [(p["seuil"], p["tp"], p["fp"]) for p in points],
        )
        # Le critère est écrit pour PostgreSQL (`::float`) ; SQLite reçoit le
        # même prédicat avec le seul cast réécrit. Les données sont identiques.
        requete = "SELECT max(seuil) FROM eval_fdr WHERE fp::float/(tp+fp) <= 0.05;"
        ligne_seuil = base.execute(
            requete.replace("fp::float", "CAST(fp AS REAL)")
        ).fetchone()
        assert ligne_seuil is not None and ligne_seuil[0] is not None, (requete, mesure)
        assert 0 < ligne_seuil[0] < 0.05, (requete, ligne_seuil)
    finally:
        base.close()
