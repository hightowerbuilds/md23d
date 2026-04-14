import { onMount, onCleanup, createSignal, Show } from 'solid-js'
import * as THREE from 'three'
// @ts-ignore
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
// @ts-ignore
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { BlogDocument, BlogBlock } from '../lib/blog/types'
import { loadUMLFont, buildUML3D } from '../lib/uml'

// ── constants ────────────────────────────────────────────────────

const HEADING_SIZE = 0.28
const HEADING_SPACING = 0.20
const BODY_SIZE = 0.14
const BODY_SPACING = 0.105
const CODE_SIZE = 0.11
const CODE_SPACING = 0.085
const DEPTH = 0.03
const LINE_GAP = 0.26
const CODE_LINE_GAP = 0.20
const LINE_Z_STEP = 0.06
const WRAP_CHARS = 55
const CODE_WRAP_CHARS = 70
const CURVES = 3

const COL = {
  heading: 0xeaf4ff,
  headingAccent: 0x78daff,
  body: 0xc0d8ee,
  bodySoft: 0x6a8aaa,
  code: 0xa8e6cf,
  codeFrame: 0x2a5a4a,
  quote: 0xf0c674,
  quoteMark: 0x7a6432,
  listBullet: 0x78daff,
  accent: 0x78daff,
}

// ── geometry cache (reuse per char+size) ──────────────────────────

const geoCache = new Map<string, THREE.BufferGeometry | null>()

function charGeo(char: string, font: any, size: number): THREE.BufferGeometry | null {
  const key = `${char}|${size}`
  if (geoCache.has(key)) return geoCache.get(key)!

  try {
    const g = new TextGeometry(char, {
      font,
      size,
      depth: DEPTH,
      curveSegments: CURVES,
      bevelEnabled: false,
    })
    g.computeBoundingBox()
    g.center()
    geoCache.set(key, g)
    return g
  } catch {
    geoCache.set(key, null)
    return null
  }
}

// ── character mesh ───────────────────────────────────────────────

function charMesh(char: string, font: any, size: number, color: number): THREE.Mesh | null {
  const geo = charGeo(char, font, size)
  if (!geo) return null

  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.3,
    roughness: 0.6,
    emissive: color,
    emissiveIntensity: 0.12,
  })
  return new THREE.Mesh(geo, mat)
}

// ── line of 3D characters ────────────────────────────────────────

function makeLine(
  text: string,
  font: any,
  size: number,
  spacing: number,
  color: number,
): THREE.Group {
  const g = new THREE.Group()
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue
    const m = charMesh(text[i], font, size, color)
    if (m) {
      m.position.x = i * spacing
      g.add(m)
    }
  }
  return g
}

// ── word wrap ────────────────────────────────────────────────────

function wrap(text: string, max: number): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    if (!raw.trim()) { out.push(''); continue }
    let line = ''
    for (const word of raw.split(/\s+/)) {
      if (!word) continue
      const test = line ? line + ' ' + word : word
      if (test.length > max && line) {
        out.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) out.push(line)
  }
  return out.length ? out : ['']
}

// ── accent bar ───────────────────────────────────────────────────

function accentBar(width: number, color = COL.accent): THREE.Mesh {
  const g = new THREE.BoxGeometry(width, 0.03, DEPTH)
  const m = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.25,
  })
  return new THREE.Mesh(g, m)
}

// ── wireframe box ────────────────────────────────────────────────

function wireBox(w: number, h: number, d: number, color: number): THREE.Group {
  const g = new THREE.Group()
  const box = new THREE.BoxGeometry(w, h, d)
  g.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 }),
  ))
  g.add(new THREE.Mesh(box, new THREE.MeshStandardMaterial({
    color, transparent: true, opacity: 0.04, side: THREE.DoubleSide,
  })))
  return g
}

// ── block builders ───────────────────────────────────────────────

