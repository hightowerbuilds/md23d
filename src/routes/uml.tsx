import { createFileRoute, Link } from '@tanstack/solid-router'
import { onMount, onCleanup, createSignal } from 'solid-js'
import * as THREE from 'three'
// @ts-ignore — no declaration file for three addons
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadUMLFont, buildUML3D } from '../lib/uml'
import { composeScene, type ComposedScene } from '../lib/md3d'
import { parseMarkdownDocument } from '../lib/blog/parseMarkdown'

export const Route = createFileRoute('/uml')({
  component: UMLTest,
})

// ── sample diagrams from the DOM UML document ────────────────────

const DOM_CLASS_HIERARCHY = `graph TD
    ET[EventTarget] --> N[Node]
    N --> Doc[Document]
    N --> El[Element]
    N --> Txt[Text]
    N --> Com[Comment]
    N --> DF[DocumentFragment]
    El --> HTML[HTMLElement]
    El --> SVG[SVGElement]
    El --> Math[MathMLElement]
    HTML --> Div[HTMLDivElement]
    HTML --> P[HTMLParagraphElement]
    HTML --> Span[HTMLSpanElement]
    HTML --> Anchor[HTMLAnchorElement]
    HTML --> Img[HTMLImageElement]
    HTML --> Input[HTMLInputElement]
    HTML --> Btn[HTMLButtonElement]
    HTML --> Form[HTMLFormElement]
    HTML --> Media[HTMLMediaElement]
    Media --> Video[HTMLVideoElement]
    Media --> Audio[HTMLAudioElement]`

const BROWSER_PIPELINE = `graph TD
    A[HTML source bytes] --> B[HTML Parser]
    B --> C[DOM Tree]
    C --> D[CSS Parser]
    C --> E[JS Engine V8]
    C --> F[Resource Loader]
    D --> G[Style Resolution]
    E --> G
    F --> G
    G --> H[Render Tree]
    H --> I[Layout / Reflow]
    I --> J[Paint]
    J --> K[Compositing]
    K --> L((Pixels))`

const EYEBALL_PIPELINE = `graph TD
    A[HTML source bytes] --> B[browser.rs fetch_page]
    B --> C[Content extraction]
    C --> D[Extracted HTML fragment]
    D --> E[html.rs parse_html]
    E -->|Block tags| F[Flush block / start new]
    E -->|Inline tags| G[Push/pop span stack]
    E -->|Text content| H[Append to text buf]
    F --> I[Vec of Block]
    G --> I
    H --> I
    I --> J[vcss.rs compute_styles]
    J --> K[layout.rs layout]
    K --> L[paint.rs paint]
    L --> M((DisplayList))`

const SAMPLE_MARKDOWN = `# The DOM: UML Overview

The W3C DOM is an object-oriented tree. Every node inherits from Node.

\`\`\`mermaid
graph TD
    ET[EventTarget] --> N[Node]
    N --> Doc[Document]
    N --> El[Element]
    N --> Txt[Text]
    N --> Com[Comment]
    El --> HTML[HTMLElement]
    El --> SVG[SVGElement]
    HTML --> Div[HTMLDivElement]
    HTML --> P[HTMLParagraphElement]
    HTML --> Span[HTMLSpanElement]
    HTML --> Anchor[HTMLAnchorElement]
    HTML --> Media[HTMLMediaElement]
    Media --> Video[HTMLVideoElement]
    Media --> Audio[HTMLAudioElement]
\`\`\`

## The Browser Pipeline

The DOM tree is just step one. Here is the full rendering pipeline from HTML bytes to pixels on screen.

\`\`\`mermaid
graph TD
    A[HTML source bytes] --> B[HTML Parser]
    B --> C[DOM Tree]
    C --> D[CSS Parser]
    C --> E[JS Engine V8]
    C --> F[Resource Loader]
    D --> G[Style Resolution]
    E --> G
    F --> G
    G --> H[Render Tree]
    H --> I[Layout / Reflow]
    I --> J[Paint]
    J --> K[Compositing]
    K --> L((Pixels))
\`\`\`

## Key Cost Centers

- Style resolution is O(elements times rules). Cascade plus specificity plus inheritance.
- Layout can be O(n squared) with nested flex, grid, and float. Any change can invalidate the whole tree.
- Paint involves stacking contexts, overflow clipping, and blend modes.
- JavaScript can touch any node, mutate any style, and force synchronous layout thrashing.

\`\`\`js
// Layout thrashing example
for (const el of elements) {
  el.style.width = box.offsetWidth + 'px'
}
\`\`\`
`

type TabEntry =
  | { kind: 'diagram'; label: string; source: string }
  | { kind: 'document'; label: string; markdown: string }

const TABS: TabEntry[] = [
  { kind: 'diagram', label: 'DOM Class Hierarchy', source: DOM_CLASS_HIERARCHY },
  { kind: 'diagram', label: 'Browser Pipeline', source: BROWSER_PIPELINE },
  { kind: 'diagram', label: 'Eyeball Pipeline', source: EYEBALL_PIPELINE },
  { kind: 'document', label: 'Full Document', markdown: SAMPLE_MARKDOWN },
]

// ── component ────────────────────────────────────────────────────

