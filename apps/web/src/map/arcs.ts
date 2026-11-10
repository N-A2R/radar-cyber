/**
 * Arcs animés entre organisations et points d'hébergement/revendication.
 *
 * Types exportés : `FlowArc`, `ArcDatum`. Fonctions pures : `FAMILY_RGB`,
 * `buildArcData`, `greatCirclePath`, `createArcLayers`, `arcTooltip`.
 *
 * @example
 * ```ts
 * const data = buildArcData(flows);
 * const layers = createArcLayers(data, { time, showTrips: true });
 * ```
 */

import { ArcLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import type { Layer } from '@deck.gl/core'

/** Arc + timestamps relatifs, tel que consommé par `TripsLayer`. */
type TripDatum = ArcDatum & { timestamps: number[] }

export type FlowArc = {
  id: string
  from: { lat: number; lon: number; label: string }
  to: { lat: number; lon: number; label: string }
  family: string
  severity: number
  observedAt?: string | null
  title?: string
  sourceUrl?: string | null
}

export type ArcDatum = {
  id: string
  from: [number, number]
  to: [number, number]
  family: string
  severity: number
  color: [number, number, number, number]
  targetColor: [number, number, number, number]
  width: number
  path: [number, number][]
  observedAt: number | null
  title?: string
  sourceUrl?: string | null
  fromLabel: string
  toLabel: string
}

export const FAMILY_RGB: Record<string, [number, number, number]> = {
  ransomware: [239, 68, 68],
  vuln: [249, 115, 22],
  phishing: [234, 179, 8],
  malware: [236, 72, 153],
  cert: [34, 211, 238],
  cert_fr: [103, 232, 249],
  typosquat: [168, 85, 247],
  reputation: [34, 197, 94],
  cti: [59, 130, 246],
  presse: [156, 163, 175],
}

function rgb(family: string): [number, number, number] {
  return FAMILY_RGB[family] ?? [200, 200, 200]
}

function alphaFor(severity: number): number {
  const s = Math.max(0, Math.min(10, severity))
  return Math.round(80 + (s / 10) * 175)
}

function widthFor(severity: number): number {
  const s = Math.max(0, Math.min(10, severity))
  return 1 + (s / 10) * 4
}

function toMs(observedAt?: string | null): number | null {
  if (!observedAt) return null
  const t = Date.parse(observedAt)
  return Number.isFinite(t) ? t : null
}

export function greatCirclePath(
  from: [number, number] | { lat: number; lon: number },
  to: [number, number] | { lat: number; lon: number },
  steps = 64,
): [number, number][] {
  const fLon = Array.isArray(from) ? from[0] : from.lon
  const fLat = Array.isArray(from) ? from[1] : from.lat
  const tLon = Array.isArray(to) ? to[0] : to.lon
  const tLat = Array.isArray(to) ? to[1] : to.lat

  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI

  const φ1 = toRad(fLat)
  const λ1 = toRad(fLon)
  const φ2 = toRad(tLat)
  const λ2 = toRad(tLon)

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((φ2 - φ1) / 2) ** 2 +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
      ),
    )

  const pts: [number, number][] = []
  if (d === 0) {
    pts.push([fLon, fLat])
    return pts
  }
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2)
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2)
    const z = A * Math.sin(φ1) + B * Math.sin(φ2)
    const φ = Math.atan2(z, Math.sqrt(x * x + y * y))
    const λ = Math.atan2(y, x)
    pts.push([toDeg(λ), toDeg(φ)])
  }
  return pts
}

export function buildArcData(flows: FlowArc[]): ArcDatum[] {
  return flows.map((f) => {
    const c = rgb(f.family)
    const a = alphaFor(f.severity)
    const [flon, flat] = [f.from.lon, f.from.lat]
    const [tlon, tlat] = [f.to.lon, f.to.lat]
    return {
      id: f.id,
      from: [flon, flat],
      to: [tlon, tlat],
      family: f.family,
      severity: f.severity,
      color: [c[0], c[1], c[2], a],
      targetColor: [c[0], c[1], c[2], a],
      width: widthFor(f.severity),
      path: greatCirclePath(f.from, f.to, 64),
      observedAt: toMs(f.observedAt),
      title: f.title,
      sourceUrl: f.sourceUrl ?? null,
      fromLabel: f.from.label,
      toLabel: f.to.label,
    }
  })
}

export function createArcLayers(
  data: ArcDatum[],
  opts: { timeMs: number; showTrips: boolean; opacity?: number; pickable?: boolean },
): any[] {
  const opacity = opts.opacity ?? 1
  const pickable = opts.pickable ?? true
  const layers: Layer[] = [
    new ArcLayer({
      id: 'radar-arcs',
      data,
      pickable,
      opacity,
      getSourcePosition: (d: ArcDatum) => d.from,
      getTargetPosition: (d: ArcDatum) => d.to,
      getSourceColor: (d: ArcDatum) => d.color,
      getTargetColor: (d: ArcDatum) => d.targetColor,
      getWidth: (d: ArcDatum) => d.width,
      greatCircle: true,
    }),
  ]

  if (opts.showTrips && data.length > 0) {
    // TripsLayer joue un point qui parcourt l'arc. Les timestamps sont
    // relatifs (0 → DURATION) et currentTime tourne dans la même fenêtre,
    // sinon le point n'est jamais dans l'intervalle et rien ne s'affiche.
    const DURATION = 60_000
    layers.push(
      new TripsLayer({
        id: 'radar-arcs-trips',
        data: data.map((d, i) => ({
          ...d,
          timestamps: [0, DURATION],
          offset: i,
        })),
        getPath: (d: TripDatum) => d.path,
        getTimestamps: (d: TripDatum) => d.timestamps,
        getColor: (d: ArcDatum) => d.color,
        getWidth: (d: ArcDatum) => Math.max(d.width, 1.5),
        trailLength: 20_000,
        currentTime: opts.timeMs % DURATION,
        fadeTrail: true,
        opacity,
      }),
    )
  }
  return layers
}

export function arcTooltip(info: any): { text: string; style?: object } | null {
  if (!info || !info.object) return null
  const d = info.object as ArcDatum
  const date = d.observedAt ? new Date(d.observedAt).toLocaleString() : ''
  const lines = [
    d.title || d.id,
    `${d.family} · sévérité ${d.severity}`,
    `${d.fromLabel} → ${d.toLabel}`,
    date,
  ].filter(Boolean)
  const style = { background: 'rgba(10,10,20,0.9)', color: '#fff', padding: '8px', borderRadius: '6px', fontSize: '12px' }
  return { text: lines.join('\n'), style }
}
