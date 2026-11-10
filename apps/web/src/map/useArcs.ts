import { useEffect, useRef, useState } from 'react'
import type { FlowArc } from './arcs.js'

export function useArcAnimation(opts?: { enabled?: boolean; speed?: number }): number {
  const enabled = opts?.enabled ?? true
  const speed = opts?.speed ?? 1
  const [time, setTime] = useState<number>(() => Date.now())
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number>(Date.now())
  const baseRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!enabled) return
    const SIX_H = 6 * 3600 * 1000
    const REAL_CYCLE = 30 * 1000
    let cancelled = false

    const tick = (now: number) => {
      if (cancelled) return
      if (document.hidden) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const elapsed = now - startRef.current
      const virtual = (elapsed * (SIX_H / REAL_CYCLE)) * speed
      setTime(baseRef.current + (virtual % SIX_H))
      rafRef.current = requestAnimationFrame(tick)
    }
    startRef.current = performance.now()
    baseRef.current = Date.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled, speed])

  return time
}

export function useLiveArcs(opts: { streamUrl?: string; initial: FlowArc[]; ttlMs?: number }): FlowArc[] {
  const ttlMs = opts.ttlMs ?? 10 * 60 * 1000
  const [arcs, setArcs] = useState<FlowArc[]>(() => [...opts.initial])

  useEffect(() => {
    setArcs([...opts.initial])
  }, [opts.initial])

  useEffect(() => {
    if (!opts.streamUrl) return
    let es: EventSource | null = null
    try {
      es = new EventSource(opts.streamUrl)
    } catch {
      return
    }
    const handler = (e: MessageEvent) => {
      let payload: any
      try {
        payload = JSON.parse(e.data)
      } catch {
        return
      }
      if (!payload || (payload.lat == null && payload.lon == null)) {
        // need lat/lon to build arc; skip if absent
      }
      const lat = payload.lat ?? payload.latitude
      const lon = payload.lon ?? payload.longitude
      if (lat == null || lon == null) return
      const arc: FlowArc = {
        id: String(payload.id ?? `live-${Date.now()}`),
        from: { lat: Number(lat), lon: Number(lon), label: payload.title ?? 'event' },
        to: { lat: Number(lat), lon: Number(lon), label: payload.title ?? 'event' },
        family: String(payload.family ?? 'cti'),
        severity: Number(payload.severity ?? 5),
        observedAt: payload.observed_at ?? payload.observedAt ?? new Date().toISOString(),
        title: payload.title,
        sourceUrl: payload.source_url ?? payload.sourceUrl ?? null,
      }
      setArcs((prev) => {
        const now = Date.now()
        const filtered = prev.filter((a) => {
          const t = a.observedAt ? Date.parse(a.observedAt) : now
          return now - t < ttlMs
        })
        const next = [arc, ...filtered]
        return next.slice(0, 400)
      })
    }
    es.addEventListener('new', handler as any)
    const interval = setInterval(() => {
      setArcs((prev) => {
        const now = Date.now()
        return prev.filter((a) => {
          const t = a.observedAt ? Date.parse(a.observedAt) : now
          return now - t < ttlMs
        })
      })
    }, 30000)
    return () => {
      es?.removeEventListener('new', handler as any)
      es?.close()
      clearInterval(interval)
    }
  }, [opts.streamUrl, ttlMs])

  return arcs
}
