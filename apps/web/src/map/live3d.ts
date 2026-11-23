/**
 * Couche WebGL2 des attaques en cours, partagée par la carte 3D et le banc de
 * mesure. Un seul draw call par image : la géométrie est téléversée quand le
 * flux change, l'animation est calculée dans le shader à partir de l'horloge.
 *
 * Aucune dépendance d'exécution : ce module est transpilé tel quel dans le
 * navigateur de mesure de cadence.
 */

export type LiveAttack = {
  id: string;
  family: string;
  assertionType: string;
  severity: number;
  observedAt: string;
  lat: number;
  lon: number;
  orgId: number | null;
  sourceId: string;
  dept: string | null;
};

export const LIVE_FAMILY_COLORS: Record<string, [number, number, number]> = {
  ransomware: [0.98, 0.32, 0.32],
  leaks: [0.99, 0.66, 0.2],
  malware: [0.8, 0.4, 0.95],
  phishing: [0.24, 0.75, 0.95],
  cti: [0.24, 0.86, 0.85],
  cert: [0.45, 0.68, 1],
  cert_fr: [0.45, 0.68, 1],
  paste: [0.95, 0.5, 0.7],
  vuln: [0.65, 0.75, 0.4],
};
const FALLBACK_COLOR: [number, number, number] = [0.78, 0.82, 0.88];

/** Projection Web Mercator, identique à celle de MapLibre (monde = 1). */
export function mercator(lon: number, lat: number): [number, number] {
  const x = (lon + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
}

/** Phase stable par identifiant : deux rafraîchissements ne font pas sauter l'écran. */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 628) / 100;
}

/** 8 floats par attaque : x, y, hauteur, r, g, b, taille, phase. */
export function packAttacks(attacks: readonly LiveAttack[]): Float32Array {
  const out = new Float32Array(attacks.length * 8);
  for (let i = 0; i < attacks.length; i++) {
    const a = attacks[i]!;
    const [x, y] = mercator(a.lon, a.lat);
    const [r, g, b] = LIVE_FAMILY_COLORS[a.family] ?? FALLBACK_COLOR;
    const o = i * 8;
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = 0.00008 * a.severity;
    out[o + 3] = r;
    out[o + 4] = g;
    out[o + 5] = b;
    out[o + 6] = 14 + a.severity * 6;
    out[o + 7] = phaseOf(a.id);
  }
  return out;
}

const VERTEX_SHADER = `#version 300 es
in vec3 a_pos;
in vec3 a_color;
in vec2 a_meta;
uniform mat4 u_matrix;
uniform float u_time;
out vec4 v_color;
void main() {
  float wave = sin(u_time + a_meta.y);
  vec3 pos = vec3(a_pos.x, a_pos.y + a_pos.z * (0.5 + 0.5 * wave), a_pos.z);
  gl_Position = u_matrix * vec4(pos, 1.0);
  gl_PointSize = a_meta.x * (1.0 + 0.25 * wave);
  v_color = vec4(a_color, 0.62 + 0.38 * (0.5 + 0.5 * wave));
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float a = smoothstep(1.0, 0.0, d) * v_color.a;
  outColor = vec4(v_color.rgb * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("cannot create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader failed: ${log}`);
  }
  return shader;
}

/** Rendu d'un lot d'attaques : une mise à jour de buffer, un draw call par image. */
export class LiveAttackRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly uMatrix: WebGLUniformLocation | null;
  private readonly uTime: WebGLUniformLocation | null;
  private count = 0;
  frames = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("cannot create WebGL program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`WebGL program failed: ${log}`);
    }
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("cannot create WebGL buffer");
    this.program = program;
    this.buffer = buffer;
    this.uMatrix = gl.getUniformLocation(program, "u_matrix");
    this.uTime = gl.getUniformLocation(program, "u_time");
  }

  setAttacks(attacks: readonly LiveAttack[]): void {
    this.count = attacks.length;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, packAttacks(attacks), this.gl.STATIC_DRAW);
  }

  get attackCount(): number {
    return this.count;
  }

  draw(matrix: ArrayLike<number>, timeMs: number): void {
    const gl = this.gl;
    if (gl.isContextLost() || this.count === 0) return;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const stride = 8 * 4;
    const pos = gl.getAttribLocation(this.program, "a_pos");
    const color = gl.getAttribLocation(this.program, "a_color");
    const meta = gl.getAttribLocation(this.program, "a_meta");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(meta);
    gl.vertexAttribPointer(meta, 2, gl.FLOAT, false, stride, 6 * 4);
    gl.uniformMatrix4fv(this.uMatrix, false, matrix as Float32List);
    gl.uniform1f(this.uTime, timeMs / 1000);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, this.count);
    this.frames++;
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}