function buildHeading(block: BlogBlock, font: any): THREE.Group {
  const g = new THREE.Group()
  const lines = wrap(block.text, 32)

  // Label
  const label = makeLine(block.label.toUpperCase(), font, 0.06, 0.05, COL.bodySoft)
  label.position.y = 0.25
  g.add(label)

  // Accent bar
  const bar = accentBar(lines[0].length * HEADING_SPACING * 0.5)
  bar.position.y = 0.40
  g.add(bar)

  // Title lines
  for (let i = 0; i < lines.length; i++) {
    const line = makeLine(lines[i], font, HEADING_SIZE, HEADING_SPACING, COL.heading)
    line.position.y = -i * 0.42
    line.position.z = i * LINE_Z_STEP
    g.add(line)
  }

  return g
}

function buildParagraph(block: BlogBlock, font: any): THREE.Group {
  const g = new THREE.Group()
  const lines = wrap(block.text, WRAP_CHARS)

  // Label
  const label = makeLine(block.label.toUpperCase(), font, 0.05, 0.042, COL.bodySoft)
  label.position.y = 0.16
  g.add(label)

  // Body lines — each line steps forward in Z
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const line = makeLine(lines[i], font, BODY_SIZE, BODY_SPACING, COL.body)
    line.position.y = -i * LINE_GAP
    line.position.z = i * LINE_Z_STEP
    g.add(line)
  }

  return g
}

function buildCode(block: BlogBlock, font: any): THREE.Group {
  const g = new THREE.Group()
  const rawLines = block.text.split('\n')
  const lines = rawLines.map(l =>
    l.length > CODE_WRAP_CHARS ? l.slice(0, CODE_WRAP_CHARS) + '...' : l
  )

  // Label
  const lang = (block.language || 'CODE').toUpperCase()
  const label = makeLine(lang, font, 0.05, 0.042, COL.code)
  label.position.y = 0.18
  g.add(label)

  // Accent bar
  const bar = accentBar(lang.length * 0.042 * 2, COL.code)
  bar.position.y = 0.10
  g.add(bar)

  // Code lines
  const codeGroup = new THREE.Group()
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue
    const line = makeLine(lines[i], font, CODE_SIZE, CODE_SPACING, COL.code)
    line.position.y = -i * CODE_LINE_GAP
    line.position.z = i * LINE_Z_STEP
    codeGroup.add(line)
  }
  g.add(codeGroup)

  // Wireframe enclosure
  const maxLen = Math.max(...lines.map(l => l.length), 1)
  const boxW = maxLen * CODE_SPACING + 0.4
  const boxH = lines.length * CODE_LINE_GAP + 0.3
  const boxD = lines.length * LINE_Z_STEP + DEPTH * 3
  const frame = wireBox(boxW, boxH, boxD, COL.codeFrame)
  frame.position.x = boxW / 2 - 0.2
  frame.position.y = -(lines.length * CODE_LINE_GAP) / 2 + 0.05
  frame.position.z = (lines.length * LINE_Z_STEP) / 2
  g.add(frame)

  return g
}

function buildQuote(block: BlogBlock, font: any): THREE.Group {
  const g = new THREE.Group()
  const lines = wrap(block.text, WRAP_CHARS - 4)

  // Quote mark
  const qm = charMesh('"', font, 0.4, COL.quoteMark)
  if (qm) {
    qm.position.set(-0.3, 0.1, 0)
    g.add(qm)
  }

  // Vertical bar
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, lines.length * LINE_GAP + 0.2, DEPTH),
    new THREE.MeshStandardMaterial({ color: COL.quote, emissive: COL.quote, emissiveIntensity: 0.2 }),
  )
  bar.position.set(-0.15, -(lines.length * LINE_GAP) / 2, 0)
  g.add(bar)

  // Text
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const line = makeLine(lines[i], font, BODY_SIZE, BODY_SPACING, COL.quote)
    line.position.x = 0.1
    line.position.y = -i * LINE_GAP
    line.position.z = i * LINE_Z_STEP
    g.add(line)
  }

  return g
}

