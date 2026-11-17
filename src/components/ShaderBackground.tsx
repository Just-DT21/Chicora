import { useEffect, useRef, useState } from 'react'

const VERT = `attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAG = `precision highp float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * noise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 1.45;
  float t = uTime * 0.032;
  p += 0.32 * vec2(fbm(p * 1.35 + t), fbm(p * 1.35 - t));
  float n = fbm(p * 2.15 + vec2(t * 0.7, -t * 0.5));
  float ribbons = fbm(p * 3.1 - t * 0.4);

  vec3 cream = vec3(1.0, 0.976, 0.937);
  vec3 sand = vec3(0.961, 0.921, 0.867);
  vec3 amber = vec3(0.914, 0.635, 0.231);
  vec3 clay = vec3(0.945, 0.741, 0.522);

  vec3 col = mix(cream, sand, smoothstep(0.2, 0.9, n));
  col = mix(col, clay, smoothstep(0.48, 1.0, ribbons) * 0.22);
  col = mix(col, amber, smoothstep(0.72, 1.0, n) * 0.13);

  float d = distance(uv * vec2(1.0, 1.15), vec2(0.5, 0.4));
  col = mix(col, cream, smoothstep(0.28, 1.05, d) * 0.55);

  gl_FragColor = vec4(col, 1.0);
}`

/**
 * Ambient amber shader, adapted from the 21st.dev shader study into CHICORA's
 * warm-white / amber palette. It is intentionally low-contrast so products and
 * type stay dominant, renders at reduced resolution, pauses when hidden, and
 * falls back to a static gradient on small screens, reduced motion or no WebGL.
 */
export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setEnabled(media.matches && !reduced.matches)
    update()
    media.addEventListener('change', update)
    reduced.addEventListener('change', update)
    return () => {
      media.removeEventListener('change', update)
      reduced.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: true, powerPreference: 'low-power' })
    if (!gl) return

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('[chicora] shader compile failed', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[chicora] shader link failed', gl.getProgramInfoLog(program))
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, 'uRes')
    const uTime = gl.getUniformLocation(program, 'uTime')
    let raf = 0
    let start = performance.now()
    let paused = false

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      const scale = 0.62
      const width = Math.max(320, Math.floor(window.innerWidth * dpr * scale))
      const height = Math.max(320, Math.floor(window.innerHeight * dpr * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    const render = () => {
      if (paused) return
      resize()
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, (performance.now() - start) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(render)
    }

    const onVisibility = () => {
      paused = document.hidden
      if (!paused) {
        start = performance.now()
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(render)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(render)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      cancelAnimationFrame(raf)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [enabled])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,#FFF9EF_0%,#F8EEDF_38%,#F3E3CB_72%,#EEDCC2_100%)]" />
      {enabled && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full opacity-70 mix-blend-soft-light"
          style={{ filter: 'saturate(1.08)' }}
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(255,249,239,0.55)_100%)]" />
    </div>
  )
}