type RenderInput = { defaultProjectionData: { mainMatrix: number[] | Float32Array } };

/** Couche MapLibre : le matrix de projection de la carte pilote le shader. */
export class LiveAttackLayer {
  id = "live-attacks";
  type = "custom" as const;
  renderingMode = "3d" as const;
  frames = 0;
  private renderer: LiveAttackRenderer | null = null;
  private pending: LiveAttack[] = [];
  private map: unknown = null;

  onAdd(_map: unknown, gl: WebGL2RenderingContext): void {
    this.renderer = new LiveAttackRenderer(gl);
    this.renderer.setAttacks(this.pending);
  }

  render(gl: WebGL2RenderingContext, options: RenderInput): void {
    if (!this.renderer) return;
    this.renderer.draw(options.defaultProjectionData.mainMatrix, performance.now());
    this.frames = this.renderer.frames;
    void gl;
  }

  onRemove(): void {
    this.renderer?.dispose();
    this.renderer = null;
  }

  setAttacks(attacks: LiveAttack[]): void {
    this.pending = attacks;
    this.renderer?.setAttacks(attacks);
  }
}

/** File de données : instantané puis ajouts SSE, sans doublon ni texte libre. */
export function mergeAttacks(previous: readonly LiveAttack[], incoming: readonly LiveAttack[]): LiveAttack[] {
  const byId = new Map<string, LiveAttack>();
  for (const a of [...previous, ...incoming]) {
    if (!a || typeof a.id !== "string") continue;
    const current = byId.get(a.id);
    if (!current || String(a.observedAt) > String(current.observedAt)) byId.set(a.id, a);
  }
  return [...byId.values()]
    .sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)))
    .slice(0, 500);
}

export function normalizeAttack(raw: Record<string, unknown>): LiveAttack | null {
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 43 || lat > 46.9 || lon < -1.9 || lon > 2.0) return null;
  const id = String(raw.id ?? "");
  if (!id) return null;
  return {
    id,
    family: String(raw.family ?? "unknown"),
    assertionType: String(raw.assertionType ?? "unknown"),
    severity: Math.min(5, Math.max(1, Number(raw.severity) || 1)),
    observedAt: String(raw.observedAt ?? ""),
    lat, lon,
    orgId: raw.orgId == null ? null : Number(raw.orgId),
    sourceId: String(raw.sourceId ?? ""),
    dept: raw.dept == null ? null : String(raw.dept),
  };
}

export async function fetchLiveAttacks(url: string): Promise<LiveAttack[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`live map snapshot: HTTP ${res.status}`);
  const body = await res.json() as { attacks?: unknown };
  if (!Array.isArray(body.attacks)) throw new Error("live map snapshot: invalid payload");
  return mergeAttacks([], body.attacks.map((a) => normalizeAttack(a as Record<string, unknown>)).filter((a): a is LiveAttack => a !== null));
}

/** Retourne une fonction de fermeture, même si EventSource est absent (SSR). */
export function connectAttackStream(url: string, onAttack: (attack: LiveAttack) => void): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const source = new EventSource(url);
  source.addEventListener("attack", (raw) => {
    try {
      const attack = normalizeAttack(JSON.parse((raw as MessageEvent).data) as Record<string, unknown>);
      if (attack) onAttack(attack);
    } catch {
      // Trame invalide : le flux continue, une attaque mal formée ne tue pas la carte.
    }
  });
  return () => source.close();
}
