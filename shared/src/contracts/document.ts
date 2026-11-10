/**
 * The enrollment contract as the app shows it (docs/DECISIONS.md §33 and §34): the academy's own words, one thing per
 * line, with the parts a family fills in marked where the paper had them. The phone app, the website and the server's
 * PDF (functions/src/contractPdf.ts) all read it through `parseContract`, so the contract reads the same everywhere and
 * is checked the same way. Its text is the academy's, put in the database by scripts/contract.ts and never written in
 * the app (the office changes only the prices: `withPrices`); never in this repository (it holds prices and contacts).
 *
 *   # Title                            the contract's title
 *   ## Heading, ### Smaller heading    a section's heading, a smaller one
 *   - text, 1. text                    a bullet, a numbered item
 *   > text                             a line in a box
 *   **bold**                           bold words, anywhere in a line
 *   [[choose: Label | Price label]]    one of the options below it, each "- Name | Price | detail | detail…"
 *   [[check: Label]]                   any of the options below it, each "- text"
 *   [[academy check: Label]]           boxes only the office checks, as it sends the contract (the discounts): each
 *                                      "- text", or "- text | $20" for one that takes $20 off the price chosen, with
 *                                      "| except: Option name; Option name" for the options it doesn't apply to
 *   [[initials: Label]]                the signer's initials
 *   [[family: Title]]                  fields the family fills, each "- Label" or "- Label = student|signer|date|phone|email"
 *   [[academy: Title]]                 fields the academy fills (the family sees them as the academy's)
 *   [[sign: Label]]                    where the family signs, with the date
 *   [[academy sign: Label]]            where the academy signs, with the date
 *   [[footer: text]]                   a line at the foot of each page of the PDF
 *
 * Anything else is a paragraph; blank lines only separate.
 */

/** Some words of a line, bold or not. */
export interface Run {
  text: string
  bold: boolean
}

export type Line = Run[]

/**
 * What a field holds, and what the app fills in for the family: the student's name, the signer's own name (their
 * signature's), a date (typed MM/DD/YYYY), a phone number, an email, or any text.
 */
export type FieldFill = 'text' | 'student' | 'signer' | 'date' | 'phone' | 'email'

export const FIELD_FILLS: readonly FieldFill[] = ['text', 'student', 'signer', 'date', 'phone', 'email']

export interface ContractField {
  id: string
  label: string
  fill: FieldFill
}

/** One of a `choose`'s options: its name, its price, and the lines that describe it. */
export interface ContractOption {
  id: string
  title: string
  price: string
  /** The dollars in `price` ("$495 / Month" → 495), or null when it has none. */
  amount: number | null
  lines: string[]
  /** Its line in the text (from 1): where a new price goes (`withPrices`). */
  line: number
}

/** One of a `check`'s boxes: its words and, for a discount, what it takes off and the options it doesn't apply to. */
export interface CheckOption {
  id: string
  text: string
  /** The dollars it takes off the chosen option's price ("| $20"), or null. */
  amount: number | null
  /** The IDs of the options it doesn't apply to ("| except: …"). */
  except: string[]
}

export type ContractBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'paragraph'; text: Line }
  | { kind: 'bullets'; items: Line[] }
  | { kind: 'numbered'; items: { n: string; text: Line }[] }
  | { kind: 'box'; lines: Line[] }
  | { kind: 'choose'; id: string; label: string; priceLabel: string; options: ContractOption[] }
  | { kind: 'check'; id: string; label: string; by: Party; options: CheckOption[] }
  | { kind: 'initials'; id: string; label: string }
  | { kind: 'fields'; id: string; title: string; by: Party; fields: ContractField[] }
  | { kind: 'sign'; id: string; label: string; by: Party }

/** Who fills a part in: the family (as they sign) or the academy. */
export type Party = 'family' | 'academy'

export interface ContractDocument {
  title: string
  /** The lines at the foot of each page of the PDF. */
  footer: string[]
  blocks: ContractBlock[]
}

/** Something to fix before the contract can be published, and its line (from 1). */
export interface ContractProblem {
  line: number
  message: string
}

/**
 * Characters the PDF's standard fonts print (shared with functions/src/contractPdf.ts): English letters with their
 * accents, digits, punctuation and a few signs. Anything else (another alphabet, an emoji) can't be in the contract.
 */
