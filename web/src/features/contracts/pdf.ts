/** A PDF the server sent as base64 (a signed copy, a sample), as bytes. */
export function pdfBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Saves a PDF on the person's device, under its name. */
export function savePdf(data: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([data.slice()], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
