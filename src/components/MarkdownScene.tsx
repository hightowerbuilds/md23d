import katex from 'katex'
import 'katex/dist/katex.min.css'
import { createHotkeys } from '@tanstack/solid-hotkeys'
import {
  clearCache as clearPretextCache,
  layoutWithLines,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import * as THREE from 'three'

import type {
  BlogBlock,
  BlogDocument,
  BlogEnvironment,
} from '../lib/blog/types'

const PANEL_PIXEL_WIDTH = 980
const PANEL_WORLD_WIDTH = 4.6
const PANEL_PADDING_X = 72
const PANEL_PADDING_Y = 60
const DRIFT_PARTICLE_COUNT = 8000
const DRIFT_WORLD_WIDTH = 6.2
const DRIFT_SAMPLE_STEP = 3
const DRIFT_DISSOLVE_SPEED = 0.018
const DRIFT_FORM_SPEED = 0.022

// Pretext measurement cache — survives across environment switches for the same document
const preparedCache = new Map<string, PreparedTextWithSegments>()
let preparedCacheDocId: string | null = null

function getOrPrepare(
  key: string,
  text: string,
  font: string,
  options?: { whiteSpace?: 'normal' | 'pre-wrap' },
): PreparedTextWithSegments {
  const cached = preparedCache.get(key)
  if (cached) return cached
  const prepared = prepareWithSegments(text, font, options)
  preparedCache.set(key, prepared)
  return prepared
}

function invalidatePreparedCache(docId: string) {
  if (preparedCacheDocId !== docId) {
    preparedCache.clear()
    preparedCacheDocId = docId
  }
}

type SceneCard = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  basePosition: THREE.Vector3
  baseRotation: THREE.Euler
  baseScale: THREE.Vector3
}

type DriftSlideData = {
  textPositions: Float32Array
  textColors: Float32Array
  textCount: number
}

type EnvironmentPalette = {
  sceneBackground: string
  fog: string
  star: string
  rim: string
  panel: string
  panelSoft: string
  border: string
  text: string
  textSoft: string
  accent: string
  accentSecondary: string
  codePanel: string
  codeText: string
  rail: string
  railGlow: string
  floor: string
}

const palettes: Record<BlogEnvironment, EnvironmentPalette> = {
  space: {
    sceneBackground: '#030914',
    fog: '#06101b',
    star: '#9fddff',
    rim: '#4ac3ff',
    panel: 'rgba(7, 19, 33, 0.92)',
    panelSoft: 'rgba(13, 35, 57, 0.72)',
    border: 'rgba(123, 205, 255, 0.42)',
    text: '#ecf7ff',
    textSoft: '#9dbdd4',
    accent: '#78daff',
    accentSecondary: '#6bf0cf',
    codePanel: 'rgba(4, 14, 25, 0.95)',
    codeText: '#9fffc1',
    rail: '#224862',
    railGlow: '#63d6ff',
    floor: '#08111d',
  },
  drift: {
    sceneBackground: '#020408',
    fog: '#020408',
    star: '#6e9eff',
    rim: '#3355aa',
    panel: 'rgba(8, 14, 28, 0.95)',
    panelSoft: 'rgba(12, 20, 40, 0.8)',
    border: 'rgba(90, 140, 240, 0.28)',
    text: '#d8e4ff',
    textSoft: '#7898c0',
    accent: '#5b8def',
    accentSecondary: '#8cb4ff',
    codePanel: 'rgba(4, 8, 18, 0.97)',
    codeText: '#8cb4ff',
    rail: '#1a2a4a',
    railGlow: '#4488cc',
    floor: '#010306',
  },
  cosmos: {
    sceneBackground: '#000000',
    fog: '#000000',
    star: '#ffffff',
    rim: '#2a3660',
    panel: 'rgba(4, 6, 16, 0.97)',
    panelSoft: 'rgba(8, 10, 24, 0.82)',
    border: 'rgba(90, 130, 220, 0.24)',
    text: '#d8e8ff',
    textSoft: '#7888b0',
    accent: '#7aa0f0',
    accentSecondary: '#a0c0ff',
    codePanel: 'rgba(2, 3, 10, 0.98)',
    codeText: '#a8c4f0',
    rail: '#182040',
    railGlow: '#3858b0',
    floor: '#020308',
  },
}