function buildList(block: BlogBlock, font: any): THREE.Group {
  const g = new THREE.Group()
  const items = block.items ?? block.text.split('\n')

  // Label
  const label = makeLine(block.label.toUpperCase(), font, 0.05, 0.042, COL.bodySoft)
  label.position.y = 0.16
  g.add(label)

  for (let i = 0; i < items.length; i++) {
    const text = items[i].replace(/^[-*•]\s*/, '')
    if (!text.trim()) continue

    // Bullet
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 4),
      new THREE.MeshStandardMaterial({ color: COL.listBullet, emissive: COL.listBullet, emissiveIntensity: 0.3 }),
    )
    bullet.position.set(-0.1, -i * LINE_GAP * 1.1, i * LINE_Z_STEP)
    g.add(bullet)

    // Text
    const line = makeLine(text, font, BODY_SIZE, BODY_SPACING, COL.body)
    line.position.set(0.05, -i * LINE_GAP * 1.1, i * LINE_Z_STEP)
    g.add(line)
  }

  return g
}

// ── block dispatch ───────────────────────────────────────────────

function build3DBlock(block: BlogBlock, font: any): THREE.Group {
  try {
    switch (block.kind) {
      case 'heading':
        return buildHeading(block, font)
      case 'paragraph':
        return buildParagraph(block, font)
      case 'code':
      case 'diagram':
      case 'table':
      case 'formula':
        return buildCode(block, font)
      case 'quote':
        return buildQuote(block, font)
      case 'list':
        return buildList(block, font)
      default:
        return buildParagraph(block, font)
    }
  } catch (e) {
    console.warn('Block build failed:', block.id, e)
    // Return a tiny marker so we know something was here
    const g = new THREE.Group()
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.05, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xff4444 }),
    ))
    return g
  }
}

// ── component ────────────────────────────────────────────────────

interface Props {
  documentModel: BlogDocument
}

