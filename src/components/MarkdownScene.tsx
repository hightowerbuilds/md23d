import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext'
import { createEffect, onCleanup, onMount } from 'solid-js'
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

type SceneCard = {
  mesh: THREE.Mesh
  basePosition: THREE.Vector3
  baseRotation: THREE.Euler
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
    sceneBackground: '#130b08',
    fog: '#1b100c',
    star: '#ffd4a4',
    rim: '#ff8b4a',
    panel: 'rgba(30, 16, 11, 0.94)',
    panelSoft: 'rgba(63, 28, 17, 0.72)',
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
      fillLight.color.set(palette.accent)
      fillLight.intensity = currentEnvironment === 'space' ? 20 : 13

      cards = props.documentModel.blocks.map((block, index) =>
        createContentCard(block, index, currentEnvironment, renderer.capabilities.getMaxAnisotropy()),
      )

      if (currentEnvironment === 'space') {
        arrangeSpace(cards, stage)
        stage.add(createNebulaRing(palette))
      } else {
        trackLength = arrangeTrain(cards, stage, palette)
        stage.add(createRailWorld(trackLength, palette))
      }
    }

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate)

      const seconds = time * 0.001
      starField.rotation.y += currentEnvironment === 'space' ? 0.00025 : 0.00008
      starField.rotation.x = Math.sin(seconds * 0.08) * 0.05

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
        const travel = (seconds * 6.4) % trackLength
        camera.position.x += (pointer.x * 0.45 - camera.position.x) * 0.03
        camera.position.y += (1.8 - pointer.y * 0.14 - camera.position.y) * 0.05
        camera.position.z = 8 - travel
        camera.lookAt(camera.position.x * 0.2, 1.35, camera.position.z - 13)
        stage.rotation.y = 0
        stage.rotation.x = 0

        for (const [index, card] of cards.entries()) {
          card.mesh.position.y =
            card.basePosition.y + Math.sin(seconds * 1.1 + index * 0.45) * 0.06
          card.mesh.rotation.y = card.baseRotation.y
          card.mesh.rotation.x =
            card.baseRotation.x + Math.sin(seconds * 0.5 + index) * 0.01
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
      clearGroup(stage)
      disposeRenderable(starField)
      renderer.dispose()
      host.textContent = ''
    })
  })

  return (
    <div class="scene-shell">
      <div ref={host} class="scene-canvas" />
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
  ctx.fillStyle = gradient
  ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16)
  ctx.lineWidth = 2
  ctx.strokeStyle = palette.border
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16)

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
  })

  const aspect = canvas.height / canvas.width
  const geometry = new THREE.PlaneGeometry(PANEL_WORLD_WIDTH, PANEL_WORLD_WIDTH * aspect)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData = { index, kind: block.kind }

  return {
    mesh,
    basePosition: new THREE.Vector3(),
    baseRotation: new THREE.Euler(),
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
  palette: EnvironmentPalette,
) {
  const postMaterial = new THREE.MeshStandardMaterial({
    color: palette.rail,
    emissive: palette.railGlow,
    emissiveIntensity: 0.16,
    metalness: 0.62,
    roughness: 0.44,
  })

  const beamGeometry = new THREE.BoxGeometry(0.12, 3.6, 0.12)
  const braceGeometry = new THREE.BoxGeometry(1.8, 0.08, 0.08)

  for (const [index, card] of cards.entries()) {
    const side = index % 2 === 0 ? 1 : -1
    const z = -16 - index * 11.5
    const x = side * 4.8
    const y = 2.25 + (index % 3) * 0.16

    card.mesh.position.set(x, y, z)
    card.mesh.rotation.set(0.01, side > 0 ? -0.72 : 0.72, 0)
    card.basePosition.copy(card.mesh.position)
    card.baseRotation.copy(card.mesh.rotation)
    stage.add(card.mesh)

    const post = new THREE.Mesh(beamGeometry, postMaterial)
    post.position.set(x * 0.78, 0.95, z)
    stage.add(post)

    const brace = new THREE.Mesh(braceGeometry, postMaterial)
    brace.position.set(x * 0.88, 2.62, z)
    brace.rotation.z = side > 0 ? 0.2 : -0.2
    stage.add(brace)
  }

  return cards.length * 11.5 + 42
}

function createRailWorld(trackLength: number, palette: EnvironmentPalette) {
  const world = new THREE.Group()
  const railMaterial = new THREE.MeshStandardMaterial({
    color: palette.rail,
    emissive: palette.railGlow,
    emissiveIntensity: 0.14,
    metalness: 0.78,
    roughness: 0.34,
  })
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: palette.floor,
    roughness: 0.95,
    metalness: 0.08,
  })
  const sleeperMaterial = new THREE.MeshStandardMaterial({
    color: '#24130d',
    roughness: 0.96,
  })

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, trackLength + 60), floorMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(0, -0.08, -(trackLength - 16) / 2)
  world.add(ground)

  const railGeometry = new THREE.BoxGeometry(0.12, 0.12, trackLength + 18)
  const leftRail = new THREE.Mesh(railGeometry, railMaterial)
  leftRail.position.set(-0.82, 0.05, -(trackLength - 16) / 2)
  world.add(leftRail)

  const rightRail = new THREE.Mesh(railGeometry, railMaterial)
  rightRail.position.set(0.82, 0.05, -(trackLength - 16) / 2)
  world.add(rightRail)

  const sleeperGeometry = new THREE.BoxGeometry(2.3, 0.08, 0.4)
  const sleeperCount = Math.ceil(trackLength / 2.2)
  for (let index = 0; index < sleeperCount; index += 1) {
    const sleeper = new THREE.Mesh(sleeperGeometry, sleeperMaterial)
    sleeper.position.set(0, 0, -index * 2.2 - 8)
    world.add(sleeper)
  }

  const frameGeometry = new THREE.TorusGeometry(5.2, 0.05, 12, 44, Math.PI)
  const frameMaterial = new THREE.MeshBasicMaterial({
    color: palette.railGlow,
    transparent: true,
    opacity: 0.18,
  })

  const frameCount = Math.ceil(trackLength / 14)
  for (let index = 0; index < frameCount; index += 1) {
    const frame = new THREE.Mesh(frameGeometry, frameMaterial)
    frame.rotation.y = Math.PI
    frame.position.set(0, 0.25, -index * 14 - 8)
    world.add(frame)
  }

  return world
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
