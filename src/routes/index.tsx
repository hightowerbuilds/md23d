import { createFileRoute } from '@tanstack/solid-router'
import {
  For,
  Show,
  Suspense,
  createSignal,
  lazy,
  onMount,
  startTransition,
} from 'solid-js'

import {
  MAX_MARKDOWN_CACHE_BYTES,
  getStoredDraftsSize,
  initializeDraftSession,
  listStoredMarkdownDrafts,
  saveStoredMarkdownDraft,
  type StoredMarkdownDraft,
} from '../lib/blog/localDraftStorage'
import { parseUploadedDocument } from '../lib/blog/parseUploadedDocument'
import type { BlogDocument, BlogEnvironment } from '../lib/blog/types'

export const Route = createFileRoute('/')({ component: App })

const MarkdownScene = lazy(() => import('../components/MarkdownScene'))
const BlueprintScene = lazy(() => import('../components/BlueprintScene'))

type SceneEnvironment = 'space' | 'drift' | 'cosmos' | 'blueprint'

// ── state shape ──────────────────────────────────────────────────

interface ActiveDoc {
  id: string
  name: string
  model: BlogDocument
}

interface UploadProgress {
  name: string
  phase: 'reading' | 'processing'
  progress: number
}

// ── component ────────────────────────────────────────────────────