export default function MarkdownScene(props: {
  documentModel: BlogDocument
  environment: BlogEnvironment | null
}) {
  let host!: HTMLDivElement

  const [activeDriftIndex, setActiveDriftIndex] = createSignal(0)
  const [driftLabel, setDriftLabel] = createSignal('')
  let triggerDriftTransitionRef: ((dir?: 1 | -1) => void) | null = null

  const [activeCosmosIndex, setActiveCosmosIndex] = createSignal(0)
  const [orbitFocusLabel, setOrbitFocusLabel] = createSignal<string | null>(null)
  const moveCosmosIndex = (direction: 1 | -1) => {
    setActiveCosmosIndex((index) => {
      const total = props.documentModel.blocks.length
      if (total <= 0) return 0
      if (direction > 0) return index + 1 < total ? index + 1 : 0
      return index > 0 ? index - 1 : total - 1
    })
  }

  createEffect(() => {
    props.documentModel
    props.environment
    setActiveDriftIndex(0)
    setActiveCosmosIndex(0)
  })

  createHotkeys(
    [
      {
        hotkey: 'ArrowRight',
        callback: (event) => {
          if (!shouldHandleSceneHotkey(event)) return
          event.preventDefault()
          moveCosmosIndex(1)
        },
      },
      {
        hotkey: 'Enter',
        callback: (event) => {
          if (!shouldHandleSceneHotkey(event)) return
          event.preventDefault()
          moveCosmosIndex(1)
        },
      },
      {
        hotkey: 'Space',
        callback: (event) => {
          if (!shouldHandleSceneHotkey(event)) return
          event.preventDefault()
          moveCosmosIndex(1)
        },
      },
      {
        hotkey: 'ArrowLeft',
        callback: (event) => {
          if (!shouldHandleSceneHotkey(event)) return
          event.preventDefault()
          moveCosmosIndex(-1)
        },
      },
    ],
    () => ({
      enabled:
        props.environment === 'cosmos' &&
        props.documentModel.blocks.length > 0,
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
    }),
  )

  onMount(async () => {
    await document.fonts.ready

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    host.append(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 220)
    const stage = new THREE.Group()
    const standardStarField = createStarField(getPalette(props.environment).star)
    const cosmosStarField = createCosmosStarField()
    const reducedMotionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null

    scene.add(stage)
    scene.add(standardStarField)
    scene.add(cosmosStarField)
    scene.add(new THREE.HemisphereLight('#d4eeff', '#06080d', 1.35))

    const keyLight = new THREE.DirectionalLight('#ffffff', 1.25)
    keyLight.position.set(6, 9, 5)
    scene.add(keyLight)

    const fillLight = new THREE.PointLight('#69ceff', 20, 30, 2)
    fillLight.position.set(-5, 3, 4)
    scene.add(fillLight)

    const pointer = { x: 0, y: 0 }
    const raycaster = new THREE.Raycaster()
    const clickNdc = new THREE.Vector2()
    let cards: SceneCard[] = []
    let frameId = 0
    let currentEnvironment = props.environment
    let reduceMotion = reducedMotionQuery?.matches ?? false
    let focusedCardIndex: number | null = null
    let focusTarget = new THREE.Vector3()
    let focusLookAt = new THREE.Vector3()

    // Drift state
    let driftSlides: DriftSlideData[] = []
    let driftGeometry: THREE.BufferGeometry | null = null
    let driftPoints: THREE.Points | null = null
    let driftGroup = new THREE.Group()
    let driftCloudPositions = new Float32Array(DRIFT_PARTICLE_COUNT * 3)
    let driftState: 'idle' | 'dissolving' | 'forming' = 'forming'
    let driftProgress = 0
    let driftSpinVelocity = 0
    let isDriftDragging = false
    let driftDragStartX = 0
    let driftDragDelta = 0
    const orbSprite = createOrbSprite()

    // Pre-generate cloud positions
    for (let i = 0; i < DRIFT_PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 2.5 + Math.random() * 4
      driftCloudPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      driftCloudPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6
      driftCloudPositions[i * 3 + 2] = r * Math.cos(phi) * 0.8
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = Math.max(320, entry.contentRect.width)
      const height = Math.max(360, entry.contentRect.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    })

    resizeObserver.observe(host)

    const handlePointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
      pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2
    }

    const resetPointer = () => {
      pointer.x = 0
      pointer.y = 0
    }

    const handleCanvasClick = (event: MouseEvent) => {
      if (currentEnvironment !== 'space' || cards.length === 0) return

      const rect = host.getBoundingClientRect()
      clickNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      clickNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(clickNdc, camera)
      const intersects = raycaster.intersectObjects(cards.map((c) => c.mesh))

      if (intersects.length > 0) {
        const hitMesh = intersects[0]!.object
        const hitIndex = cards.findIndex((c) => c.mesh === hitMesh)
        if (hitIndex >= 0 && hitIndex !== focusedCardIndex) {
          focusedCardIndex = hitIndex
          const card = cards[hitIndex]!
          const normal = new THREE.Vector3(0, 0, 1).applyEuler(card.baseRotation)
          focusTarget.copy(card.basePosition).addScaledVector(normal, 3.2)
          focusLookAt.copy(card.basePosition)
          const block = props.documentModel.blocks[hitIndex]
          setOrbitFocusLabel(block ? block.label : null)
        } else {
          focusedCardIndex = null
          setOrbitFocusLabel(null)
        }
      } else {
        focusedCardIndex = null
        setOrbitFocusLabel(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (currentEnvironment !== 'space') return
      if (event.key === 'Escape' && focusedCardIndex !== null) {
        event.preventDefault()
        focusedCardIndex = null
        setOrbitFocusLabel(null)
      }
      if (focusedCardIndex !== null && (event.key === 'ArrowRight' || event.key === 'ArrowDown')) {
        event.preventDefault()
        focusedCardIndex = (focusedCardIndex + 1) % cards.length
        const card = cards[focusedCardIndex]!
        const normal = new THREE.Vector3(0, 0, 1).applyEuler(card.baseRotation)
        focusTarget.copy(card.basePosition).addScaledVector(normal, 3.2)
        focusLookAt.copy(card.basePosition)
        const block = props.documentModel.blocks[focusedCardIndex]
        setOrbitFocusLabel(block ? block.label : null)
      }
      if (focusedCardIndex !== null && (event.key === 'ArrowLeft' || event.key === 'ArrowUp')) {
        event.preventDefault()
        focusedCardIndex = (focusedCardIndex - 1 + cards.length) % cards.length
        const card = cards[focusedCardIndex]!
        const normal = new THREE.Vector3(0, 0, 1).applyEuler(card.baseRotation)
        focusTarget.copy(card.basePosition).addScaledVector(normal, 3.2)
        focusLookAt.copy(card.basePosition)
        const block = props.documentModel.blocks[focusedCardIndex]
        setOrbitFocusLabel(block ? block.label : null)
      }
    }

    const triggerDriftTransition = (direction: 1 | -1 = 1) => {
      if (driftState !== 'idle' || driftSlides.length === 0) return
      driftState = 'dissolving'
      driftProgress = 0
      const total = driftSlides.length
      const nextIndex =
        direction > 0
          ? (activeDriftIndex() + 1) % total
          : (activeDriftIndex() - 1 + total) % total
      setActiveDriftIndex(nextIndex)
      const block = props.documentModel.blocks[nextIndex]
      setDriftLabel(block ? block.label : '')
    }
    triggerDriftTransitionRef = triggerDriftTransition

    const handleDriftPointerDown = (event: PointerEvent) => {
      if (currentEnvironment !== 'drift') return
      isDriftDragging = true
      driftDragStartX = event.clientX
      driftDragDelta = 0
      host.setPointerCapture(event.pointerId)
    }

    const handleDriftPointerMove = (event: PointerEvent) => {
      if (!isDriftDragging || currentEnvironment !== 'drift') return
      driftDragDelta = event.clientX - driftDragStartX
      driftSpinVelocity = driftDragDelta * 0.0015
      if (driftState === 'idle') {
        driftGroup.rotation.y = driftDragDelta * 0.004
      }
    }

    const handleDriftPointerUp = () => {
      if (!isDriftDragging) return
      isDriftDragging = false
      if (Math.abs(driftDragDelta) > 50 && driftState === 'idle') {
        triggerDriftTransition(driftDragDelta > 0 ? 1 : -1)
      } else if (driftState === 'idle') {
        driftGroup.rotation.y = 0
      }
      driftDragDelta = 0
    }

    host.addEventListener('pointermove', handlePointerMove)
    host.addEventListener('pointerleave', resetPointer)
    host.addEventListener('click', handleCanvasClick)
    host.addEventListener('pointerdown', handleDriftPointerDown)
    host.addEventListener('pointermove', handleDriftPointerMove)
    host.addEventListener('pointerup', handleDriftPointerUp)
    document.addEventListener('keydown', handleKeyDown)

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches
    }

    reducedMotionQuery?.addEventListener?.('change', handleReducedMotionChange)

    const rebuildScene = () => {
      if (!isBlogEnvironment(props.environment)) return

      currentEnvironment = props.environment
      focusedCardIndex = null
      clearGroup(stage)

      // Clean up previous drift resources
      if (driftPoints) {
        driftGroup.remove(driftPoints)
        driftGeometry?.dispose()
        driftPoints = null
        driftGeometry = null
      }
      scene.remove(driftGroup)
      driftGroup = new THREE.Group()

      const docId = props.documentModel.blocks.map((b) => b.id).join(':')
      invalidatePreparedCache(docId)

      const palette = palettes[currentEnvironment]
      scene.background = new THREE.Color(palette.sceneBackground)

      if (currentEnvironment === 'cosmos') {
        scene.fog = null
        standardStarField.visible = false
        cosmosStarField.visible = true
        fillLight.visible = false
        camera.position.set(0, 0, 0.1)
        camera.lookAt(0, 0.05, -1)
        cards = []
        driftSlides = []
        return
      }

      if (currentEnvironment === 'drift') {
        scene.fog = new THREE.Fog(palette.fog, 8, 28)
        standardStarField.visible = true
        cosmosStarField.visible = false
        fillLight.visible = true
        fillLight.color.set(palette.accent)
        fillLight.intensity = 12
        ;(standardStarField.material as THREE.PointsMaterial).color.set(palette.star)
        standardStarField.position.set(0, 0, 0)

        camera.position.set(0, 0, 7)
        camera.lookAt(0, 0, 0)
        cards = []

        // Build particle slides from document blocks
        driftSlides = props.documentModel.blocks.map((block) =>
          buildDriftSlide(block, palette),
        )

        // Create the particle geometry
        driftGeometry = new THREE.BufferGeometry()
        const positions = new Float32Array(DRIFT_PARTICLE_COUNT * 3)
        const colors = new Float32Array(DRIFT_PARTICLE_COUNT * 3)

        // Start in cloud
        for (let i = 0; i < DRIFT_PARTICLE_COUNT; i++) {
          positions[i * 3] = driftCloudPositions[i * 3]!
          positions[i * 3 + 1] = driftCloudPositions[i * 3 + 1]!
          positions[i * 3 + 2] = driftCloudPositions[i * 3 + 2]!
          colors[i * 3] = 0.25
          colors[i * 3 + 1] = 0.35
          colors[i * 3 + 2] = 0.55
        }

        driftGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        driftGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

        const material = new THREE.PointsMaterial({
          size: 0.045,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.88,
          vertexColors: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          map: orbSprite,
        })

        driftPoints = new THREE.Points(driftGeometry, material)
        driftGroup.add(driftPoints)
        scene.add(driftGroup)

        // Begin forming first slide
        driftState = 'forming'
        driftProgress = 0
        driftSpinVelocity = 0
        setActiveDriftIndex(0)
        const firstBlock = props.documentModel.blocks[0]
        setDriftLabel(firstBlock ? firstBlock.label : '')
        return
      }

      // Space environment
      standardStarField.visible = true
      cosmosStarField.visible = false
      fillLight.visible = true
      scene.fog = new THREE.Fog(palette.fog, 14, 72)
      ;(standardStarField.material as THREE.PointsMaterial).color.set(palette.star)
      standardStarField.position.set(0, 0, 0)
      fillLight.color.set(palette.accent)
      fillLight.intensity = 20
      driftSlides = []

      cards = props.documentModel.blocks.map((block, index) =>
        createContentCard(
          block,
          index,
          currentEnvironment!,
          renderer.capabilities.getMaxAnisotropy(),
        ),
      )

      arrangeSpace(cards, stage)
      stage.add(createNebulaRing(palette))
    }

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate)
      const seconds = time * 0.001

      if (currentEnvironment === 'cosmos') {
        cosmosStarField.rotation.y += 0.000055
        cosmosStarField.rotation.x = Math.sin(seconds * 0.025) * 0.012
      } else if (currentEnvironment === 'space') {
        standardStarField.rotation.y += 0.00025
        standardStarField.rotation.x = Math.sin(seconds * 0.08) * 0.05

        if (focusedCardIndex !== null && focusedCardIndex < cards.length) {
          // Focused orbit: camera lerps toward the selected card
          camera.position.lerp(focusTarget, reduceMotion ? 0.1 : 0.055)
          const currentLook = new THREE.Vector3()
          camera.getWorldDirection(currentLook)
          currentLook.multiplyScalar(5).add(camera.position)
          currentLook.lerp(focusLookAt, reduceMotion ? 0.1 : 0.07)
          camera.lookAt(currentLook)

          stage.rotation.y += (0 - stage.rotation.y) * 0.06
          stage.rotation.x += (0 - stage.rotation.x) * 0.06

          for (const [index, card] of cards.entries()) {
            const isFocused = index === focusedCardIndex
            const targetOpacity = isFocused ? 1 : 0.12
            card.mesh.material.opacity +=
              (targetOpacity - card.mesh.material.opacity) * 0.08

            const drift = isFocused ? 0.03 : 0.06
            card.mesh.position.x =
              card.basePosition.x + Math.cos(seconds * 0.2 + index) * drift
            card.mesh.position.y =
              card.basePosition.y + Math.sin(seconds * 0.35 + index * 0.6) * drift
            card.mesh.rotation.y = card.baseRotation.y
            card.mesh.rotation.x = card.baseRotation.x
          }
        } else {
          // Unfocused orbit: free-floating constellation
          camera.position.x += (pointer.x * 1.9 - camera.position.x) * 0.032
          camera.position.y += (1.4 - pointer.y * 0.7 - camera.position.y) * 0.032
          camera.position.z += (8.8 - camera.position.z) * 0.045
          camera.lookAt(0, 0.7, -9.5)
          stage.rotation.y = Math.sin(seconds * 0.18) * 0.12
          stage.rotation.x = Math.cos(seconds * 0.13) * 0.03

          for (const [index, card] of cards.entries()) {
            card.mesh.material.opacity +=
              (1 - card.mesh.material.opacity) * 0.06

            card.mesh.position.x =
              card.basePosition.x + Math.cos(seconds * 0.34 + index) * 0.12
            card.mesh.position.y =
              card.basePosition.y + Math.sin(seconds * 0.7 + index * 0.6) * 0.2
            card.mesh.rotation.y =
              card.baseRotation.y + Math.sin(seconds * 0.5 + index * 0.4) * 0.06
            card.mesh.rotation.x =
              card.baseRotation.x + Math.cos(seconds * 0.55 + index * 0.2) * 0.035
          }
        }
      } else if (currentEnvironment === 'drift') {
        standardStarField.rotation.y += 0.00015
        standardStarField.rotation.x = Math.sin(seconds * 0.05) * 0.03

        // Gentle camera parallax
        camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.02
        camera.position.y += (pointer.y * -0.3 - camera.position.y) * 0.02
        camera.position.z += (7 - camera.position.z) * 0.03
        camera.lookAt(0, 0, 0)

        if (driftGeometry && driftSlides.length > 0) {
          const posAttr = driftGeometry.attributes.position!
          const colAttr = driftGeometry.attributes.color!
          const positions = posAttr.array as Float32Array
          const colors = colAttr.array as Float32Array
          const slide = driftSlides[activeDriftIndex()]!
          const lerpSpeed = reduceMotion ? 0.08 : 0.045

          if (driftState === 'forming') {
            driftProgress += DRIFT_FORM_SPEED
            if (driftProgress >= 1) {
              driftState = 'idle'
              driftProgress = 1
            }
            driftGroup.rotation.y += (0 - driftGroup.rotation.y) * 0.04

            for (let i = 0; i < DRIFT_PARTICLE_COUNT; i++) {
              const i3 = i * 3
              if (i < slide.textCount) {
                positions[i3]! += (slide.textPositions[i3]! - positions[i3]!) * lerpSpeed
                positions[i3 + 1]! +=
                  (slide.textPositions[i3 + 1]! - positions[i3 + 1]!) * lerpSpeed
                positions[i3 + 2]! +=
                  (slide.textPositions[i3 + 2]! - positions[i3 + 2]!) * lerpSpeed
                colors[i3]! += (slide.textColors[i3]! - colors[i3]!) * lerpSpeed
                colors[i3 + 1]! +=
                  (slide.textColors[i3 + 1]! - colors[i3 + 1]!) * lerpSpeed
                colors[i3 + 2]! +=
                  (slide.textColors[i3 + 2]! - colors[i3 + 2]!) * lerpSpeed
              } else {
                // Ambient cloud particles
                positions[i3]! +=
                  (driftCloudPositions[i3]! - positions[i3]!) * 0.008
                positions[i3 + 1]! +=
                  (driftCloudPositions[i3 + 1]! - positions[i3 + 1]!) * 0.008
                positions[i3 + 2]! +=
                  (driftCloudPositions[i3 + 2]! - positions[i3 + 2]!) * 0.008
                positions[i3]! += Math.sin(seconds * 0.15 + i) * 0.002
                positions[i3 + 1]! += Math.cos(seconds * 0.12 + i * 0.7) * 0.002
                colors[i3]! += (0.15 - colors[i3]!) * 0.02
                colors[i3 + 1]! += (0.2 - colors[i3 + 1]!) * 0.02
                colors[i3 + 2]! += (0.35 - colors[i3 + 2]!) * 0.02
              }
            }
          } else if (driftState === 'dissolving') {
            driftProgress += DRIFT_DISSOLVE_SPEED
            if (driftProgress >= 1) {
              driftState = 'forming'
              driftProgress = 0
            }

            // Spin during dissolve
            if (!isDriftDragging) {
              driftGroup.rotation.y += driftSpinVelocity
              driftSpinVelocity *= 0.985
            }

            // Scatter all particles to cloud
            for (let i = 0; i < DRIFT_PARTICLE_COUNT; i++) {
              const i3 = i * 3
              const speed = 0.025 + (i % 7) * 0.005
              positions[i3]! += (driftCloudPositions[i3]! - positions[i3]!) * speed
              positions[i3 + 1]! +=
                (driftCloudPositions[i3 + 1]! - positions[i3 + 1]!) * speed
              positions[i3 + 2]! +=
                (driftCloudPositions[i3 + 2]! - positions[i3 + 2]!) * speed
              // Fade to ambient color
              colors[i3]! += (0.2 - colors[i3]!) * 0.03
              colors[i3 + 1]! += (0.28 - colors[i3 + 1]!) * 0.03
              colors[i3 + 2]! += (0.5 - colors[i3 + 2]!) * 0.03
            }
          } else {
            // Idle — subtle breathing
            if (!isDriftDragging) {
              driftGroup.rotation.y += (0 - driftGroup.rotation.y) * 0.03
            }

            for (let i = 0; i < DRIFT_PARTICLE_COUNT; i++) {
              const i3 = i * 3
              if (i < slide.textCount) {
                positions[i3]! +=
                  (slide.textPositions[i3]! - positions[i3]!) * 0.06
                positions[i3 + 1]! +=
                  (slide.textPositions[i3 + 1]! - positions[i3 + 1]!) * 0.06
                positions[i3 + 2]! =
                  slide.textPositions[i3 + 2]! +
                  Math.sin(seconds * 0.4 + i * 0.008) * 0.015
                colors[i3]! += (slide.textColors[i3]! - colors[i3]!) * 0.04
                colors[i3 + 1]! +=
                  (slide.textColors[i3 + 1]! - colors[i3 + 1]!) * 0.04
                colors[i3 + 2]! +=
                  (slide.textColors[i3 + 2]! - colors[i3 + 2]!) * 0.04
              } else {
                positions[i3]! += Math.sin(seconds * 0.2 + i) * 0.001
                positions[i3 + 1]! += Math.cos(seconds * 0.15 + i * 0.7) * 0.001
                positions[i3 + 2]! += Math.sin(seconds * 0.25 + i * 1.3) * 0.001
              }
            }
          }

          posAttr.needsUpdate = true
          colAttr.needsUpdate = true
        }
      }

      renderer.render(scene, camera)
    }

    rebuildScene()
    frameId = requestAnimationFrame(animate)

    createEffect(() => {
      props.environment
      props.documentModel
      rebuildScene()
    })

    onCleanup(() => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      host.removeEventListener('pointermove', handlePointerMove)
      host.removeEventListener('pointerleave', resetPointer)
      host.removeEventListener('click', handleCanvasClick)
      host.removeEventListener('pointerdown', handleDriftPointerDown)
      host.removeEventListener('pointerup', handleDriftPointerUp)
      document.removeEventListener('keydown', handleKeyDown)
      reducedMotionQuery?.removeEventListener?.('change', handleReducedMotionChange)
      clearGroup(stage)
      disposeRenderable(standardStarField)
      disposeRenderable(cosmosStarField)
      renderer.dispose()
      preparedCache.clear()
      preparedCacheDocId = null
      clearPretextCache()
      host.textContent = ''
    })
  })

  return (
    <div class="scene-shell">
      <div ref={host} class="scene-canvas" />

      <Show when={props.environment === 'space' && orbitFocusLabel()}>
        <div class="orbit-focus-bar" aria-live="polite">
          <span class="orbit-focus-label">{orbitFocusLabel()}</span>
          <span class="orbit-focus-hint">Esc to return · arrows to navigate</span>
        </div>
      </Show>

      <Show when={props.environment === 'cosmos' && props.documentModel.blocks.length > 0}>
        <div class="cosmos-overlay">
          <CosmosCard
            block={props.documentModel.blocks[activeCosmosIndex()]}
            blocks={props.documentModel.blocks}
            index={activeCosmosIndex()}
          />
          <div class="scene-controls">
            <button
              type="button"
              class="scene-next"
              onClick={() => moveCosmosIndex(1)}
            >
              {activeCosmosIndex() + 1 < props.documentModel.blocks.length
                ? 'Next'
                : 'Restart'}
            </button>
            <div class="scene-progress" aria-live="polite">
              <span class="scene-progress-current">
                {formatSlideNumber(activeCosmosIndex() + 1)}
              </span>
              <span class="scene-progress-divider">/</span>
              <span class="scene-progress-total">
                {formatSlideNumber(props.documentModel.blocks.length)}
              </span>
            </div>
          </div>
        </div>
      </Show>

      <Show when={props.environment === 'drift' && props.documentModel.blocks.length > 0}>
        <div class="drift-overlay">
          <div class="drift-label" aria-live="polite">{driftLabel()}</div>
          <div class="scene-controls">
            <button
              type="button"
              class="scene-next"
              onClick={() => triggerDriftTransitionRef?.(1)}
            >
              {activeDriftIndex() + 1 < props.documentModel.blocks.length
                ? 'Next'
                : 'Restart'}
            </button>

            <div class="scene-progress" aria-live="polite">
              <span class="scene-progress-current">
                {formatSlideNumber(activeDriftIndex() + 1)}
              </span>
              <span class="scene-progress-divider">/</span>
              <span class="scene-progress-total">
                {formatSlideNumber(props.documentModel.blocks.length)}
              </span>
            </div>
          </div>
          <div class="drift-hint">Drag to spin · release to advance</div>
        </div>
      </Show>
    </div>
  )
}

