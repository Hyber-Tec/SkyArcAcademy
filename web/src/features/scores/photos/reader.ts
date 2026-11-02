import type { ReadCard, ReadReply } from './types'

/**
 * Reading a paper card's photo, the page's side: the photo goes to the card reader (reader.worker.ts, started the first
 * time and kept for the visit) and comes back read. Photos queue up there and are read one after another.
 */

let worker: Worker | null = null
let nextId = 1
const waiting = new Map<number, { resolve: (r: ReadCard) => void; reject: (e: Error) => void }>()

function reader(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./reader.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (ev: MessageEvent<ReadReply>) => {
    const reply = ev.data
    const wait = waiting.get(reply.id)
    waiting.delete(reply.id)
    if (!wait) return
    if (reply.ok) wait.resolve(reply)
    else wait.reject(new Error(reply.error))
  }
  // A reader that broke (out of memory, say) fails what it held; the next photo starts a new one.
  w.onerror = (ev) => {
    ev.preventDefault()
    for (const wait of waiting.values()) wait.reject(new Error('The photo couldn’t be read. Try it again.'))
    waiting.clear()
    w.terminate()
    if (worker === w) worker = null
  }
  worker = w
  return w
}

/** Reads a photo of a paper card: the card found (flattened, its bulls read), or the photo itself when none was. */
export function readCardPhoto(file: Blob, name: string): Promise<ReadCard> {
  const id = nextId++
  return new Promise<ReadCard>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    reader().postMessage({ id, file, name })
  })
}
