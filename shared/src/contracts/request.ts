import { type Lang, pick } from '../i18n'
import { ENGLISH_NAME } from './fill'

/**
 * A family's request for the enrollment contract from the academy's sign (docs/DECISIONS.md §39): the page its QR code
 * opens (`/contract`) asks for each child's name and birth date and the parent's name, email and phone, and the office
 * sends each child's contract from it. What they type fills in the contract, so it's checked as the contract checks
 * it: names in English letters with the first and last name, a phone number, an email address.
 */

export interface RequestChild {
  firstName: string
  lastName: string
  /** YYYY-MM-DD, or null when left out. */
  dob: string | null
}

export interface ContractRequestInput {
  children: RequestChild[]
  parentName: string
  email: string
  phone: string
  lang: Lang
}

/** Up to four children on one request: one contract each. */
export const REQUEST_CHILDREN_MAX = 4

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const hasLetters = (v: string, n: number) => v.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '').length >= n

/** "2014-05-02", a birth date from 1950 to `today`, or null. */
function checkDob(v: string, today: string): string | null | undefined {
  if (!v) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T12:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v || v < '1950-01-01' || v > today) return undefined
  return v
}

/**
 * The request checked: its clean values, or what to fix (keys like `children.0.firstName`, `parentName`, `email`), in
 * the family's words: Korean for a parent reading it. `today` is YYYY-MM-DD.
 */
export function checkContractRequest(raw: unknown, today: string): { ok: true; value: ContractRequestInput } | { ok: false; errors: Record<string, string> } {
  const r = (raw ?? {}) as Record<string, unknown>
  const lang: Lang = r.lang === 'ko' ? 'ko' : 'en'
  const say = (en: string, ko: string) => pick(lang, en, ko)
  const errors: Record<string, string> = {}
  const name = (key: string, v: string, part: 'first' | 'last' | 'full') => {
    if (!v) errors[key] = part === 'first' ? say('Type the first name.', '이름을 입력해 주세요.') : part === 'last' ? say('Type the last name.', '성을 입력해 주세요.') : say('Type your name.', '이름을 입력해 주세요.')
    else if (v.length > 60) errors[key] = say('This is too long.', '너무 길어요.')
    else if (!ENGLISH_NAME.test(v) || !hasLetters(v, 1)) errors[key] = say('Type the name in English letters.', '이름은 영문으로 입력해 주세요.')
    else if (part === 'full' && (!v.includes(' ') || !hasLetters(v, 2))) errors[key] = say('Type your first and last name.', '이름과 성을 모두 입력해 주세요.')
  }
  const list = Array.isArray(r.children) ? r.children.slice(0, REQUEST_CHILDREN_MAX + 1) : []
  if (!list.length) errors.children = say('Add your child.', '자녀를 추가해 주세요.')
  if (list.length > REQUEST_CHILDREN_MAX) errors.children = say(`Up to ${REQUEST_CHILDREN_MAX} children at a time.`, `한 번에 자녀 ${REQUEST_CHILDREN_MAX}명까지 신청할 수 있어요.`)
  const children = list.slice(0, REQUEST_CHILDREN_MAX).map((c, i) => {
    const x = (c ?? {}) as Record<string, unknown>
    const child = { firstName: clean(x.firstName), lastName: clean(x.lastName), dob: clean(x.dob) }
    name(`children.${i}.firstName`, child.firstName, 'first')
    name(`children.${i}.lastName`, child.lastName, 'last')
    const dob = checkDob(child.dob, today)
    if (dob === undefined) errors[`children.${i}.dob`] = say('Choose the date of birth.', '생년월일을 골라 주세요.')
    return { firstName: child.firstName, lastName: child.lastName, dob: dob ?? null }
  })
  const parentName = clean(r.parentName)
  name('parentName', parentName, 'full')
  const email = clean(r.email).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) errors.email = say('Type an email address.', '이메일 주소를 입력해 주세요.')
  const phone = clean(r.phone)
  if (phone.replace(/\D/g, '').length < 7 || phone.length > 30 || !/^[0-9+()\-. ]+$/.test(phone)) errors.phone = say('Type a phone number.', '전화번호를 입력해 주세요.')
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { children, parentName, email, phone, lang } }
}

/** "Ava Kim": a child's name as the contract and the records write it. */
export const childName = (c: Pick<RequestChild, 'firstName' | 'lastName'>) => `${c.firstName} ${c.lastName}`.trim()