function CosmosCard(props: {
  block: BlogBlock | undefined
  blocks: BlogBlock[]
  index: number
}) {
  return (
    <Show when={props.block} keyed>
      {(block) => (
        <CosmosCardInner
          block={block}
          contextBefore={getFormulaContext(props.blocks, props.index, -1)}
          contextAfter={getFormulaContext(props.blocks, props.index, 1)}
        />
      )}
    </Show>
  )
}

function getFormulaContext(
  blocks: BlogBlock[],
  index: number,
  direction: -1 | 1,
): string | null {
  const block = blocks[index]
  if (!block || block.kind !== 'formula') return null
  const neighbor = blocks[index + direction]
  if (!neighbor) return null
  if (neighbor.kind === 'paragraph' || neighbor.kind === 'heading') {
    return neighbor.text.length > 200
      ? neighbor.text.slice(0, 200) + '…'
      : neighbor.text
  }
  return null
}

function CosmosCardInner(props: {
  block: BlogBlock
  contextBefore: string | null
  contextAfter: string | null
}) {
  let contentRef!: HTMLDivElement

  onMount(() => {
    if (props.block.kind === 'formula') {
      try {
        katex.render(props.block.text, contentRef, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
        })
      } catch {
        const code = document.createElement('code')
        code.textContent = props.block.text
        contentRef.appendChild(code)
      }
    } else {
      contentRef.textContent = props.block.text
    }
  })

  return (
    <div
      classList={{
        'cosmos-card': true,
        'cosmos-card-formula': props.block.kind === 'formula',
        'cosmos-card-prose': props.block.kind !== 'formula',
      }}
    >
      <div class="cosmos-card-label">{props.block.label}</div>
      <Show when={props.contextBefore}>
        {(text) => <div class="cosmos-card-context">{text()}</div>}
      </Show>
      <div class="cosmos-card-content" ref={contentRef} />
      <Show when={props.contextAfter}>
        {(text) => <div class="cosmos-card-context">{text()}</div>}
      </Show>
      <Show when={props.block.notes}>
        {(notes) => <div class="cosmos-card-notes">{notes()}</div>}
      </Show>
    </div>
  )
}