export const PDF_PRINTABLE = /^[\x20-\x7E\xA0-\xFF‘’“”–—…•€™]*$/
const NOT_PRINTABLE = /[^\x20-\x7E\xA0-\xFF‘’“”–—…•€™]/

/** Bold words between double asterisks; an unpaired ** is shown as it is. */
export function parseLine(text: string): Line {
  const out: Line = []
  const parts = text.split('**')
  // An odd count of parts means every ** is paired.
  if (parts.length % 2 === 0) return [{ text, bold: false }]
  parts.forEach((part, i) => {
    if (part) out.push({ text: part, bold: i % 2 === 1 })
  })
  return out.length ? out : [{ text: '', bold: false }]
}

/** A line's words without their bold. */
export const plain = (line: Line): string => line.map((r) => r.text).join('')

/** "Selected Program Level" → "selected-program-level". */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'field'
  )
}

const DIRECTIVE = /^\[\[\s*(academy sign|academy check|academy|choose|check|initials|family|sign|footer)\s*:\s*(.*?)\s*\]\]$/i

/** Dollars as written: "$495", "$1,200", "$12.50". */
const DOLLARS = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/

/** The first dollars in some words ("$495 / Month" → 495), or null. */
export function amountIn(text: string): number | null {
  const m = DOLLARS.exec(text)
  if (!m) return null
  return Number(m[1].replace(/,/g, '')) + (m[2] ? Number(m[2].padEnd(2, '0')) / 100 : 0)
}

