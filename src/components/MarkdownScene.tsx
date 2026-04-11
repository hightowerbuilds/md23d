import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext'
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
const RUNNER_VIEW_OFFSET = 5.8
const RUNNER_BASE_SCALE = 1.72

type SceneCard = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  basePosition: THREE.Vector3
  baseRotation: THREE.Euler
  baseScale: THREE.Vector3
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
  train: {
    sceneBackground: '#02050d',
    fog: '#060a13',
    star: '#ffd8ae',
    rim: '#ff8b4a',
    panel: 'rgba(24, 13, 14, 0.94)',
    panelSoft: 'rgba(46, 23, 25, 0.72)',
    border: 'rgba(255, 147, 84, 0.42)',
    text: '#fff3e9',
    textSoft: '#d7b7a0',
    accent: '#ff9d5d',
    accentSecondary: '#ffd36d',
    codePanel: 'rgba(18, 10, 8, 0.96)',
    codeText: '#ffd2ad',
    rail: '#5b2e19',
    railGlow: '#ffb36d',
    floor: '#0b0706',
  },
}

export default function MarkdownScene(props: {
  documentModel: BlogDocument
  environment: BlogEnvironment | null
}) {
  let host!: HTMLDivElement
  const [activeTrainIndex, setActiveTrainIndex] = createSignal(0)
  const moveTrainIndex = (direction: 1 | -1) => {
    setActiveTrainIndex((index) => {
      const total = props.documentModel.blocks.length
      if (total <= 0) {
        return 0
      }

      if (direction > 0) {
        return index + 1 < total ? index + 1 : 0
      }

      return index > 0 ? index - 1 : total - 1
    })
  }

  createEffect(() => {
    props.documentModel
    props.environment
    setActiveTrainIndex(0)
  })

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
    const starField = createStarField(getPalette(props.environment).star)
    const reducedMotionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null

    scene.add(stage)
    scene.add(starField)
    scene.add(new THREE.HemisphereLight('#d4eeff', '#06080d', 1.35))

    const keyLight = new THREE.DirectionalLight('#ffffff', 1.25)
    keyLight.position.set(6, 9, 5)
    scene.add(keyLight)

    const fillLight = new THREE.PointLight('#69ceff', 20, 30, 2)
    fillLight.position.set(-5, 3, 4)
    scene.add(fillLight)

    const pointer = { x: 0, y: 0 }
    let cards: SceneCard[] = []
    let trackLength = 72
    let frameId = 0
    let currentEnvironment = props.environment
    let reduceMotion = reducedMotionQuery?.matches ?? false

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

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

    host.addEventListener('pointermove', handlePointerMove)
    host.addEventListener('pointerleave', resetPointer)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (props.environment !== 'train') {
        return
      }

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement
      ) {
        return
      }

      if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        moveTrainIndex(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        moveTrainIndex(-1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches
    }

    reducedMotionQuery?.addEventListener?.('change', handleReducedMotionChange)

    const rebuildScene = () => {
      if (!isBlogEnvironment(props.environment)) {
        return
      }

      currentEnvironment = props.environment
      trackLength = 72
      clearGroup(stage)

      const palette = palettes[currentEnvironment]
      scene.background = new THREE.Color(palette.sceneBackground)
      scene.fog = new THREE.Fog(palette.fog, 14, currentEnvironment === 'space' ? 72 : 84)
      ;(starField.material as THREE.PointsMaterial).color.set(palette.star)
      starField.position.set(0, 0, 0)
      starField.visible = true
      fillLight.color.set(palette.accent)
      fillLight.intensity = currentEnvironment === 'space' ? 20 : 13

      cards = props.documentModel.blocks.map((block, index) =>
        createContentCard(block, index, currentEnvironment, renderer.capabilities.getMaxAnisotropy()),
      )

      if (currentEnvironment === 'space') {
        arrangeSpace(cards, stage)
        stage.add(createNebulaRing(palette))
      } else {
        trackLength = arrangeTrain(cards, stage)
        stage.add(createRailWorld(trackLength, palette))
      }
    }

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate)

      const seconds = time * 0.001
      if (currentEnvironment === 'space') {
        starField.rotation.y += 0.00025
        starField.rotation.x = Math.sin(seconds * 0.08) * 0.05
      } else {
        starField.rotation.y = 0
        starField.rotation.x = 0
      }

      if (currentEnvironment === 'space') {
        camera.position.x += (pointer.x * 1.9 - camera.position.x) * 0.032
        camera.position.y += (1.4 - pointer.y * 0.7 - camera.position.y) * 0.032
        camera.position.z += (8.8 - camera.position.z) * 0.045
        camera.lookAt(0, 0.7, -9.5)
        stage.rotation.y = Math.sin(seconds * 0.18) * 0.12
        stage.rotation.x = Math.cos(seconds * 0.13) * 0.03

        for (const [index, card] of cards.entries()) {
          card.mesh.position.x =
            card.basePosition.x + Math.cos(seconds * 0.34 + index) * 0.12
          card.mesh.position.y =
            card.basePosition.y + Math.sin(seconds * 0.7 + index * 0.6) * 0.2
          card.mesh.rotation.y =
            card.baseRotation.y + Math.sin(seconds * 0.5 + index * 0.4) * 0.06
          card.mesh.rotation.x =
            card.baseRotation.x + Math.cos(seconds * 0.55 + index * 0.2) * 0.035
        }
      } else {
        const activeCard =
          cards[Math.min(activeTrainIndex(), Math.max(cards.length - 1, 0))] ?? null
        const targetCameraZ = (activeCard?.basePosition.z ?? -12) + RUNNER_VIEW_OFFSET
        const slideFocusZ = camera.position.z - RUNNER_VIEW_OFFSET

        camera.position.x += (0 - camera.position.x) * 0.14
        camera.position.y += (1.82 - camera.position.y) * 0.14
        camera.position.z +=
          (targetCameraZ - camera.position.z) * (reduceMotion ? 0.12 : 0.16)
        camera.lookAt(0, 1.82, camera.position.z - (RUNNER_VIEW_OFFSET + 0.2))
        stage.rotation.y = 0
        stage.rotation.x = 0
        starField.position.z = 0
        starField.position.x = 0

        for (const card of cards) {
          const distanceFromFocus = Math.abs(card.basePosition.z - slideFocusZ)
          const focus = THREE.MathUtils.clamp(1 - distanceFromFocus / 14, 0, 1)
          const passthrough = THREE.MathUtils.clamp(
            1 - Math.abs(card.basePosition.z - camera.position.z) / 1.5,
            0,
            1,
          )

          card.mesh.position.x = card.basePosition.x
          card.mesh.position.y = card.basePosition.y + focus * 0.04
          card.mesh.rotation.y = card.baseRotation.y
          card.mesh.rotation.x = card.baseRotation.x
          card.mesh.scale.setScalar(
            card.baseScale.x * (1 + focus * (reduceMotion ? 0.025 : 0.04)),
          )
          card.mesh.material.opacity = THREE.MathUtils.clamp(
            0.08 + focus * 0.92 - passthrough * 0.72,
            0,
            1,
          )
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
      window.removeEventListener('keydown', handleKeyDown)
      reducedMotionQuery?.removeEventListener?.('change', handleReducedMotionChange)
      clearGroup(stage)
      disposeRenderable(starField)
      renderer.dispose()
      host.textContent = ''
    })
  })

  return (
    <div class="scene-shell">
      <div ref={host} class="scene-canvas" />
      <Show when={props.environment === 'train' && props.documentModel.blocks.length > 0}>
        <div class="scene-controls">
          <button
            type="button"
            class="scene-next"
            onClick={() => moveTrainIndex(1)}
          >
            {activeTrainIndex() + 1 < props.documentModel.blocks.length ? 'Next' : 'Restart'}
          </button>

          <div class="scene-progress" aria-live="polite">
            <span class="scene-progress-current">
              {formatSlideNumber(activeTrainIndex() + 1)}
            </span>
            <span class="scene-progress-divider">/</span>
            <span class="scene-progress-total">
              {formatSlideNumber(props.documentModel.blocks.length)}
            </span>
          </div>
        </div>
      </Show>
    </div>
  )
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

  if (block.kind === 'code' || block.kind === 'diagram' || block.kind === 'table') {
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
    side: environment === 'train' ? THREE.DoubleSide : THREE.FrontSide,
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
      : block.kind === 'code' || block.kind === 'table'
      ? '500 24px "IBM Plex Mono"'
      : block.kind === 'quote'
        ? '500 30px "IBM Plex Sans"'
        : '500 28px "IBM Plex Sans"'
  const bodyLineHeight =
    block.kind === 'diagram'
      ? 25
      : block.kind === 'code' || block.kind === 'table'
      ? 31
      : block.kind === 'quote'
        ? 38
        : 36

  const titleLines = layoutWithLines(
    prepareWithSegments(titleText, titleFont),
    contentWidth,
    titleLineHeight,
  )

  const bodyLines = layoutWithLines(
    prepareWithSegments(block.text, bodyFont, {
      whiteSpace:
        block.kind === 'code' ||
        block.kind === 'diagram' ||
        block.kind === 'table' ||
        block.kind === 'list'
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
    (block.kind === 'code' || block.kind === 'diagram' || block.kind === 'table' ? 60 : 28)

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

function arrangeTrain(
  cards: SceneCard[],
  stage: THREE.Group,
) {
  let cursorZ = -12

  for (const [index, card] of cards.entries()) {
    const kind = card.mesh.userData.kind as BlogBlock['kind']
    const lane = index % 4
    const z = cursorZ
    const x = 0
    const y = 1.78 + (lane === 0 ? 0.18 : lane === 1 ? 0.04 : lane === 2 ? 0.12 : -0.02)
    const scale = getRunnerCardScale(kind) * RUNNER_BASE_SCALE

    card.mesh.position.set(x, y, z)
    card.mesh.rotation.set(0.003, 0, 0)
    card.mesh.scale.setScalar(scale)
    card.basePosition.copy(card.mesh.position)
    card.baseRotation.copy(card.mesh.rotation)
    card.baseScale.copy(card.mesh.scale)
    stage.add(card.mesh)

    cursorZ -= getRunnerCardSpacing(kind)
  }

  return Math.abs(cursorZ) + 38
}

function createRailWorld(trackLength: number, palette: EnvironmentPalette) {
  const world = new THREE.Group()
  const centerZ = -(trackLength - 16) / 2
  const railMaterial = new THREE.MeshStandardMaterial({
    color: palette.rail,
    emissive: palette.railGlow,
    emissiveIntensity: 0.14,
    metalness: 0.78,
    roughness: 0.34,
  })
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: palette.railGlow,
    transparent: true,
    opacity: 0.34,
  })

  const railGeometry = new THREE.BoxGeometry(0.13, 0.13, trackLength + 18)
  const leftRail = new THREE.Mesh(railGeometry, railMaterial)
  leftRail.position.set(-0.82, 0.02, centerZ)
  world.add(leftRail)

  const rightRail = new THREE.Mesh(railGeometry, railMaterial)
  rightRail.position.set(0.82, 0.02, centerZ)
  world.add(rightRail)

  const leftRailGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, trackLength + 18),
    glowMaterial,
  )
  leftRailGlow.position.set(-0.82, 0.16, centerZ)
  world.add(leftRailGlow)

  const rightRailGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, trackLength + 18),
    glowMaterial,
  )
  rightRailGlow.position.set(0.82, 0.16, centerZ)
  world.add(rightRailGlow)

  return world
}

function getRunnerCardScale(kind: BlogBlock['kind']) {
  switch (kind) {
    case 'heading':
      return 1.16
    case 'quote':
      return 1.08
    case 'code':
    case 'diagram':
    case 'table':
      return 0.92
    default:
      return 1
  }
}

function getRunnerCardSpacing(kind: BlogBlock['kind']) {
  switch (kind) {
    case 'heading':
      return 16.8
    case 'quote':
      return 15
    case 'code':
    case 'diagram':
    case 'table':
      return 14.4
    default:
      return 13.6
  }
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
  return value === 'space' || value === 'train'
}

function getPalette(environment: BlogEnvironment | null) {
  return palettes[isBlogEnvironment(environment) ? environment : 'space']
}