function shouldHandleSceneHotkey(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return false
  }

  const target = event.target
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement
  ) {
    return false
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return false
  }

  return true
}

function createContentCard(
  block: BlogBlock,
  index: number,
  environment: BlogEnvironment,
  anisotropy: number,
): SceneCard {
  const palette = palettes[environment]
  const canvas = document.createElement('canvas')
  const metrics = measureCard(block)

  canvas.width = PANEL_PIXEL_WIDTH
  canvas.height = metrics.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context is required to render blog panels.')
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, palette.panel)
  gradient.addColorStop(1, palette.panelSoft)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (environment === 'space') {
    ctx.fillStyle = gradient
    ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16)
    ctx.lineWidth = 2
    ctx.strokeStyle = palette.border
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16)
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(24, 24, canvas.width - 48, canvas.height - 48)
  ctx.clip()

  ctx.fillStyle = palette.accent
  ctx.fillRect(PANEL_PADDING_X, 44, 180, 6)
  ctx.fillStyle = hexToRgba(palette.accentSecondary, 0.18)
  ctx.fillRect(PANEL_PADDING_X + 190, 44, canvas.width - PANEL_PADDING_X * 2 - 230, 6)

  ctx.fillStyle = palette.textSoft
  ctx.font = '600 20px "IBM Plex Sans"'
  ctx.fillText(block.label.toUpperCase(), PANEL_PADDING_X, 88)

  let cursorY = 148

  if (block.kind === 'heading') {
    ctx.fillStyle = palette.text
    ctx.font = '700 46px "Space Grotesk"'
    drawLayoutLines(ctx, metrics.titleLines, PANEL_PADDING_X, cursorY, metrics.titleLineHeight)
    cursorY += metrics.titleLines.height + 28
  } else {
    ctx.fillStyle = palette.text
    ctx.font = '700 30px "Space Grotesk"'
    drawLayoutLines(ctx, metrics.titleLines, PANEL_PADDING_X, cursorY, metrics.titleLineHeight)
    cursorY += metrics.titleLines.height + 18
  }

  if (
    block.kind === 'code' ||
    block.kind === 'diagram' ||
    block.kind === 'table' ||
    block.kind === 'formula'
  ) {
    ctx.fillStyle = palette.codePanel
    ctx.fillRect(
      PANEL_PADDING_X - 24,
      cursorY - 4,
      canvas.width - PANEL_PADDING_X * 2 + 48,
      metrics.bodyLines.height + 36,
    )
    ctx.fillStyle = palette.codeText
  } else if (block.kind === 'quote') {
    ctx.fillStyle = hexToRgba(palette.accent, 0.22)
    ctx.fillRect(PANEL_PADDING_X - 22, cursorY - 10, 6, metrics.bodyLines.height + 18)
    ctx.fillStyle = palette.text
  } else {
    ctx.fillStyle = palette.text
  }

  ctx.font = metrics.bodyFont
  drawLayoutLines(
    ctx,
    metrics.bodyLines,
    PANEL_PADDING_X,
    cursorY + metrics.bodyLineHeight * 0.9,
    metrics.bodyLineHeight,
  )

  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = anisotropy
  texture.colorSpace = THREE.SRGBColorSpace

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.FrontSide,
  })

  const aspect = canvas.height / canvas.width
  const geometry = new THREE.PlaneGeometry(PANEL_WORLD_WIDTH, PANEL_WORLD_WIDTH * aspect)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData = { index, kind: block.kind }

  return {
    mesh,
    basePosition: new THREE.Vector3(),
    baseRotation: new THREE.Euler(),
    baseScale: new THREE.Vector3(1, 1, 1),
  }
}