/** 495 → "$495", 1200 → "$1,200", 12.5 → "$12.50". */
export function dollarsText(amount: number): string {
  const [whole, cents] = (Math.round(amount * 100) / 100).toFixed(2).split('.')
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${cents === '00' ? '' : `.${cents}`}`
}

/** Some words with their first dollars changed ("$495 / Month", 510 → "$510 / Month"). */
export const replaceDollars = (text: string, amount: number): string => text.replace(DOLLARS, () => dollarsText(amount))

const sameTitle = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * The contract's words and fields, and what to fix (`problems`), from its text.
 */
export function parseContract(source: string): { doc: ContractDocument; problems: ContractProblem[] } {
  const doc: ContractDocument = { title: '', footer: [], blocks: [] }
  const problems: ContractProblem[] = []
  const ids = new Set<string>()
  const unique = (base: string) => {
    let id = slug(base)
    for (let n = 2; ids.has(id); n++) id = `${slug(base).slice(0, 36)}-${n}`
    ids.add(id)
    return id
  }
  /** The block the next "- …" lines add to, and the line that opened it. */
  let open: { block: ContractBlock; line: number } | null = null
  /** The discounts' "except: …" titles, read once every option is known; and the lines of the discounts. */
  const leaveOut: { option: CheckOption; titles: string[]; line: number }[] = []
  const discountLines: number[] = []
  const close = () => {
    if (open && (open.block.kind === 'choose' || open.block.kind === 'check') && !open.block.options.length) {
      problems.push({ line: open.line, message: 'Add its options below it, each on a line starting with “- ”.' })
    }
    if (open && open.block.kind === 'fields' && !open.block.fields.length) {
      problems.push({ line: open.line, message: 'Add its fields below it, each on a line starting with “- ”.' })
    }
    open = null
  }
  const push = (block: ContractBlock, line: number, keepOpen = false) => {
    close()
    doc.blocks.push(block)
    if (keepOpen) open = { block, line }
  }

  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  lines.forEach((raw, i) => {
    const n = i + 1
    const line = raw.replace(/\s+$/, '').replace(/^\s+/, '')
    if (!line) return close()
    const bad = line.match(NOT_PRINTABLE)
    if (bad) problems.push({ line: n, message: `“${bad[0]}” can’t be printed in the PDF. Use English letters and common signs.` })

    const directive = line.match(DIRECTIVE)
    if (directive) {
      const kind = directive[1].toLowerCase()
      const rest = directive[2]
      if (kind === 'footer') {
        close()
        if (rest) doc.footer.push(rest)
        return
      }
      if (!rest) {
        problems.push({ line: n, message: `Give the [[${kind}: …]] a label.` })
        return
      }
      if (kind === 'choose') {
        const [label, priceLabel = ''] = rest.split('|').map((s) => s.trim())
        push({ kind: 'choose', id: unique(label), label, priceLabel, options: [] }, n, true)
      } else if (kind === 'check' || kind === 'academy check') push({ kind: 'check', id: unique(rest), label: rest, by: kind === 'check' ? 'family' : 'academy', options: [] }, n, true)
      else if (kind === 'initials') push({ kind: 'initials', id: unique(rest), label: rest }, n)
      else if (kind === 'family' || kind === 'academy') push({ kind: 'fields', id: unique(rest), title: rest, by: kind, fields: [] }, n, true)
      else push({ kind: 'sign', id: unique(rest), label: rest, by: kind === 'sign' ? 'family' : 'academy' }, n)
      return
    }
    if (/^\[\[.*\]\]$/.test(line)) {
      close()
      problems.push({ line: n, message: 'This [[…]] isn’t one the app knows: choose, check, academy check, initials, family, academy, sign, academy sign or footer.' })
      return
    }

    if (line.startsWith('# ')) {
      close()
      if (doc.title) problems.push({ line: n, message: 'The contract has one title (a line starting with “# ”).' })
      else doc.title = plain(parseLine(line.slice(2).trim()))
      return
    }
    if (line.startsWith('### ')) return push({ kind: 'subheading', text: plain(parseLine(line.slice(4).trim())) }, n)
    if (line.startsWith('## ')) return push({ kind: 'heading', text: plain(parseLine(line.slice(3).trim())) }, n)

    if (line.startsWith('- ')) {
      const item = line.slice(2).trim()
      const block = open?.block
      if (block?.kind === 'choose') {
        const [title, ...rest] = item.split('|').map((s) => s.trim())
        const price = block.priceLabel ? (rest.shift() ?? '') : ''
        if (block.priceLabel && !price) problems.push({ line: n, message: `Give this option its ${block.priceLabel.toLowerCase()} after a “|”.` })
        const optionIds = new Set(block.options.map((o) => o.id))
        let id = slug(title)
        for (let k = 2; optionIds.has(id); k++) id = `${slug(title).slice(0, 36)}-${k}`
        block.options.push({ id, title, price, amount: price ? amountIn(price) : null, lines: rest.filter(Boolean), line: n })
        return
      }
      if (block?.kind === 'check') {
        const [text, ...cells] = item.split('|').map((s) => s.trim())
        let amount: number | null = null
        const except: string[] = []
        for (const cell of cells) {
          const leave = /^except\s*:\s*(.*)$/i.exec(cell)
          if (leave) except.push(...leave[1].split(';').map((t) => t.trim()).filter(Boolean))
          else if (amount === null && /^\$/.test(cell) && amountIn(cell) !== null) amount = amountIn(cell)
          else if (cell) problems.push({ line: n, message: `“${cell}” isn’t an amount (like $20) or “except: …”.` })
        }
        const optionIds = new Set(block.options.map((o) => o.id))
        let id = slug(text)
        for (let k = 2; optionIds.has(id); k++) id = `${slug(text).slice(0, 36)}-${k}`
        const option: CheckOption = { id, text, amount, except: [] }
        block.options.push(option)
        if (except.length) leaveOut.push({ option, titles: except, line: n })
        if (amount !== null) discountLines.push(n)
        return
      }
      if (block?.kind === 'fields') {
        const at = item.lastIndexOf('=')
        const fill = at > 0 ? item.slice(at + 1).trim().toLowerCase() : ''
        const label = (at > 0 && fill ? item.slice(0, at) : item).trim()
        if (fill && !FIELD_FILLS.includes(fill as FieldFill)) {
          problems.push({ line: n, message: `“= ${fill}” isn’t one the app knows: student, signer, date, phone or email.` })
        }
        block.fields.push({ id: unique(label), label, fill: FIELD_FILLS.includes(fill as FieldFill) ? (fill as FieldFill) : 'text' })
        return
      }
      if (block?.kind === 'bullets') {
        block.items.push(parseLine(item))
        return
      }
      return push({ kind: 'bullets', items: [parseLine(item)] }, n, true)
    }

    const numbered = line.match(/^(\d{1,3})[.)]\s+(.*)$/)
    if (numbered) {
      const item = { n: `${numbered[1]}.`, text: parseLine(numbered[2]) }
      if (open?.block.kind === 'numbered') open.block.items.push(item)
      else push({ kind: 'numbered', items: [item] }, n, true)
      return
    }

    if (line === '>' || line.startsWith('> ')) {
      const text = parseLine(line.slice(1).trim())
      if (open?.block.kind === 'box') open.block.lines.push(text)
      else push({ kind: 'box', lines: [text] }, n, true)
      return
    }

    push({ kind: 'paragraph', text: parseLine(line) }, n)
  })
  close()

  if (!doc.title) problems.unshift({ line: 1, message: 'Start with the contract’s title, on a line starting with “# ”.' })
  const signs = doc.blocks.filter((b) => b.kind === 'sign' && b.by === 'family')
  if (!signs.length) problems.push({ line: lines.length, message: 'Add [[sign: …]] where the family signs.' })
  if (signs.length > 1) problems.push({ line: lines.length, message: 'The family signs once: keep one [[sign: …]].' })
  const signers = familyFields(doc).filter((f) => f.kind === 'field' && f.fill === 'signer')
  if (signers.length > 1) problems.push({ line: lines.length, message: 'Only one field can be “= signer” (the signer’s own name).' })
  const priced = pricedChoice(doc)
  if (discountLines.length && !priced) problems.push({ line: discountLines[0], message: 'A discount comes off a price: add a [[choose: … | Price label]] with the prices.' })
  const options = doc.blocks.flatMap((b) => (b.kind === 'choose' ? b.options : []))
  for (const l of leaveOut) {
    for (const title of l.titles) {
      const o = options.find((x) => sameTitle(x.title, title))
      if (o) l.option.except.push(o.id)
      else problems.push({ line: l.line, message: `There’s no option “${title}” to leave out.` })
    }
  }
  return { doc, problems }
}

/** The option a family pays for, its prices the ones discounts come off: the first [[choose: …]] with a price label. */
export function pricedChoice(doc: ContractDocument): Extract<ContractBlock, { kind: 'choose' }> | null {
  for (const b of doc.blocks) if (b.kind === 'choose' && b.priceLabel) return b
  return null
}

/** The boxes only the office checks, as it sends the contract (`[[academy check: …]]`: the discounts). */
export function academyChecks(doc: ContractDocument): Extract<ContractBlock, { kind: 'check' }>[] {
  return doc.blocks.filter((b): b is Extract<ContractBlock, { kind: 'check' }> => b.kind === 'check' && b.by === 'academy')
}

/**
 * The contract's text with new prices (by option ID, the priced choice's): each option's dollars replaced in its price,
 * the rest of its words as they were ("$495 / Month" → "$510 / Month"). The office changes prices this way only.
 */
export function withPrices(source: string, prices: Readonly<Record<string, number>>): string {
  const choice = pricedChoice(parseContract(source).doc)
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  for (const o of choice?.options ?? []) {
    const next = prices[o.id]
    if (next === undefined || o.amount === null) continue
    const cells = lines[o.line - 1].split('|')
    if (cells.length < 2) continue
    cells[1] = replaceDollars(cells[1], next)
    lines[o.line - 1] = cells.join('|')
  }
  return lines.join('\n')
}

/** What the family fills in, in the contract's order. */
export type FamilyPart =
  | { kind: 'choose'; id: string; label: string; block: Extract<ContractBlock, { kind: 'choose' }> }
  | { kind: 'check'; id: string; label: string; block: Extract<ContractBlock, { kind: 'check' }> }
  | { kind: 'initials'; id: string; label: string }
  | { kind: 'field'; id: string; label: string; fill: FieldFill; section: string }

export function familyFields(doc: ContractDocument): FamilyPart[] {
  const out: FamilyPart[] = []
  for (const b of doc.blocks) {
    if (b.kind === 'choose') out.push({ kind: 'choose', id: b.id, label: b.label, block: b })
    else if (b.kind === 'check' && b.by === 'family') out.push({ kind: 'check', id: b.id, label: b.label, block: b })
    else if (b.kind === 'initials') out.push({ kind: 'initials', id: b.id, label: b.label })
    else if (b.kind === 'fields' && b.by === 'family') for (const f of b.fields) out.push({ kind: 'field', id: f.id, label: f.label, fill: f.fill, section: b.title })
  }
  return out
}

/** The field holding the signer's own name (their typed signature), when the contract has one. */
export function signerField(doc: ContractDocument): ContractField | null {
  for (const b of doc.blocks) if (b.kind === 'fields' && b.by === 'family') for (const f of b.fields) if (f.fill === 'signer') return f
  return null
}
