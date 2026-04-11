const DB_NAME = 'md23d-local'
const DB_VERSION = 2
const STORE_NAME = 'drafts'
const SESSION_KEY = 'md23d-session-id'

export const MAX_MARKDOWN_CACHE_BYTES = 5 * 1024 * 1024

export interface StoredMarkdownDraft {
  id: string
  sessionId: string
  name: string
  text: string
  size: number
  savedAt: string
}

export interface StoredMarkdownDraftInput {
  id?: string
  name: string
  text: string
  size: number
  savedAt: string
}

export async function initializeDraftSession() {
  if (!canUseIndexedDb() || !canUseSessionStorage()) {
    return null
  }

  const existingSessionId = sessionStorage.getItem(SESSION_KEY)
  if (existingSessionId) {
    return existingSessionId
  }

  const nextSessionId = createSessionId()
  sessionStorage.setItem(SESSION_KEY, nextSessionId)

  // This preserves drafts across refresh in the same tab via sessionStorage,
  // but starts clean when the tab is closed and reopened.
  await clearAllStoredMarkdownDrafts()

  return nextSessionId
}

export async function listStoredMarkdownDrafts(sessionId: string) {
  if (!canUseIndexedDb()) {
    return []
  }

  const db = await openDraftDatabase()

  return new Promise<StoredMarkdownDraft[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const drafts = (request.result as StoredMarkdownDraft[]).filter(
        (draft) => draft.sessionId === sessionId,
      )
      drafts.sort((left, right) => left.savedAt.localeCompare(right.savedAt))
      resolve(drafts)
    }

    request.onerror = () => {
      reject(request.error ?? new Error('Unable to load cached markdown drafts.'))
    }
  })
}

export async function saveStoredMarkdownDraft(
  sessionId: string,
  draft: StoredMarkdownDraftInput,
) {
  if (!canUseIndexedDb()) {
    throw new Error('IndexedDB is not available in this browser.')
  }

  const storedDraft: StoredMarkdownDraft = {
    ...draft,
    id: draft.id ?? createSessionId(),
    sessionId,
  }

  const db = await openDraftDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Unable to save the cached markdown draft.'))
    }

    store.put(storedDraft)
  })

  return storedDraft
}

export function getStoredDraftsSize(drafts: StoredMarkdownDraft[]) {
  return drafts.reduce((total, draft) => total + draft.size, 0)
}

async function clearAllStoredMarkdownDrafts() {
  const db = await openDraftDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => {
      reject(request.error ?? new Error('Unable to clear cached markdown drafts.'))
    }
  })
}

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (database.objectStoreNames.contains(STORE_NAME)) {
        database.deleteObjectStore(STORE_NAME)
      }

      database.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      reject(request.error ?? new Error('Unable to open the local markdown database.'))
    }
  })
}

function createSessionId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function canUseIndexedDb() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'
}
