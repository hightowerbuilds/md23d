import { createFileRoute } from '@tanstack/solid-router'
import {
  For,
  Match,
  Show,
  Suspense,
  Switch,
  createMemo,
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
import { parseMarkdownDocument } from '../lib/blog/parseMarkdown'
import { sampleMarkdown } from '../lib/blog/sampleMarkdown'
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
  const [markdown, setMarkdown] = createSignal('')
  const [documentModel, setDocumentModel] = createSignal<BlogDocument | null>(null)
  const [sourceName, setSourceName] = createSignal('')
  const [loadError, setLoadError] = createSignal('')
  const [uploadState, setUploadState] = createSignal<
    'idle' | 'reading' | 'processing' | 'ready'
  >('idle')
  const [uploadProgress, setUploadProgress] = createSignal(0)

  const currentDraft = createMemo(
    () => storedDrafts().find((draft) => draft.id === currentDraftId()) ?? null,
  )
  const composerStats = createMemo(() => {
    const source = markdown().trim()
    return source ? parseMarkdownDocument(source).stats : null
  })
  const draftNamePreview = createMemo(() =>
    deriveDraftName(markdown(), currentDraft()?.name ?? sourceName()),
  )

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
    draftId?: string | null
    nextStage?: AppStage
  }) => {
    const text = input.text.trim()
    if (!text) {
      throw new Error('Enter markdown or upload a file first.')
    }

    const size = input.size ?? getTextSize(input.text)
    if (size > MAX_MARKDOWN_CACHE_BYTES) {
      throw new Error('Draft exceeds the 5 MB session limit.')
    }

    const activeSessionId = sessionId() ?? (await initializeDraftSession())
    if (!activeSessionId) {
      throw new Error('Session storage is unavailable.')
    }

    const replacedSize =
      input.draftId != null
        ? storedDrafts().find((draft) => draft.id === input.draftId)?.size ?? 0
        : 0
    const nextTotalSize = getStoredDraftsSize(storedDrafts()) - replacedSize + size
    if (nextTotalSize > MAX_MARKDOWN_CACHE_BYTES) {
      throw new Error('Saving this draft would exceed the 5 MB session cache.')
    }

    setSessionId(activeSessionId)
    setLoadError('')
    setEnvironment(null)
    setStage('home')
    setUploadState('processing')
    setUploadProgress(0.45)

    const parsed = parseMarkdownDocument(input.text)
    const savedDraft = await saveStoredMarkdownDraft(activeSessionId, {
      id: input.draftId ?? undefined,
      name: deriveDraftName(input.text, input.preferredName || parsed.title),
      text: input.text,
      size,
      savedAt: new Date().toISOString(),
    })

    await waitForFrame()
    setUploadProgress(0.88)

    startTransition(() => {
      setStoredDrafts((drafts) => upsertDraft(drafts, savedDraft))
      setCurrentDraftId(savedDraft.id)
      setMarkdown(input.text)
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

    const previousMarkdown = markdown()
    const previousDocumentModel = documentModel()
    const previousSourceName = sourceName()

    try {
      setLoadError('')
      setEnvironment(null)
      setStage('home')
      setUploadState('reading')
      setUploadProgress(0)
      setSourceName(file.name)
      setMarkdown('')
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
      setMarkdown(previousMarkdown)
      setDocumentModel(previousDocumentModel)
      setSourceName(previousSourceName)
      setStage('home')
      setUploadProgress(0)
      setUploadState('idle')
      setLoadError(
        error instanceof Error ? error.message : 'Unable to read that markdown file.',
      )
    }
  }

  const handleComposerLaunch = async () => {
    try {
      await stageMarkdown({
        text: markdown(),
        preferredName: draftNamePreview(),
        draftId: currentDraftId(),
      })
    } catch (error) {
      setUploadProgress(0)
      setUploadState('idle')
      setLoadError(
        error instanceof Error ? error.message : 'Unable to stage that markdown draft.',
      )
    }
  }

  const handleUseSample = () => {
    setLoadError('')
    setCurrentDraftId(null)
    setSourceName('sample-orbit-log.md')
    setMarkdown(sampleMarkdown)
    setDocumentModel(null)
    setUploadState('idle')
    setStage('home')
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
    const parsed = parseMarkdownDocument(draft.text)

    startTransition(() => {
      setMarkdown(draft.text)
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
                    <span class="progress-name">{sourceName() || draftNamePreview()}</span>
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
                  </div>
                </div>
              </Match>

              <Match when={true}>
                <div class="composer-shell">
                  <div class="composer-header">
                    <p class="eyebrow">Authoring</p>
                    <h1>Write the scene in markdown.</h1>
                    <p class="composer-copy">
                      Compose directly in the browser or upload a <code>.md</code> file, then
                      send the same document through the 3D pipeline.
                    </p>
                  </div>

                  <div class="composer-actions">
                    <button
                      type="button"
                      class="environment-button"
                      onClick={handleUseSample}
                    >
                      Use Sample
                    </button>
                    <button
                      type="button"
                      class="environment-button"
                      disabled={!markdown().trim()}
                      onClick={() => void handleComposerLaunch()}
                    >
                      Stage Draft
                    </button>
                    <label class="upload-button upload-button-muted">
                      Upload MD
                      <input
                        type="file"
                        accept=".md,.markdown,text/markdown,text/plain"
                        onChange={(event) =>
                          void handleFileSelection(event.currentTarget.files?.[0])
                        }
                      />
                    </label>
                  </div>

                  <Show when={composerStats()}>
                    <div class="composer-meta">
                      <span>{draftNamePreview()}</span>
                      <span>{composerStats()!.wordCount} words</span>
                      <span>{composerStats()!.sectionCount} cards</span>
                      <span>{composerStats()!.readingMinutes} min read</span>
                    </div>
                  </Show>

                  <textarea
                    class="markdown-editor"
                    value={markdown()}
                    onInput={(event) => {
                      setLoadError('')
                      setMarkdown(event.currentTarget.value)
                      setUploadState('idle')
                      setStage('home')
                    }}
                    placeholder={`# Untitled Flight

Write a heading, a few paragraphs, and maybe a code block.

\`\`\`ts
const world = buildScene(documentModel, 'space')
\`\`\``}
                    spellcheck={false}
                  />
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
                  'is-active': currentDraft()?.id === draft.id,
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

function upsertDraft(
  drafts: StoredMarkdownDraft[],
  savedDraft: StoredMarkdownDraft,
) {
  const nextDrafts = drafts.some((draft) => draft.id === savedDraft.id)
    ? drafts.map((draft) => (draft.id === savedDraft.id ? savedDraft : draft))
    : [...drafts, savedDraft]

  return [...nextDrafts].sort((left, right) => left.savedAt.localeCompare(right.savedAt))
}

function deriveDraftName(markdown: string, fallbackName?: string) {
  const headingMatch = markdown.match(/^\s*#\s+(.+)$/m)
  const baseName =
    headingMatch?.[1]?.trim() ||
    stripMarkdownExtension(fallbackName?.trim() || '') ||
    'Untitled Flight'

  const sanitized = baseName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${sanitized || 'Untitled Flight'}.md`
}

function stripMarkdownExtension(value: string) {
  return value.replace(/\.(md|markdown)$/i, '')
}

function getTextSize(text: string) {
  return new Blob([text]).size
}