function measureCard(block: BlogBlock) {
  const contentWidth = PANEL_PIXEL_WIDTH - PANEL_PADDING_X * 2
  const titleText = getCardTitle(block)
  const titleFont =
    block.kind === 'heading'
      ? '700 46px "Space Grotesk"'
      : '700 30px "Space Grotesk"'
  const titleLineHeight = block.kind === 'heading' ? 56 : 38
  const bodyFont =
    block.kind === 'diagram'
      ? '500 20px "IBM Plex Mono"'
      : block.kind === 'code' || block.kind === 'table' || block.kind === 'formula'
      ? '500 24px "IBM Plex Mono"'
      : block.kind === 'quote'
        ? '500 30px "IBM Plex Sans"'
        : '500 28px "IBM Plex Sans"'
  const bodyLineHeight =
    block.kind === 'diagram'
      ? 25
      : block.kind === 'code' || block.kind === 'table' || block.kind === 'formula'
      ? 31
      : block.kind === 'quote'
        ? 38
        : 36

  const titleLines = layoutWithLines(
    getOrPrepare(`${block.id}:title`, titleText, titleFont),
    contentWidth,
    titleLineHeight,
  )

  const bodyLines = layoutWithLines(
    getOrPrepare(`${block.id}:body`, block.text, bodyFont, {
      whiteSpace:
        block.kind === 'code' ||
        block.kind === 'diagram' ||
        block.kind === 'table' ||
        block.kind === 'list' ||
        block.kind === 'formula'
          ? 'pre-wrap'
          : 'normal',
    }),
    contentWidth,
    bodyLineHeight,
  )

  const height =
    PANEL_PADDING_Y * 2 +
    120 +
    titleLines.height +
    bodyLines.height +
    (block.kind === 'code' ||
    block.kind === 'diagram' ||
    block.kind === 'table' ||
    block.kind === 'formula'
      ? 60
      : 28)

  return {
    height: Math.max(420, Math.ceil(height)),
    titleLines,
    bodyLines,
    titleLineHeight,
    bodyLineHeight,
    bodyFont,
  }
}