export default function BlueprintScene(props: Props) {
  let hostRef: HTMLDivElement | undefined
  let renderer: THREE.WebGLRenderer | undefined
  let controls: OrbitControls | undefined
  let frameId = 0
  const disposables: (() => void)[] = []

  const [progress, setProgress] = createSignal(0)
  const [status, setStatus] = createSignal('Initializing...')
  const [loading, setLoading] = createSignal(true)

  onCleanup(() => {
    if (frameId) cancelAnimationFrame(frameId)
    for (const d of disposables) d()
    controls?.dispose()
    if (renderer) {
      renderer.dispose()
      renderer.domElement.remove()
    }
  })

  onMount(async () => {
    if (!hostRef) return
    const w = hostRef.clientWidth || 800
    const h = hostRef.clientHeight || 600

    // Renderer
    const r = new THREE.WebGLRenderer({ antialias: true })
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    r.setSize(w, h)
    r.setClearColor(0x030914)
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    hostRef.appendChild(r.domElement)
    renderer = r

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030914, 0.008)

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 300)
    camera.position.set(0, 0, 14)

    const ctrl = new OrbitControls(camera, r.domElement)
    ctrl.enableDamping = true
    ctrl.dampingFactor = 0.08
    ctrl.maxDistance = 150
    controls = ctrl

    // Lights
    scene.add(new THREE.HemisphereLight(0xd4eeff, 0x06080d, 1.4))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
    keyLight.position.set(5, 8, 5)
    scene.add(keyLight)
    const fillLight = new THREE.PointLight(0x69ceff, 15, 40)
    fillLight.position.set(-5, 3, 4)
    scene.add(fillLight)

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const sv = new Float32Array(1200 * 3)
    for (let i = 0; i < 1200; i++) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const rad = 40 + Math.random() * 60
      sv[i * 3] = rad * Math.sin(ph) * Math.cos(th)
      sv[i * 3 + 1] = rad * Math.sin(ph) * Math.sin(th)
      sv[i * 3 + 2] = rad * Math.cos(ph)
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sv, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xc8e8ff, size: 0.15, sizeAttenuation: true, transparent: true, opacity: 0.7,
    })))

    // Resize
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const rw = Math.max(320, entry.contentRect.width)
      const rh = Math.max(360, entry.contentRect.height)
      r.setSize(rw, rh, false)
      camera.aspect = rw / rh
      camera.updateProjectionMatrix()
    })
    ro.observe(hostRef)
    disposables.push(() => ro.disconnect())

    // Start render loop
    const blockEntries: { group: THREE.Group; block: BlogBlock; isUML: boolean }[] = []

    const renderLoop = () => {
      frameId = requestAnimationFrame(renderLoop)
      ctrl.update()

      const t = performance.now() * 0.001
      for (let i = 0; i < blockEntries.length; i++) {
        const { group, isUML } = blockEntries[i]
        group.userData._bY = group.userData._bY ?? group.position.y
        group.position.y = group.userData._bY + Math.sin(t * 0.2 + i * 0.4) * 0.025

        if (isUML) group.quaternion.copy(camera.quaternion)
      }

      r.render(scene, camera)
    }
    renderLoop()

    // ── build all blocks as 3D ─────────────────────────────────
    const blocks = props.documentModel.blocks
    const root = new THREE.Group()
    let cursorY = 0
    let lastSection = -1

    setStatus('Loading font...')
    setProgress(5)

    let font: any = null
    try {
      font = await loadUMLFont()
    } catch (e) {
      console.error('Font load failed:', e)
      setStatus('Font load failed')
      setLoading(false)
      return
    }

    setProgress(10)

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      setStatus(`Block ${i + 1} / ${blocks.length}`)
      setProgress(10 + Math.round((i / blocks.length) * 85))

      if (i % 2 === 0) {
        await new Promise<void>(res => requestAnimationFrame(() => res()))
      }

      // Section gap
      if (block.sectionIndex !== undefined && block.sectionIndex !== lastSection) {
        if (lastSection >= 0) cursorY -= 1.0
        lastSection = block.sectionIndex
      }

      let group: THREE.Group
      let isUML = false

      // Mermaid → full 3D graph
      if (
        block.kind === 'diagram' &&
        block.language?.trim().toLowerCase() === 'mermaid' &&
        /^(graph|flowchart)\s/i.test(block.text.trim())
      ) {
        try {
          const uml = buildUML3D(block.text, font)
          group = uml.group
          const box = new THREE.Box3().setFromObject(group)
          const sz = box.getSize(new THREE.Vector3())
          const scale = 5 / Math.max(sz.x, sz.y, 1)
          group.scale.setScalar(scale * 0.75)
          isUML = true
          disposables.push(uml.dispose)
        } catch {
          group = build3DBlock(block, font)
        }
      } else {
        // Everything else → 3D text meshes
        group = build3DBlock(block, font)
      }

      // Layout: stagger lanes, vary Z
      const lane = (i % 3) - 1
      const col = Math.floor(i / 3)

      if (block.kind === 'heading') {
        group.position.set(0, cursorY, 0.3)
      } else if (isUML) {
        group.position.set(0, cursorY, 1.5)
      } else {
        const x = lane * 2.0 + (col % 2 === 0 ? 0.2 : -0.2)
        const z = -Math.abs(lane) * 0.8 - col * 0.3
        group.position.set(x, cursorY, z)
        group.rotation.y = lane * -0.06
      }

      root.add(group)
      blockEntries.push({ group, block, isUML })

      const box = new THREE.Box3().setFromObject(group)
      const size = box.getSize(new THREE.Vector3())
      const gap = block.kind === 'heading' ? 0.7 : isUML ? 1.0 : 0.35
      cursorY -= Math.max(size.y, 0.3) + gap
    }

    // Center
    const rootBox = new THREE.Box3().setFromObject(root)
    if (!rootBox.isEmpty()) {
      const center = rootBox.getCenter(new THREE.Vector3())
      root.position.y -= center.y
    }
    scene.add(root)

    // Fit camera
    const finalBox = new THREE.Box3().setFromObject(root)
    if (!finalBox.isEmpty()) {
      const sz = finalBox.getSize(new THREE.Vector3())
      camera.position.set(0, 0, Math.max(sz.x, sz.y, 8) * 1.1)
    }
    ctrl.target.set(0, 0, 0)
    ctrl.update()

    setProgress(100)
    setLoading(false)
  })

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
      <Show when={loading()}>
        <div class="blueprint-progress">
          <div class="progress-shell">
            <div class="progress-fill" style={{ width: `${progress()}%` }} />
            <div class="progress-copy">
              <span class="progress-name">{props.documentModel.title}</span>
              <span class="progress-phase">{status()}</span>
              <span class="progress-percent">{progress()}%</span>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
