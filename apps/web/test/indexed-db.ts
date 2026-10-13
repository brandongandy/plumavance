// Test transport for IndexedDB's atomic read/write boundary. Real browser E2E
// exercises native transactions and storage notifications between pages.
export function indexedDbFixture(putError?: (value: unknown) => DOMException | undefined): IDBFactory {
  let value: unknown
  let tail = Promise.resolve()
  const database = {
    createObjectStore() {},
    close() {},
    transaction() {
      const transaction: Record<string, unknown> = {}
      transaction.objectStore = () => ({
        get() {
          const request: Record<string, unknown> = {}
          tail = tail.then(() => {
            request.result = value === undefined ? undefined : structuredClone(value)
            ;(request.onsuccess as () => void)()
            ;(transaction.error ? transaction.onabort as () => void : transaction.oncomplete as () => void)()
          })
          return request
        },
        put(next: unknown) {
          const error = putError?.(next)
          if (error) transaction.error = error
          else value = structuredClone(next)
        },
      })
      return transaction
    },
  }
  return {
    open() {
      const request: Record<string, unknown> = {}
      queueMicrotask(() => {
        request.result = database
        ;(request.onsuccess as () => void)()
      })
      return request
    },
  } as unknown as IDBFactory
}
