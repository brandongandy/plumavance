import { RecordWordCountEventRequestSchema } from '@pluma/shared'
import { z } from 'zod'

export const legacyQueueKey = 'pluma.word-count.pending.v1'
export const outboxChangedKey = 'pluma.word-count.outbox.changed'
const BatchSchema = RecordWordCountEventRequestSchema.extend({
  projectId: z.string(),
  baselineDailyWordCount: z.number().int().optional(),
})
const QueueSchema = z.object({ inFlight: BatchSchema.nullable(), pending: z.array(BatchSchema) })
export type Batch = Readonly<z.infer<typeof BatchSchema>>
export type Outbox = z.infer<typeof QueueSchema>

export function eventUuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// One transient queue, with browser transactions serializing changes across tabs.
// Pending batches coalesce; only the transaction that promotes one may freeze its payload.
export async function updateOutbox(change: (queue: Outbox) => void = () => {}): Promise<Outbox> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pluma-word-count-outbox', 1)
    request.onupgradeneeded = () => { request.result.createObjectStore('outbox') }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  let legacy: string | null = null
  try { legacy = localStorage.getItem(legacyQueueKey) } catch { /* IndexedDB remains available. */ }
  let migrated = false
  const queue = await new Promise<Outbox>((resolve, reject) => {
    const transaction = database.transaction('outbox', 'readwrite')
    const store = transaction.objectStore('outbox')
    const request = store.get('queue')
    let result: Outbox
    request.onsuccess = () => {
      try {
        let stored: unknown = request.result
        if (stored === undefined && legacy) {
          try { stored = JSON.parse(legacy); migrated = true } catch { /* Ignore malformed legacy data. */ }
        }
        const parsed = QueueSchema.safeParse(stored)
        result = parsed.success ? parsed.data : { inFlight: null, pending: [] }
        change(result)
        store.put(result, 'queue')
      } catch (error) {
        // put() can throw synchronously (for example, QuotaExceededError).
        // Abort explicitly so the caller can retain and retry its local edits.
        transaction.abort()
        reject(error)
      }
    }
    transaction.oncomplete = () => { database.close(); resolve(result) }
    transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error) }
  })
  if (migrated) {
    try {
      // An older tab may have replaced this value during migration.
      if (localStorage.getItem(legacyQueueKey) === legacy) localStorage.removeItem(legacyQueueKey)
    } catch { /* The committed outbox is already durable. */ }
  }
  return queue
}
