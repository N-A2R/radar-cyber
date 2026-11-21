import { useEffect, useRef } from "react";
import type { LiveAlert } from "../api";
import "./live-alerts.css";

/**
 * Bandeau d'alertes en direct — les alertes « tombent » dans le dashboard
 * existant, sans nouvel écran principal.
 *
 * Le fil continue d'afficher tous les événements ; ce bandeau ne montre que
 * les alertes, c'est-à-dire les incidents rattachés à une organisation du
 * référentiel. Hiérarchie par sévérité, son optionnel et coupé par défaut.
 */

function ago(iso: string): string {
	const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
	if (seconds < 60) return `il y a ${seconds} s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `il y a ${minutes} min`;
	return `il y a ${Math.round(minutes / 60)} h`;
}

/** Bip court, sans fichier audio : deux oscillateurs, 120 ms, niveau bas. */
function beep(severity: number): void {
	try {
		const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return;
		const ctx = new Ctx();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.value = severity >= 5 ? 880 : 660;
		gain.gain.value = 0.04;
		osc.connect(gain).connect(ctx.destination);
		osc.start();
		osc.stop(ctx.currentTime + 0.12);
		osc.onended = () => void ctx.close();
	} catch {
		// Audio refusé par le navigateur : le visuel suffit.
	}
}

export default function LiveAlerts({
	alerts,
	unseen,
	soundOn,
	onToggleSound,
	onOpenAlerts,
	onDismiss,
}: {
	alerts: LiveAlert[];
	unseen: number;
	soundOn: boolean;
	onToggleSound: () => void;
	onOpenAlerts: () => void;
	onDismiss: () => void;
}) {
	const latest = alerts[0] ?? null;
	const lastBeeped = useRef<number | null>(null);

	useEffect(() => {
		if (!latest) return;
		// Premier rendu : on ne sonne pas pour une alerte déjà là.
		if (lastBeeped.current === null) {
			lastBeeped.current = latest.id;
			return;
		}
		if (latest.id !== lastBeeped.current) {
			lastBeeped.current = latest.id;
			if (soundOn && latest.severity >= 4) beep(latest.severity);
		}
	}, [latest, soundOn]);

	return (
		<div className="live-alerts" data-empty={latest === null}>
			{latest ? (
				<button type="button" className="live-alerts__hit" onClick={onOpenAlerts} data-level={latest.severity}>
					<span className="live-alerts__dot" aria-hidden="true" />
					<span className="live-alerts__sev">S{latest.severity}</span>
					<span className="live-alerts__title">{latest.title}</span>
					<span className="live-alerts__meta">
						{latest.org_id !== null ? `org #${latest.org_id}` : latest.rule_id} · {ago(latest.created_at)}
					</span>
					{unseen > 1 ? <span className="live-alerts__more">+{unseen - 1}</span> : null}
				</button>
			) : (
				<span className="live-alerts__idle" role="status" aria-live="polite">aucune alerte en direct pour l'instant</span>
			)}

			<div className="live-alerts__controls">
				<button
					type="button"
					className="live-alerts__ctl"
					aria-pressed={soundOn}
					onClick={onToggleSound}
					title="Son sur les alertes de sévérité 4 et 5"
				>
					{soundOn ? "son actif" : "son coupé"}
				</button>
				{latest ? (
					<button type="button" className="live-alerts__ctl" onClick={onDismiss} aria-label="Masquer le bandeau">
						×
					</button>
				) : null}
			</div>
		</div>
	);
}