function App() {
  // Core state — two independent axes
  const [activeDoc, setActiveDoc] = createSignal<ActiveDoc | null>(null)
  const [environment, setEnvironment] = createSignal<SceneEnvironment | null>(null)

  // Upload (transient)
  const [uploading, setUploading] = createSignal<UploadProgress | null>(null)

  // Draft persistence
  const [sessionId, setSessionId] = createSignal<string | null>(null)
  const [drafts, setDrafts] = createSignal<StoredMarkdownDraft[]>([])

  // Errors
  const [error, setError] = createSignal('')

  // Derived: are we in a scene?
  const inScene = () => activeDoc() !== null && environment() !== null

  // ── session init ───────────────────────────────────────────────

  onMount(async () => {
    try {
      const sid = await initializeDraftSession()
      if (!sid) return
      setSessionId(sid)

      const stored = await listStoredMarkdownDrafts(sid)
      setDrafts(stored)

      // Auto-load most recent draft
      if (stored.length > 0) {
        loadDraft(stored[stored.length - 1]!)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to restore cached drafts.')
    }
  })

  // ── document loading ───────────────────────────────────────────

  function loadDraft(draft: StoredMarkdownDraft) {
    const parsed = parseUploadedDocument(draft.text, draft.name)
    setActiveDoc({ id: draft.id, name: draft.name, model: parsed })
    setError('')
  }

  async function handleFileUpload(file: File | undefined) {
    if (!file) return

    const prev = activeDoc()

    try {
      setError('')
      setUploading({ name: file.name, phase: 'reading', progress: 0 })

      const text = await readFileWithProgress(file, (p) => {
        setUploading({ name: file.name, phase: 'reading', progress: p * 0.68 })
      })

      if (!text.trim()) throw new Error('File is empty.')

      const size = file.size
      if (size > MAX_MARKDOWN_CACHE_BYTES) throw new Error('File exceeds the 5 MB limit.')

      setUploading({ name: file.name, phase: 'processing', progress: 0.7 })

      const sid = sessionId() ?? (await initializeDraftSession())
      if (!sid) throw new Error('Session storage is unavailable.')
      setSessionId(sid)

      const totalSize = getStoredDraftsSize(drafts()) + size
      if (totalSize > MAX_MARKDOWN_CACHE_BYTES) {
        throw new Error('Adding this file would exceed the 5 MB session cache.')
      }

      const parsed = parseUploadedDocument(text, file.name)
      const saved = await saveStoredMarkdownDraft(sid, {
        name: file.name,
        text,
        size,
        savedAt: new Date().toISOString(),
      })

      setUploading({ name: file.name, phase: 'processing', progress: 0.95 })
      await waitForFrame()

      startTransition(() => {
        setDrafts((d) => [...d, saved])
        setActiveDoc({ id: saved.id, name: saved.name, model: parsed })
        setUploading(null)
      })
    } catch (e) {
      if (prev) setActiveDoc(prev)
      setUploading(null)
      setError(e instanceof Error ? e.message : 'Unable to read that file.')
    }
  }

  // ── actions ────────────────────────────────────────────────────

  function enterEnvironment(env: SceneEnvironment) {
    setEnvironment(env)
  }

  function exitScene() {
    setEnvironment(null)
  }

  function selectDraft(draft: StoredMarkdownDraft) {
    loadDraft(draft)
  }

  // ── render ─────────────────────────────────────────────────────

  return (
    <main class="studio-page">
      <Show
        when={inScene()}
        fallback={
          <section class="landing-shell">
            {/* Upload buttons — always visible */}
            <div class="landing-actions">
              <label class="upload-button upload-button-landing">
                Upload MD
                <input
                  type="file"
                  accept=".md,.markdown,text/markdown,text/plain"
                  onChange={(e) => void handleFileUpload(e.currentTarget.files?.[0])}
                />
              </label>

              <label class="upload-button upload-button-landing">
                Upload HTML
                <input
                  type="file"
                  accept=".html,.htm,text/html,application/xhtml+xml"
                  onChange={(e) => void handleFileUpload(e.currentTarget.files?.[0])}
                />
              </label>
            </div>

            {/* Upload progress */}
            <Show when={uploading()}>
              {(up) => (
                <div class="progress-shell" aria-live="polite">
                  <div
                    class="progress-fill"
                    style={{ width: `${Math.max(4, Math.round(up().progress * 100))}%` }}
                  />
                  <div class="progress-copy">
                    <span class="progress-name">{up().name}</span>
                    <span class="progress-phase">
                      {up().phase === 'reading' ? 'Reading' : 'Processing'}
                    </span>
                    <span class="progress-percent">
                      {Math.round(up().progress * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </Show>

            {/* Environment picker — shows when a document is loaded */}
            <Show when={activeDoc()}>
              {(doc) => (
                <div class="mode-shell">
                  <p class="eyebrow">Environment</p>
                  <h1>{doc().model.title}</h1>
                  <p class="mode-copy">
                    {doc().name} · {doc().model.stats.wordCount} words ·{' '}
                    {doc().model.stats.sectionCount} cards
                  </p>

                  <div class="landing-actions">
                    <EnvironmentButton title="Orbit" onClick={() => enterEnvironment('space')} />
                    <EnvironmentButton title="Drift" onClick={() => enterEnvironment('drift')} />
                    <EnvironmentButton title="Cosmos" onClick={() => enterEnvironment('cosmos')} />
                    <EnvironmentButton title="Blueprint" onClick={() => enterEnvironment('blueprint')} />
                  </div>
                </div>
              )}
            </Show>

            {error() ? <p class="inline-error">{error()}</p> : null}
          </section>
        }
      >
        {/* Scene mode — environment switcher + 3D scene */}
        <div class="studio-topbar">
          <div class="environment-switch">
            <EnvironmentButton title="Return" onClick={exitScene} />
            <EnvironmentButton title="Orbit" active={environment() === 'space'} onClick={() => enterEnvironment('space')} />
            <EnvironmentButton title="Drift" active={environment() === 'drift'} onClick={() => enterEnvironment('drift')} />
            <EnvironmentButton title="Cosmos" active={environment() === 'cosmos'} onClick={() => enterEnvironment('cosmos')} />
            <EnvironmentButton title="Blueprint" active={environment() === 'blueprint'} onClick={() => enterEnvironment('blueprint')} />
          </div>
        </div>

        {error() ? <p class="inline-error inline-error-top">{error()}</p> : null}

        <section class="scene-stage">
          <Suspense fallback={<div class="scene-loading">Loading 3D scene...</div>}>
            <Show when={activeDoc()}>
              {(doc) =>
                environment() === 'blueprint' ? (
                  <BlueprintScene documentModel={doc().model} />
                ) : (
                  <MarkdownScene
                    documentModel={doc().model}
                    environment={environment() as BlogEnvironment}
                  />
                )
              }
            </Show>
          </Suspense>
        </section>
      </Show>

      {/* Draft strip — always visible when drafts exist */}
      <Show when={drafts().length > 0}>
        <div class="draft-strip" aria-label="Cached markdown files">
          <For each={drafts()}>
            {(draft) => (
              <button
                type="button"
                classList={{
                  'draft-chip': true,
                  'is-active': activeDoc()?.id === draft.id,
                }}
                onClick={() => selectDraft(draft)}
              >
                {draft.name}
              </button>
            )}
          </For>
        </div>
      </Show>
    </main>
  )
}

// ── small components ─────────────────────────────────────────────

function EnvironmentButton(props: {
  title: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      classList={{
        'environment-button': true,
        'is-active': props.active ?? false,
      }}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.title}
    </button>
  )
}

// ── utilities ────────────────────────────────────────────────────

async function readFileWithProgress(
  file: File,
  onProgress: (progress: number) => void,
) {
  if (typeof file.stream !== 'function' || file.size === 0) {
    const text = await file.text()
    onProgress(1)
    return text
  }

  const reader = file.stream().getReader()
  const decoder = new TextDecoder()
  let loaded = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    loaded += value.byteLength
    text += decoder.decode(value, { stream: true })
    onProgress(loaded / file.size)
  }

  text += decoder.decode()
  onProgress(1)
  return text
}

function waitForFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}
