import { PROJECT_ID, token } from './firestore-rest'

/**
 * Minimal Cloud Storage REST client for admin scripts (the sample data's PDFs), with the developer's gcloud login,
 * or the Storage emulator when the Firestore emulator is in use. Requests made this way bypass the Storage rules.
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST ? (process.env.STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199') : null
/** The emulators' bucket is the one the website's emulator mode uses (web/src/lib/firebase.ts). */
export const BUCKET = EMULATOR ? `${PROJECT_ID}.appspot.com` : `${PROJECT_ID}.firebasestorage.app`
const HOST = EMULATOR ? `http://${EMULATOR}` : 'https://storage.googleapis.com'

const headers = () => ({ Authorization: `Bearer ${token()}`, 'x-goog-user-project': PROJECT_ID })

export async function uploadObject(path: string, bytes: Uint8Array, contentType: string) {
  const url = `${HOST}/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`
  const res = await fetch(url, { method: 'POST', headers: { ...headers(), 'Content-Type': contentType }, body: new Blob([bytes as BlobPart]) })
  if (!res.ok) throw new Error(`Upload of ${path} failed: ${res.status} ${await res.text()}`)
}

/** Deletes an object; one that isn't there is fine. */
export async function deleteObject(path: string) {
  const res = await fetch(`${HOST}/storage/v1/b/${BUCKET}/o/${encodeURIComponent(path)}`, { method: 'DELETE', headers: headers() })
  if (!res.ok && res.status !== 404) throw new Error(`Delete of ${path} failed: ${res.status} ${await res.text()}`)
}