function getCardTitle(block: BlogBlock): string {
  switch (block.kind) {
    case 'heading':
      return block.text
    case 'paragraph':
      return 'Narrative Frame'
    case 'list':
      return 'Command Strip'
    case 'quote':
      return 'Signal Relay'
    case 'code':
      return block.language ? `${block.language.toUpperCase()} Module` : 'Code Module'
    case 'diagram':
      return block.language ? `${block.language.toUpperCase()} Diagram` : 'Diagram Module'
    case 'table':
      return 'Data Board'
    case 'formula':
      return 'Expression'
  }
}

function drawLayoutLines(
  ctx: CanvasRenderingContext2D,
  layout: ReturnType<typeof layoutWithLines>,
  x: number,
  startY: number,
  lineHeight: number,
) {
  for (const [index, line] of layout.lines.entries()) {
    ctx.fillText(line.text, x, startY + index * lineHeight)
  }
}

function arrangeSpace(cards: SceneCard[], stage: THREE.Group) {
  for (const [index, card] of cards.entries()) {
    const lane = (index % 3) - 1
    const column = Math.floor(index / 3)
    const x = lane * 3.2 + (column % 2 === 0 ? 0.45 : -0.45)
    const y = 2.2 - (index % 4) * 0.88 + (column % 2) * 0.28
    const z = -4.5 - column * 6 - (index % 3) * 0.6

    card.mesh.position.set(x, y, z)
    card.mesh.rotation.set(
      (lane === 0 ? 1 : lane) * 0.04,
      lane === 0 ? 0 : lane * -0.16,
      lane * 0.03,
    )

    card.basePosition.copy(card.mesh.position)
    card.baseRotation.copy(card.mesh.rotation)
    stage.add(card.mesh)
  }
}

