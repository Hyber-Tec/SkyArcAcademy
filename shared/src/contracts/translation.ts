import type { Lang } from '../i18n'
import { type ContractBlock, type ContractDocument, parseContract, replaceDollars } from './document'

/**
 * The contract in Korean, for parents who read Korean (docs/DECISIONS.md §36: "Korean to read, English official"). The
 * academy's English contract stays the one that counts; a translation the academy approved is kept with each version
 * (`ContractTemplate.ko`), written as a second file with the same markers in the same order
 * (docs/internal/contract/…ko.txt, put in by scripts/contract.ts). The family reads the Korean and signs the contract;
 * the signed PDF has the English, then the Korean they read.
 *
 * Block by block, the Korean gives only the words people read: the IDs, the prices, the discounts' amounts and what
 * they leave out, the fields' kinds and who fills what all come from the English, so what a family fills in and pays is
 * the same in either language.
 */

/** Where the Korean doesn't line up with the English, in the translator's words (empty when it does). */
export function translationProblems(en: ContractDocument, ko: ContractDocument): string[] {
  const out: string[] = []
  if (en.blocks.length !== ko.blocks.length) out.push(`The English has ${en.blocks.length} parts and the Korean ${ko.blocks.length}: each heading, paragraph, list and [[…]] must have its translation, in the same order.`)
  const n = Math.min(en.blocks.length, ko.blocks.length)
  for (let i = 0; i < n; i++) {
    const [a, b] = [en.blocks[i], ko.blocks[i]]
    const where = `Part ${i + 1} (${describe(a)})`
    if (a.kind !== b.kind) {
      out.push(`${where}: the Korean has ${describe(b)} there.`)
      break
    }
    const count = (x: ContractBlock): number | null =>
      x.kind === 'bullets' ? x.items.length : x.kind === 'numbered' ? x.items.length : x.kind === 'box' ? x.lines.length : x.kind === 'choose' || x.kind === 'check' ? x.options.length : x.kind === 'fields' ? x.fields.length : null
    const [ca, cb] = [count(a), count(b)]
    if (ca !== cb) out.push(`${where}: ${ca} lines in the English, ${cb} in the Korean.`)
    if (a.kind === 'numbered' && b.kind === 'numbered' && a.items.some((it, j) => it.n !== b.items[j]?.n)) out.push(`${where}: keep the English numbering.`)
    if ((a.kind === 'check' || a.kind === 'fields' || a.kind === 'sign') && b.kind === a.kind && a.by !== (b as typeof a).by) out.push(`${where}: the family's and the academy's parts must stay theirs.`)
  }
  if (en.footer.length !== ko.footer.length) out.push(`The English has ${en.footer.length} footer lines and the Korean ${ko.footer.length}.`)
  return out
}

function describe(b: ContractBlock): string {
  switch (b.kind) {
    case 'heading':
    case 'subheading':
      return `the heading “${b.text.slice(0, 40)}”`
    case 'paragraph':
      return 'a paragraph'
    case 'bullets':
    case 'numbered':
      return 'a list'
    case 'box':
      return 'a box'
    case 'initials':
      return `[[initials: ${b.label}]]`
    case 'fields':
      return `[[${b.by === 'academy' ? 'academy' : 'family'}: ${b.title}]]`
    case 'sign':
      return `[[${b.by === 'academy' ? 'academy sign' : 'sign'}: ${b.label}]]`
    default:
      return `[[${b.kind}: ${b.label}]]`
  }
}

/**
 * The contract with the Korean's words on the English's structure. The prices stay the English's dollars in the
 * Korean's words ("월 $495"), so a new price set in the app shows in both.
 */
export function translatedContract(en: ContractDocument, ko: ContractDocument): ContractDocument {
  const blocks = en.blocks.map((a, i): ContractBlock => {
    const b = ko.blocks[i]
    if (!b || b.kind !== a.kind) return a
    switch (a.kind) {
      case 'heading':
      case 'subheading':
        return { ...a, text: (b as typeof a).text }
      case 'paragraph':
        return { ...a, text: (b as typeof a).text }
      case 'bullets':
        return { ...a, items: a.items.map((it, j) => (b as typeof a).items[j] ?? it) }
      case 'numbered':
        return { ...a, items: a.items.map((it, j) => ({ n: it.n, text: (b as typeof a).items[j]?.text ?? it.text })) }
      case 'box':
        return { ...a, lines: a.lines.map((l, j) => (b as typeof a).lines[j] ?? l) }
      case 'choose': {
        const k = b as typeof a
        return {
          ...a,
          label: k.label,
          priceLabel: k.priceLabel,
          options: a.options.map((o, j) => {
            const t = k.options[j]
            if (!t) return o
            return { ...o, title: t.title, lines: t.lines, price: o.amount !== null && /\$/.test(t.price) ? replaceDollars(t.price, o.amount) : t.price || o.price }
          }),
        }
      }
      case 'check': {
        const k = b as typeof a
        return { ...a, label: k.label, options: a.options.map((o, j) => ({ ...o, text: k.options[j]?.text ?? o.text })) }
      }
      case 'initials':
        return { ...a, label: (b as typeof a).label }
      case 'fields': {
        const k = b as typeof a
        return { ...a, title: k.title, fields: a.fields.map((f, j) => ({ ...f, label: k.fields[j]?.label ?? f.label })) }
      }
      case 'sign':
        return { ...a, label: (b as typeof a).label }
    }
  })
  return { title: ko.title || en.title, footer: ko.footer.length === en.footer.length ? ko.footer : en.footer, blocks }
}

/**
 * The contract a family reads: in Korean when they read Korean and the version has the academy's translation (lining up
 * with it); otherwise the English. `translated` says which.
 */
export function contractIn(lang: Lang, enText: string, koText: string | null | undefined): { doc: ContractDocument; translated: boolean } {
  const en = parseContract(enText).doc
  if (lang !== 'ko' || !koText) return { doc: en, translated: false }
  const ko = parseContract(koText, { anyText: true }).doc
  if (translationProblems(en, ko).length) return { doc: en, translated: false }
  return { doc: translatedContract(en, ko), translated: true }
}
