import { onMount, onCleanup, createSignal, Show } from 'solid-js'
import * as THREE from 'three'
// @ts-ignore
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { BlogDocument, BlogBlock } from '../lib/blog/types'
import { loadUMLFont, buildUML3D } from '../lib/uml'

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

    // ── basic Three.js setup ──────────────────────────────────
    const r = new THREE.WebGLRenderer({ antialias: true })
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    r.setSize(w, h)
    r.setClearColor(0x030914)
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    hostRef.appendChild(r.domElement)
    renderer = r

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 300)
    camera.position.set(0, 0, 12)

    const ctrl = new OrbitControls(camera, r.domElement)
    ctrl.enableDamping = true
    ctrl.dampingFactor = 0.08
    ctrl.maxDistance = 120
    controls = ctrl

    // Lights
    scene.add(new THREE.HemisphereLight(0xd4eeff, 0x06080d, 1.4))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
    keyLight.position.set(5, 8, 5)
    scene.add(keyLight)
    scene.add(new THREE.PointLight(0x69ceff, 15, 40))

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const starVerts = new Float32Array(1200 * 3)
    for (let i = 0; i < 1200; i++) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const rad = 40 + Math.random() * 60
      starVerts[i * 3] = rad * Math.sin(ph) * Math.cos(th)
      starVerts[i * 3 + 1] = rad * Math.sin(ph) * Math.sin(th)
      starVerts[i * 3 + 2] = rad * Math.cos(ph)
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starVerts, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xc8e8ff, size: 0.15, sizeAttenuation: true, transparent: true, opacity: 0.7,
    })))

    // Render loop — starts now so stars are visible
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      ctrl.update()
      r.render(scene, camera)
    }
    animate()

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

    // ── build blocks ──────────────────────────────────────────
    const blocks = props.documentModel.blocks
    const root = new THREE.Group()
    const cardGroups: { group: THREE.Group; block: BlogBlock; isUML: boolean }[] = []

    let cursorY = 0
    let lastSection = -1

    setStatus('Loading font...')
    setProgress(5)

    let font: any = null
    try {
      font = await loadUMLFont()
    } catch (e) {
      console.warn('Font load failed, proceeding without 3D diagrams:', e)
    }

    setProgress(10)

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      setStatus(`Block ${i + 1} / ${blocks.length}`)
      setProgress(10 + Math.round((i / blocks.length) * 85))

      if (i % 3 === 0) {
        await new Promise<void>(res => requestAnimationFrame(() => res()))
      }

      // Section gap
      if (block.sectionIndex !== undefined && block.sectionIndex !== lastSection) {
        if (lastSection >= 0) cursorY -= 1.2
        lastSection = block.sectionIndex
      }

      let group: THREE.Group | null = null
      let isUML = false

      // Mermaid diagrams → 3D mesh objects
      if (
        block.kind === 'diagram' &&
        font &&
        block.language?.trim().toLowerCase() === 'mermaid' &&
        /^(graph|flowchart)\s/i.test(block.text.trim())
      ) {
        try {
          const uml = buildUML3D(block.text, font)
          group = uml.group
          const box = new THREE.Box3().setFromObject(group)
          const sz = box.getSize(new THREE.Vector3())
          const scale = 5 / Math.max(sz.x, sz.y, 1)
          group.scale.setScalar(scale * 0.8)
          isUML = true
          disposables.push(uml.dispose)
        } catch (e) {
          console.warn('UML build failed for block', block.id, e)
          group = null
        }
      }

      // Everything else → canvas card
      if (!group) {
        group = makeCard(block)
      }

      if (group) {
        // Spatial layout: stagger X by lane, vary Z for depth
        const lane = (i % 3) - 1 // -1, 0, 1
        const col = Math.floor(i / 3)
        const x = lane * 1.8 + (col % 2 === 0 ? 0.3 : -0.3)
        const z = -Math.abs(lane) * 1.2 - col * 0.4

        // Headings center, wider gap before them
        if (block.kind === 'heading') {
          group.position.set(0, cursorY - 0.4, 0.5)
        } else if (isUML) {
          // UML diagrams center, push forward in Z
          group.position.set(0, cursorY, 1.5)
        } else {
          group.position.set(x, cursorY, z)
          // Slight rotation toward center
          group.rotation.y = lane * -0.08
        }

        root.add(group)
        cardGroups.push({ group, block, isUML })

        const box = new THREE.Box3().setFromObject(group)
        const size = box.getSize(new THREE.Vector3())

        // Headings and UML get more space
        const gap = block.kind === 'heading' ? 0.8 : isUML ? 1.0 : 0.4
        cursorY -= size.y + gap
      }
    }

    // Center and add to scene
    const rootBox = new THREE.Box3().setFromObject(root)
    if (!rootBox.isEmpty()) {
      const center = rootBox.getCenter(new THREE.Vector3())
      root.position.y -= center.y
      root.position.z -= center.z / 2
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

    // ── post-build: gentle idle animation ─────────────────────
    // Override animate to add subtle float + billboard UML
    const origAnimate = animate
    const animateWithFloat = () => {
      frameId = requestAnimationFrame(animateWithFloat)
      ctrl.update()
      const t = performance.now() * 0.001

      for (let i = 0; i < cardGroups.length; i++) {
        const { group, isUML } = cardGroups[i]
        group.userData._baseY = group.userData._baseY ?? group.position.y
        group.position.y =
          group.userData._baseY + Math.sin(t * 0.25 + i * 0.5) * 0.03

        // UML diagrams billboard toward camera
        if (isUML) {
          group.quaternion.copy(camera.quaternion)
        }
      }

      r.render(scene, camera)
    }

    // Switch to enhanced animation
    cancelAnimationFrame(frameId)
    animateWithFloat()
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

// ── simple canvas card — zero dependencies ───────────────────────

function makeCard(block: BlogBlock): THREE.Group {
  const CARD_W = 900
  const PAD = 50

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    // Absolute fallback — colored box
    const geo = new THREE.BoxGeometry(4, 0.5, 0.05)
    const mat = new THREE.MeshStandardMaterial({ color: 0x78daff })
    const g = new THREE.Group()
    g.add(new THREE.Mesh(geo, mat))
    return g
  }

  const isHeading = block.kind === 'heading'
  const isCode = block.kind === 'code' || block.kind === 'diagram' || block.kind === 'table'

  // Measure text
  const fontSize = isHeading ? 34 : isCode ? 18 : 24
  const lineH = isHeading ? 44 : isCode ? 24 : 32
  ctx.font = `${isHeading ? '700' : '400'} ${fontSize}px ${isCode ? 'monospace' : 'sans-serif'}`

  const maxW = CARD_W - PAD * 2
  const lines = wordWrap(ctx, block.text, maxW)
  const textH = lines.length * lineH

  // Size canvas
  canvas.height = Math.max(80 + textH + PAD, 120)

  // Redraw after resize (clears canvas)
  // Background
  ctx.fillStyle = 'rgba(6, 12, 24, 0.9)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = 'rgba(120, 218, 255, 0.12)'
  ctx.lineWidth = 1
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6)

  // Accent
  ctx.fillStyle = isHeading ? '#78daff' : 'rgba(120, 218, 255, 0.4)'
  ctx.fillRect(PAD, 22, isHeading ? 140 : 80, isHeading ? 4 : 3)

  // Label
  ctx.fillStyle = 'rgba(140, 180, 210, 0.6)'
  ctx.font = '600 14px sans-serif'
  ctx.fillText(block.label.toUpperCase(), PAD, 50)

  // Code panel bg
  if (isCode) {
    ctx.fillStyle = 'rgba(10, 30, 20, 0.5)'
    ctx.fillRect(PAD - 12, 60, canvas.width - PAD * 2 + 24, textH + 20)
  }

  // Body text
  ctx.fillStyle = isHeading ? '#eaf4ff' : isCode ? '#a8e6cf' : '#c8ddf0'
  ctx.font = `${isHeading ? '700' : '400'} ${fontSize}px ${isCode ? 'monospace' : 'sans-serif'}`
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], PAD, 70 + i * lineH + fontSize)
  }

  // Create mesh
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const aspect = canvas.height / canvas.width
  const worldW = 4.2
  const geo = new THREE.PlaneGeometry(worldW, worldW * aspect)
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)

  const group = new THREE.Group()
  group.add(mesh)
  return group
}

function wordWrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    if (!raw.trim()) { out.push(''); continue }
    let line = ''
    for (const word of raw.split(/\s+/)) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > max && line) {
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
