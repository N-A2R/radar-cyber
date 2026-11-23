// @vitest-environment jsdom
/**
 * Live 3D layer — one test per behavior: whitelist projection, NA filter,
 * stream merge, and one GPU draw call per frame without re-uploading geometry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectAttackStream,
  fetchLiveAttacks,
  LiveAttackRenderer,
  mergeAttacks,
  normalizeAttack,
  packAttacks,
  type LiveAttack,
} from "../src/map/live3d";

function attack(id: string, observedAt = "2026-11-22T10:00:00Z"): LiveAttack {
  return {
    id, family: "ransomware", assertionType: "third_party_claim", severity: 4,
    observedAt, lat: 44.84, lon: -0.58, orgId: 7, sourceId: "gray-source", dept: "33",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("live attack feed", () => {
  it("projects only whitelisted fields and drops out-of-region coordinates", () => {
    const clean = normalizeAttack({
      ...attack("1"), title: "Victim Jean Dupont", summary: "private", sourceUrl: "https://x/y",
    });
    expect(clean).toEqual(attack("1"));
    expect(clean).not.toHaveProperty("title");
    expect(clean).not.toHaveProperty("summary");
    expect(normalizeAttack({ ...attack("2"), lat: 48.85, lon: 2.35 })).toBeNull();
    expect(normalizeAttack({ ...attack("3"), lat: Number.NaN })).toBeNull();
  });

  it("merges a snapshot and SSE additions without duplicates, newest first", () => {
    const merged = mergeAttacks([attack("old", "2026-11-21T10:00:00Z")], [
      attack("new", "2026-11-22T10:00:00Z"),
      attack("old", "2026-11-22T09:00:00Z"),
    ]);
    expect(merged.map((a) => a.id)).toEqual(["new", "old"]);
    expect(merged[0]!.observedAt).toBe("2026-11-22T10:00:00Z");
  });

  it("loads a snapshot through fetch and rejects a malformed payload", async () => {
    const ok = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ attacks: [{ ...attack("a"), title: "must be dropped" }] }),
    });
    vi.stubGlobal("fetch", ok);
    expect((await fetchLiveAttacks("/api/live-map")).map((a) => a.id)).toEqual(["a"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ attacks: "no" }) }));
    await expect(fetchLiveAttacks("/api/live-map")).rejects.toThrow(/invalid payload/);
  });

  it("accepts an SSE attack frame and ignores a broken one", () => {
    const listeners = new Map<string, (raw: MessageEvent) => void>();
    class FakeSource {
      static last: FakeSource | null = null;
      closed = false;
      constructor(public url: string) { FakeSource.last = this; }
      addEventListener(type: string, cb: (raw: MessageEvent) => void) { listeners.set(type, cb); }
      close() { this.closed = true; }
    }
    vi.stubGlobal("EventSource", FakeSource);
    const seen: LiveAttack[] = [];
    const close = connectAttackStream("/api/live-map/stream", (a) => seen.push(a));
    listeners.get("attack")?.({ data: JSON.stringify(attack("s1")) } as MessageEvent);
    listeners.get("attack")?.({ data: "{not json" } as MessageEvent);
    expect(seen.map((a) => a.id)).toEqual(["s1"]);
    close();
    expect(FakeSource.last?.closed).toBe(true);
  });
});

describe("live 3D renderer", () => {
  it("packs eight GPU floats per attack with a stable phase", () => {
    const data = packAttacks([attack("same"), attack("same"), attack("other")]);
    expect(data).toHaveLength(24);
    expect(Array.from(data.slice(0, 8))).toEqual(Array.from(data.slice(8, 16)));
    expect(data[0]).toBeGreaterThan(0);
    expect(data[0]).toBeLessThan(1);
  });

  it("issues exactly one draw call per frame and uploads geometry only on change", () => {
    const gl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
      ARRAY_BUFFER: 5, FLOAT: 6, POINTS: 7, SRC_ALPHA: 8, ONE_MINUS_SRC_ALPHA: 9, ONE: 10,
      draws: 0, uploads: 0,
      createShader: () => ({}), shaderSource: () => {}, compileShader: () => {},
      getShaderParameter: () => true, getShaderInfoLog: () => "", deleteShader: () => {},
      createProgram: () => ({}), attachShader: () => {}, linkProgram: () => {},
      getProgramParameter: () => true, getProgramInfoLog: () => "", deleteProgram: () => {},
      useProgram: () => {},
      createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => { gl.uploads++; },
      getUniformLocation: () => ({}), getAttribLocation: () => 0, enableVertexAttribArray: () => {},
      vertexAttribPointer: () => {}, uniformMatrix4fv: () => {}, uniform1f: () => {},
      blendFuncSeparate: () => {}, drawArrays: () => { gl.draws++; },
      isContextLost: () => false, deleteBuffer: () => {},
    };
    const renderer = new LiveAttackRenderer(gl as unknown as WebGL2RenderingContext);
    renderer.setAttacks([attack("a"), attack("b")]);
    const uploadsAfterSet = gl.uploads;
    const matrix = new Float32Array(16);
    renderer.draw(matrix, 1000);
    renderer.draw(matrix, 1016);
    renderer.draw(matrix, 1032);
    expect(gl.draws).toBe(3);
    expect(gl.uploads).toBe(uploadsAfterSet);
    expect(renderer.frames).toBe(3);
  });
});
