/**
 * What the Drive takes. It holds results, target photos and the academy's own documents, so it accepts a fixed list
 * of ordinary file types (the Storage rules check the same list) up to 100 MB each, and refuses anything else with a
 * reason, file by file.
 */

export const MAX_FILE_BYTES = 100 * 1024 * 1024
/** Files in one drop or pick; a dropped folder counts every file inside it. */
export const MAX_FILES_PER_DROP = 200

/** Extension → content type. */
export const DRIVE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
}

export type FileCategory = 'pdf' | 'image' | 'document' | 'spreadsheet' | 'presentation' | 'video' | 'text' | 'other'

export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim())
  return m ? m[1].toLowerCase() : ''
}

export function categoryOf(kind: string): FileCategory {
  if (kind === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif'].includes(kind)) return 'image'
  if (['doc', 'docx'].includes(kind)) return 'document'
  if (['xls', 'xlsx', 'csv'].includes(kind)) return 'spreadsheet'
  if (['ppt', 'pptx'].includes(kind)) return 'presentation'
  if (['mp4', 'mov'].includes(kind)) return 'video'
  if (kind === 'txt') return 'text'
  return 'other'
}

/** Images a browser can show without help (HEIC needs a download). */
export function isViewableImage(kind: string): boolean {
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(kind)
}

/** A file name as stored: trimmed, one space between words, no path separators, capped. */
export function cleanFileName(name: string): string {
  return (name ?? '').replace(/[/\\]+/g, '-').trim().replace(/\s+/g, ' ').slice(0, 200)
}

/** A folder name as stored. */
export function cleanFolderName(name: string): string {
  return (name ?? '').replace(/[/\\]+/g, '-').trim().replace(/\s+/g, ' ').slice(0, 120) || 'Untitled folder'
}

export type FilePlan = { ok: true; name: string; kind: string; mime: string } | { ok: false; name: string; reason: string }

/** Accepted (with its clean name, kind and content type) or refused with a reason. */
export function classifyFile(file: { name: string; size: number; type?: string }): FilePlan {
  const name = cleanFileName(file.name)
  if (!name || name.startsWith('.')) return { ok: false, name: file.name || 'Untitled', reason: 'It has no name, or it’s a hidden system file.' }
  const kind = extOf(name)
  const mime = DRIVE_TYPES[kind]
  if (!mime) return { ok: false, name, reason: kind ? `.${kind} files can’t be stored in the Drive.` : 'Files without an extension can’t be stored in the Drive.' }
  if (file.size <= 0) return { ok: false, name, reason: 'The file is empty.' }
  if (file.size > MAX_FILE_BYTES) return { ok: false, name, reason: 'It’s over 100 MB.' }
  return { ok: true, name, kind, mime }
}