function UMLTest() {
  let containerRef: HTMLDivElement | undefined
  let rendererRef: THREE.WebGLRenderer | undefined
  let controlsRef: OrbitControls | undefined
  let frameId = 0

  const [activeDiagram, setActiveDiagram] = createSignal(0)
  const [loading, setLoading] = createSignal(true)

  // Current 3D content in scene
  let currentUML: ReturnType<typeof buildUML3D> | null = null
  let currentComposed: ComposedScene | null = null

  onMount(async () => {
    if (!containerRef) return

    // ── renderer ──────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(containerRef.clientWidth, containerRef.clientHeight)
    renderer.setClearColor(0x030914)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    containerRef.appendChild(renderer.domElement)
    rendererRef = renderer

    // ── scene ─────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030914, 0.025)

    // ── camera ────────────────────────────────────────────────
    const aspect = containerRef.clientWidth / containerRef.clientHeight
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200)
    camera.position.set(0, 0, 18)

    // ── controls ──────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 3
    controls.maxDistance = 60
    controlsRef = controls

    // ── lighting ──────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight(0xd4eeff, 0x06080d, 1.4))

    const key = new THREE.DirectionalLight(0xffffff, 1.3)
    key.position.set(6, 9, 5)
    scene.add(key)

    const fill = new THREE.PointLight(0x69ceff, 18, 40)
    fill.position.set(-5, 3, 4)
    scene.add(fill)

    // ── star field ────────────────────────────────────────────
    const starCount = 1200
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 30 + Math.random() * 50
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      starPositions[i * 3 + 2] = r * Math.cos(phi)
    }
    const starGeom = new THREE.BufferGeometry()
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const stars = new THREE.Points(
      starGeom,
      new THREE.PointsMaterial({
        color: 0xc8e8ff,
        size: 0.15,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.7,
      }),
    )
    scene.add(stars)

    // ── load font & build first tab ────────────────────────────
    try {
      const font = await loadUMLFont()
      loadTab(scene, font, activeDiagram())
      setLoading(false)
    } catch (e) {
      console.error('Failed to load UML font:', e)
      setLoading(false)
    }

    // ── tab switching ────────────────────────────────────────
    function clearCurrent(scene: THREE.Scene) {
      if (currentUML) {
        scene.remove(currentUML.group)
        currentUML.dispose()
        currentUML = null
      }
      if (currentComposed) {
        scene.remove(currentComposed.root)
        currentComposed.dispose()
        currentComposed = null
      }
    }

    function loadTab(
      scene: THREE.Scene,
      font: Parameters<typeof buildUML3D>[1],
      index: number,
    ) {
      clearCurrent(scene)
      const tab = TABS[index]

      if (tab.kind === 'diagram') {
        currentUML = buildUML3D(tab.source, font)
        scene.add(currentUML.group)
      } else {
        const doc = parseMarkdownDocument(tab.markdown)
        currentComposed = composeScene(doc.blocks, font)
        scene.add(currentComposed.root)
      }

      // fit camera to whatever was built
      const target = currentUML?.group ?? currentComposed?.root
      if (target) {
        const box = new THREE.Box3().setFromObject(target)
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        camera.position.set(0, 0, maxDim * 1.5)
        controls.target.set(0, 0, 0)
        controls.update()
      }
    }

    // expose for signal-driven switching
    ;(containerRef as any).__loadTab = (index: number) => {
      loadUMLFont().then(font => loadTab(scene, font, index))
    }

    // ── billboard helper ────────────────────────────────────────
    // Makes a group face the camera while preserving its world position.
    // Children keep their local offsets so spatial layout stays intact.
    function billboard(obj: THREE.Object3D) {
      obj.quaternion.copy(camera.quaternion)
    }

    // ── animate ───────────────────────────────────────────────
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      controls.update()
      // stars stay still — fixed backdrop for depth perspective

      // UML diagrams: float + billboard each node
      if (currentUML) {
        const t = performance.now() * 0.001
        for (const [id, g] of currentUML.nodeGroups) {
          const i = parseInt(id, 36) || 0
          g.userData._baseZ = g.userData._baseZ ?? g.position.z
          g.position.z = g.userData._baseZ + Math.sin(t * 0.4 + i * 0.7) * 0.06
          billboard(g)
        }
      }

      // Composed document: float + billboard each block
      if (currentComposed) {
        const t = performance.now() * 0.001
        for (let i = 0; i < currentComposed.blockGroups.length; i++) {
          const { group } = currentComposed.blockGroups[i]
          group.userData._baseX = group.userData._baseX ?? group.position.x
          group.position.x =
            group.userData._baseX + Math.sin(t * 0.3 + i * 0.8) * 0.04
          billboard(group)
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    // ── resize ────────────────────────────────────────────────
    const onResize = () => {
      if (!containerRef) return
      const w = containerRef.clientWidth
      const h = containerRef.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)
    ;(containerRef as any).__onResize = onResize
  })

  onCleanup(() => {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frameId)
    if (currentUML) {
      currentUML.dispose()
      currentUML = null
    }
    if (currentComposed) {
      currentComposed.dispose()
      currentComposed = null
    }
    if (controlsRef) controlsRef.dispose()
    if (rendererRef) {
      rendererRef.dispose()
      rendererRef.domElement.remove()
    }
    if (containerRef) {
      const onResize = (containerRef as any).__onResize
      if (onResize && typeof window !== 'undefined') window.removeEventListener('resize', onResize)
    }
  })

  function switchDiagram(index: number) {
    setActiveDiagram(index)
    if (containerRef && (containerRef as any).__loadTab) {
      ;(containerRef as any).__loadTab(index)
    }
  }

  return (
    <main class="uml-page">
      <div class="uml-toolbar">
        <Link to="/" class="uml-tab uml-brand">MD23D</Link>
        <span class="uml-divider" />
        {TABS.map((tab, i) => (
          <button
            class={`uml-tab ${activeDiagram() === i ? 'active' : ''}`}
            onClick={() => switchDiagram(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div class="uml-status">
        {loading() ? 'Loading 3D font...' : 'Drag to orbit \u00b7 Scroll to zoom'}
      </div>
      <div ref={containerRef} class="uml-container" />
    </main>
  )
}