function buildDriftSlide(
  block: BlogBlock,
  palette: EnvironmentPalette,
): DriftSlideData {
  const metrics = measureCard(block)
  const canvas = document.createElement('canvas')
  canvas.width = PANEL_PIXEL_WIDTH
  canvas.height = metrics.height
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Label
  ctx.fillStyle = palette.accent
  ctx.font = '600 20px "IBM Plex Sans"'
  ctx.fillText(block.label.toUpperCase(), PANEL_PADDING_X, 88)

  // Title
  let cursorY = 148
  if (block.kind === 'heading') {
    ctx.fillStyle = palette.text
    ctx.font = '700 46px "Space Grotesk"'
    drawLayoutLines(ctx, metrics.titleLines, PANEL_PADDING_X, cursorY, metrics.titleLineHeight)
    cursorY += metrics.titleLines.height + 28
  } else {
    ctx.fillStyle = palette.text
    ctx.font = '700 30px "Space Grotesk"'
    drawLayoutLines(ctx, metrics.titleLines, PANEL_PADDING_X, cursorY, metrics.titleLineHeight)
    cursorY += metrics.titleLines.height + 18
  }

  // Body
  if (
    block.kind === 'code' ||
    block.kind === 'diagram' ||
    block.kind === 'table' ||
    block.kind === 'formula'
  ) {
    ctx.fillStyle = palette.codeText
  } else {
    ctx.fillStyle = palette.text
  }
  ctx.font = metrics.bodyFont
  drawLayoutLines(
    ctx,
    metrics.bodyLines,
    PANEL_PADDING_X,
    cursorY + metrics.bodyLineHeight * 0.9,
    metrics.bodyLineHeight,
  )

  return sampleCanvasToParticles(canvas)
}

