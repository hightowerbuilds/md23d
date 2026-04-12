import { createFileRoute } from '@tanstack/solid-router'
import {
  For,
  Match,
  Show,
  Suspense,
  Switch,
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

type AppStage = 'home' | 'modes' | 'scene'

function App() {
  const [stage, setStage] = createSignal<AppStage>('home')
  const [sessionId, setSessionId] = createSignal<string | null>(null)
  const [environment, setEnvironment] = createSignal<BlogEnvironment | null>(null)
  const [storedDrafts, setStoredDrafts] = createSignal<StoredMarkdownDraft[]>([])
  const [currentDraftId, setCurrentDraftId] = createSignal<string | null>(null)
  const [documentModel, setDocumentModel] = createSignal<BlogDocument | null>(null)
  const [sourceName, setSourceName] = createSignal('')
  const [loadError, setLoadError] = createSignal('')
  const [uploadState, setUploadState] = createSignal<
    'idle' | 'reading' | 'processing' | 'ready'
  >('idle')
  const [uploadProgress, setUploadProgress] = createSignal(0)

  onMount(async () => {
    try {
      const activeSessionId = await initializeDraftSession()
      if (!activeSessionId) {
        return
      }

      setSessionId(activeSessionId)
      const drafts = await listStoredMarkdownDrafts(activeSessionId)
      setStoredDrafts(drafts)

      if (drafts.length > 0) {
        await selectDraft(drafts[drafts.length - 1]!, 'modes')
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Unable to restore cached markdown drafts.',
      )
    }
  })

  const stageMarkdown = async (input: {
    text: string
    preferredName: string
    size?: number
    nextStage?: AppStage
  }) => {
    const text = input.text.trim()
    if (!text) {
      throw new Error('Unable to read that markdown file.')
    }

    const size = input.size ?? getTextSize(input.text)
    if (size > MAX_MARKDOWN_CACHE_BYTES) {
      throw new Error('Draft exceeds the 5 MB session limit.')
    }

    const activeSessionId = sessionId() ?? (await initializeDraftSession())
    if (!activeSessionId) {
      throw new Error('Session storage is unavailable.')
    }

    const nextTotalSize = getStoredDraftsSize(storedDrafts()) + size
    if (nextTotalSize > MAX_MARKDOWN_CACHE_BYTES) {
      throw new Error('Saving this file would exceed the 5 MB session cache.')
    }

    setSessionId(activeSessionId)
    setLoadError('')
    setEnvironment(null)
    setStage('home')
    setUploadState('processing')
    setUploadProgress(0.45)

    const parsed = parseUploadedDocument(input.text, input.preferredName)
    const savedDraft = await saveStoredMarkdownDraft(activeSessionId, {
      name: input.preferredName || parsed.title,
      text: input.text,
      size,
      savedAt: new Date().toISOString(),
    })

    await waitForFrame()
    setUploadProgress(0.88)

    startTransition(() => {
      setStoredDrafts((drafts) => [...drafts, savedDraft])
      setCurrentDraftId(savedDraft.id)
      setDocumentModel(parsed)
      setSourceName(savedDraft.name)
      setUploadProgress(1)
      setUploadState('ready')
      setStage(input.nextStage ?? 'modes')
    })
  }

  const handleFileSelection = async (file: File | undefined) => {
    if (!file) {
      return
    }

    const previousDocumentModel = documentModel()
    const previousSourceName = sourceName()
    const previousDraftId = currentDraftId()

    try {
      setLoadError('')
      setEnvironment(null)
      setStage('home')
      setUploadState('reading')
      setUploadProgress(0)
      setSourceName(file.name)
      setDocumentModel(null)

      const text = await readFileWithProgress(file, (progress) => {
        setUploadProgress(progress * 0.68)
      })

      await stageMarkdown({
        text,
        preferredName: file.name,
        size: file.size,
      })
    } catch (error) {
      setDocumentModel(previousDocumentModel)
      setSourceName(previousSourceName)
      setCurrentDraftId(previousDraftId)
      setStage('home')
      setUploadProgress(0)
      setUploadState('idle')
      setLoadError(
        error instanceof Error ? error.message : 'Unable to read that markdown file.',
      )
    }
  }

  const returnHome = () => {
    setEnvironment(null)
    setStage('home')
    setLoadError('')
  }

  const handleDraftSelection = async (draft: StoredMarkdownDraft) => {
    const nextStage = environment() && stage() === 'scene' ? 'scene' : 'modes'
    await selectDraft(draft, nextStage)
  }

  const selectDraft = async (draft: StoredMarkdownDraft, nextStage: AppStage) => {
    setLoadError('')
    setUploadState('processing')
    setUploadProgress(0.8)
    setCurrentDraftId(draft.id)
    setSourceName(draft.name)
    await waitForFrame()
    const parsed = parseUploadedDocument(draft.text, draft.name)

    startTransition(() => {
      setDocumentModel(parsed)
      setSourceName(draft.name)
      setUploadProgress(1)
      setUploadState('ready')
      setStage(nextStage)
    })
  }

  return (
    <main class="studio-page">
      <Show
        when={stage() === 'scene' && environment() && documentModel()}
        fallback={
          <section class="landing-shell">
            <Switch>
              <Match when={uploadState() === 'reading'}>
                <div class="progress-shell" aria-live="polite" aria-label="Importing markdown file">
                  <div
                    class="progress-fill"
                    style={{ width: `${Math.max(4, Math.round(uploadProgress() * 100))}%` }}
                  />
                  <div class="progress-copy">
                    <span class="progress-name">{sourceName()}</span>
                    <span class="progress-phase">Reading</span>
                    <span class="progress-percent">
                      {Math.round(uploadProgress() * 100)}%
                    </span>
                  </div>
                </div>
              </Match>

              <Match when={uploadState() === 'processing'}>
                <div class="progress-shell" aria-live="polite" aria-label="Processing markdown file">
                  <div
                    class="progress-fill"
                    style={{ width: `${Math.max(4, Math.round(uploadProgress() * 100))}%` }}
                  />
                  <div class="progress-copy">
                    <span class="progress-name">{sourceName()}</span>
                    <span class="progress-phase">Processing</span>
                    <span class="progress-percent">
                      {Math.round(uploadProgress() * 100)}%
                    </span>
                  </div>
                </div>
              </Match>

              <Match when={stage() === 'modes' && uploadState() === 'ready' && documentModel()}>
                <div class="mode-shell">
                  <p class="eyebrow">Environment</p>
                  <h1>{documentModel()!.title}</h1>
                  <p class="mode-copy">
                    {sourceName()} · {documentModel()!.stats.wordCount} words ·{' '}
                    {documentModel()!.stats.sectionCount} cards
                  </p>

                  <div class="landing-actions">
                    <EnvironmentButton
                      active={false}
                      title="Orbit"
                      onClick={() => {
                        setEnvironment('space')
                        setStage('scene')
                      }}
                    />
                    <EnvironmentButton
                      active={false}
                      title="Runner"
                      onClick={() => {
                        setEnvironment('train')
                        setStage('scene')
                      }}
                    />
                    <EnvironmentButton
                      active={false}
                      title="Cosmos"
                      onClick={() => {
                        setEnvironment('cosmos')
                        setStage('scene')
                      }}
                    />
                  </div>
                </div>
              </Match>

              <Match when={true}>
                <div class="landing-actions">
                  <label class="upload-button upload-button-landing">
                    Upload MD
                    <input
                      type="file"
                      accept=".md,.markdown,text/markdown,text/plain"
                      onChange={(event) =>
                        void handleFileSelection(event.currentTarget.files?.[0])
                      }
                    />
                  </label>

                  <label class="upload-button upload-button-landing">
                    Upload HTML
                    <input
                      type="file"
                      accept=".html,.htm,text/html,application/xhtml+xml"
                      onChange={(event) =>
                        void handleFileSelection(event.currentTarget.files?.[0])
                      }
                    />
                  </label>
                </div>
              </Match>
            </Switch>

            {loadError() ? <p class="inline-error">{loadError()}</p> : null}
          </section>
        }
      >
        <div class="studio-topbar">
          <div class="environment-switch">
            <EnvironmentButton
              active={false}
              title="Return"
              onClick={returnHome}
            />
            <EnvironmentButton
              active={environment() === 'space'}
              title="Orbit"
              onClick={() => {
                setEnvironment('space')
                setStage('scene')
              }}
            />
            <EnvironmentButton
              active={environment() === 'train'}
              title="Runner"
              onClick={() => {
                setEnvironment('train')
                setStage('scene')
              }}
            />
            <EnvironmentButton
              active={environment() === 'cosmos'}
              title="Cosmos"
              onClick={() => {
                setEnvironment('cosmos')
                setStage('scene')
              }}
            />
          </div>
        </div>

        {loadError() ? <p class="inline-error inline-error-top">{loadError()}</p> : null}

        <section class="scene-stage">
          <Suspense fallback={<div class="scene-loading">Loading 3D scene…</div>}>
            <Show when={environment() && documentModel()}>
              <MarkdownScene
                documentModel={documentModel()!}
                environment={environment()}
              />
            </Show>
          </Suspense>
        </section>
      </Show>

      <Show when={storedDrafts().length > 0}>
        <div class="draft-strip" aria-label="Cached markdown files">
          <For each={storedDrafts()}>
            {(draft) => (
              <button
                type="button"
                classList={{
                  'draft-chip': true,
                  'is-active': currentDraftId() === draft.id,
                }}
                onClick={() => void handleDraftSelection(draft)}
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

function EnvironmentButton(props: {
  active: boolean
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      classList={{
        'environment-button': true,
        'is-active': props.active,
      }}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.title}
    </button>
  )
}

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
    if (done) {
      break
    }

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

function getTextSize(text: string) {
  return new Blob([text]).size
}
