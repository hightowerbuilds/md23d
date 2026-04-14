import { onMount, onCleanup, createSignal, Show } from 'solid-js'
import * as THREE from 'three'
// @ts-ignore — no declaration file for three addons
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadUMLFont } from '../lib/uml'
import { composeSceneAsync, type ComposedScene } from '../lib/md3d'
import type { BlogDocument } from '../lib/blog/types'

interface BlueprintSceneProps {
  documentModel: BlogDocument
}

export default function BlueprintScene(props: BlueprintSceneProps) {
  let hostRef: HTMLDivElement | undefined
  let renderer: THREE.WebGLRenderer | undefined
  let controls: OrbitControls | undefined
  let composed: ComposedScene | null = null
  let frameId = 0

  const [progress, setProgress] = createSignal(0)
  const [phase, setPhase] = createSignal('Loading font...')
  const [building, setBuilding] = createSignal(true)

  onMount(async () => {
    if (!hostRef) return

    // ── renderer ──────────────────────────────────────────────
    const r = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    r.setSize(hostRef.clientWidth, hostRef.clientHeight)
    r.setClearColor(0x030914)
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 1.2
    hostRef.appendChild(r.domElement)
    renderer = r

    // ── scene ─────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030914, 0.012)

    // ── camera ────────────────────────────────────────────────
    const aspect = hostRef.clientWidth / hostRef.clientHeight
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200)
    camera.position.set(0, 0, 18)

    // ── controls ──────────────────────────────────────────────
    const ctrl = new OrbitControls(camera, r.domElement)
    ctrl.enableDamping = true
    ctrl.dampingFactor = 0.08
    ctrl.minDistance = 2
    ctrl.maxDistance = 80
    controls = ctrl

    // ── lighting ──────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight(0xd4eeff, 0x06080d, 1.4))
    const key = new THREE.DirectionalLight(0xffffff, 1.3)
    key.position.set(6, 9, 5)
    scene.add(key)
    const fill = new THREE.PointLight(0x69ceff, 18, 40)
    fill.position.set(-5, 3, 4)
    scene.add(fill)

    // ── star field (fixed backdrop) ───────────────────────────
    const starCount = 1200
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const rad = 30 + Math.random() * 50
      starPos[i * 3] = rad * Math.sin(phi) * Math.cos(theta)
      starPos[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(theta)
      starPos[i * 3 + 2] = rad * Math.cos(phi)
    }
    const starGeom = new THREE.BufferGeometry()
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    scene.add(
      new THREE.Points(
        starGeom,
        new THREE.PointsMaterial({
          color: 0xc8e8ff,
          size: 0.15,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.7,
        }),
      ),
    )

    // Start the render loop immediately so the stars are visible during build
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      ctrl.update()

      if (composed) {
        const t = performance.now() * 0.001
        for (let i = 0; i < composed.blockGroups.length; i++) {
          const { group } = composed.blockGroups[i]
          group.userData._baseX = group.userData._baseX ?? group.position.x
          group.position.x =
            group.userData._baseX + Math.sin(t * 0.3 + i * 0.8) * 0.04
          group.quaternion.copy(camera.quaternion)
        }
      }

      r.render(scene, camera)
    }
    animate()

    // ── build document (async with progress) ─────────────────
    try {
      setPhase('Loading font...')
      setProgress(5)
      const font = await loadUMLFont()

      setPhase('Building 3D blocks...')
      setProgress(10)

      const totalBlocks = props.documentModel.blocks.length
      composed = await composeSceneAsync(
        props.documentModel.blocks,
        font,
        (built, total) => {
          const pct = 10 + Math.round((built / total) * 85)
          setProgress(pct)
          setPhase(`Building block ${built + 1} of ${total}...`)
        },
      )
      scene.add(composed.root)

      setProgress(100)
      setPhase('Done')
      setBuilding(false)

      // fit camera
      const box = new THREE.Box3().setFromObject(composed.root)
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      camera.position.set(0, 0, maxDim * 1.4)
      ctrl.target.set(0, 0, 0)
      ctrl.update()
    } catch (e) {
      console.error('Blueprint scene build failed:', e)
      setPhase('Build failed')
      setBuilding(false)
    }

    // ── resize ────────────────────────────────────────────────
    const resizeObs = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const w = Math.max(320, entry.contentRect.width)
      const h = Math.max(360, entry.contentRect.height)
      r.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    resizeObs.observe(hostRef)

    onCleanup(() => {
      resizeObs.disconnect()
    })
  })

  onCleanup(() => {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frameId)
    if (composed) {
      composed.dispose()
      composed = null
    }
    if (controls) controls.dispose()
    if (renderer) {
      renderer.dispose()
      renderer.domElement.remove()
    }
  })

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
      <Show when={building()}>
        <div class="blueprint-progress">
          <div class="progress-shell">
            <div
              class="progress-fill"
              style={{ width: `${progress()}%` }}
            />
            <div class="progress-copy">
              <span class="progress-name">{props.documentModel.title}</span>
              <span class="progress-phase">{phase()}</span>
              <span class="progress-percent">{progress()}%</span>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