function sampleCanvasToParticles(canvas: HTMLCanvasElement): DriftSlideData {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data, width, height } = imageData
  const aspect = height / width
  const worldHeight = DRIFT_WORLD_WIDTH * aspect

  const candidates: Array<{
    x: number; y: number; z: number
    r: number; g: number; b: number
  }> = []

  for (let py = 0; py < height; py += DRIFT_SAMPLE_STEP) {
    for (let px = 0; px < width; px += DRIFT_SAMPLE_STEP) {
      const i = (py * width + px) * 4
      if (data[i + 3]! > 40) {
        candidates.push({
          x: (px / width - 0.5) * DRIFT_WORLD_WIDTH,
          y: -(py / height - 0.5) * worldHeight,
          z: (Math.random() - 0.5) * 0.12,
          r: data[i]! / 255,
          g: data[i + 1]! / 255,
          b: data[i + 2]! / 255,
        })
      }
    }
  }

  // Shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]
  }

  const textCount = Math.min(candidates.length, DRIFT_PARTICLE_COUNT)
  const textPositions = new Float32Array(DRIFT_PARTICLE_COUNT * 3)
  const textColors = new Float32Array(DRIFT_PARTICLE_COUNT * 3)

  for (let i = 0; i < textCount; i++) {
    const c = candidates[i]!
    textPositions[i * 3] = c.x
    textPositions[i * 3 + 1] = c.y
    textPositions[i * 3 + 2] = c.z
    textColors[i * 3] = c.r
    textColors[i * 3 + 1] = c.g
    textColors[i * 3 + 2] = c.b
  }

  // Remaining particles go to ambient cloud
  for (let i = textCount; i < DRIFT_PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 2 + Math.random() * 3.5
    textPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    textPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.5
    textPositions[i * 3 + 2] = r * Math.cos(phi) * 0.6
    textColors[i * 3] = 0.15
    textColors[i * 3 + 1] = 0.22
    textColors[i * 3 + 2] = 0.4
  }

  return { textPositions, textColors, textCount }
}

function createOrbSprite() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const center = size / 2
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.15, 'rgba(255,255,255,0.85)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.25)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function formatSlideNumber(value: number) {
  return value.toString().padStart(2, '0')
}

function createStarField(color: string) {
  const geometry = new THREE.BufferGeometry()
  const count = 1200
  const positions = new Float32Array(count * 3)

  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 90
    positions[index * 3 + 1] = (Math.random() - 0.5) * 45
    positions[index * 3 + 2] = -Math.random() * 130
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color,
    size: 0.08,
    transparent: true,
    opacity: 0.84,
    sizeAttenuation: true,
  })

  return new THREE.Points(geometry, material)
}

function createCosmosStarField() {
  const count = 4000
  const positions = new Float32Array(count * 3)
  const R = 90

  for (let i = 0; i < count; i++) {
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    positions[i * 3] = R * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = R * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = R * Math.cos(phi)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: '#ffffff',
    size: 1,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.88,
  })

  return new THREE.Points(geometry, material)
}

function createNebulaRing(palette: EnvironmentPalette) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.08, 8, 96),
    new THREE.MeshBasicMaterial({
      color: palette.rim,
      transparent: true,
      opacity: 0.22,
    }),
  )

  ring.position.set(0, 0.2, -14)
  ring.rotation.x = Math.PI / 2.2
  return ring
}

function clearGroup(group: THREE.Group) {
  const children = [...group.children]
  for (const child of children) {
    disposeRenderable(child)
    group.remove(child)
  }
}

function disposeRenderable(object: THREE.Object3D) {
  object.traverse((node) => {
    if ('geometry' in node) {
      node.geometry?.dispose?.()
    }

    if ('material' in node) {
      const material = node.material
      if (Array.isArray(material)) {
        for (const entry of material) {
          disposeMaterial(entry)
        }
      } else if (material) {
        disposeMaterial(material)
      }
    }
  })
}

function disposeMaterial(material: THREE.Material) {
  const textureCandidates = [
    'map',
    'alphaMap',
    'emissiveMap',
    'metalnessMap',
    'roughnessMap',
  ] as const

  for (const key of textureCandidates) {
    const texture = material[key]
    texture?.dispose?.()
  }

  material.dispose()
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : normalized

  const numeric = Number.parseInt(value, 16)
  const r = (numeric >> 16) & 255
  const g = (numeric >> 8) & 255
  const b = numeric & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function isBlogEnvironment(value: BlogEnvironment | null): value is BlogEnvironment {
  return value === 'space' || value === 'drift' || value === 'cosmos'
}

function getPalette(environment: BlogEnvironment | null) {
  return palettes[isBlogEnvironment(environment) ? environment : 'space']
}
