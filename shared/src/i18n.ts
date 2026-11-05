import type { Role } from './roles'
import { type DateKey, type DateKeyStyle, type Weekday, formatDateKey, minutesOf, parseDateKey, weekdayIndex } from './time'

/**
 * Korean for families (docs/DECISIONS.md §36): parents read the portal, the phone app and the contract in Korean when
 * their phone or browser is set to Korean, or they choose it; students and staff read English. Each text sits next to
 * its English in the code (`t('Home', '홈')`), written as .claude/skills/korean-ux-writing says. Emails stay English;
 * phone notifications follow each phone's language.
 */
export type Lang = 'en' | 'ko'

export const LANGS: readonly Lang[] = ['en', 'ko']

/** Each language in its own words, for the switch. */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', ko: '한국어' }

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'ko'

/** Korean when the first language a device or browser prefers is Korean ("ko", "ko-KR"); English otherwise. */
export function langOf(locales: readonly (string | null | undefined)[]): Lang {
  const first = locales.find((l) => typeof l === 'string' && l.trim())
  return first && /^ko\b/i.test(first.trim()) ? 'ko' : 'en'
}

/**
 * The language a person reads the app in: a parent's choice, or their device's; the same before anyone signs in (the
 * sign-in pages, a contract's link). Students and staff read English.
 */
export function readingLang(role: Role | null, chosen: Lang | null, device: Lang): Lang {
  if (role !== null && role !== 'parent') return 'en'
  return chosen ?? device
}

/** One of two by language. */
export const pick = <T>(lang: Lang, en: T, ko: T): T => (lang === 'ko' ? ko : en)

/** The locale `Intl` takes for the language. */
export const localeOf = (lang: Lang): string => (lang === 'ko' ? 'ko-KR' : 'en-US')

// ------------------------------------------------------------------ particles

/** The particles that change with the sound before them, written as "after a final consonant/after a vowel". */
export type Josa = '이/가' | '은/는' | '을/를' | '과/와' | '이랑/랑' | '으로/로' | '이에요/예요' | '아/야' | '이나/나' | '이라고/라고'

type Final = 'none' | 'rieul' | 'other'

/** How the word ends when read in Korean: no final consonant, ㄹ, or another; English names by how they sound. */
function finalOf(word: string): Final {
  const w = word.replace(/[\s.,!?'"’”)\]}]+$/u, '')
  const last = w.at(-1) ?? ''
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other'
  }
  if (/[0-9]/.test(last)) return (['other', 'rieul', 'none', 'other', 'none', 'none', 'other', 'rieul', 'rieul', 'none'] as const)[Number(last)]
  const lower = w.toLowerCase()
  // English names: m, n and ng end in a consonant in Korean (Sam 샘, John 존, Young 영), l in ㄹ (Paul 폴); the rest
  // end in a vowel as Korean writes them (Jiwoo 지우, Grace 그레이스, Robert 로버트, Max 맥스).
  if (/(ng|[mn])$/.test(lower)) return 'other'
  if (/l$/.test(lower)) return 'rieul'
  return 'none'
}

/** The word with the particle that fits it: josa('지우', '이/가') → "지우가"; josa('Sam', '은/는') → "Sam은". */
export function josa(word: string, particle: Josa): string {
  const [afterConsonant, afterVowel] = particle.split('/') as [string, string]
  const final = finalOf(word)
  if (particle === '으로/로') return word + (final === 'other' ? '으로' : '로')
  return word + (final === 'none' ? afterVowel : afterConsonant)
}

// ------------------------------------------------------------------ dates and times

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const
const KO_WEEKDAY_BY_NAME: Record<Weekday, string> = { sunday: '일', monday: '월', tuesday: '화', wednesday: '수', thursday: '목', friday: '금', saturday: '토' }

/** "목요일", or "목" short: a weekday in the language. */
export function weekdayText(day: Weekday, lang: Lang, short = false): string {
  if (lang === 'en') {
    const name = day[0].toUpperCase() + day.slice(1)
    return short ? name.slice(0, 3) : name
  }
  return short ? KO_WEEKDAY_BY_NAME[day] : `${KO_WEEKDAY_BY_NAME[day]}요일`
}

/**
 * A date in the language: English as `formatDateKey` writes it; Korean the way Korean apps do ("11월 5일 (목)",
 * "2026년 11월 5일 목요일"), never Intl's "2026. 11. 5." for a sentence.
 */
export function dateText(key: DateKey, style: DateKeyStyle, lang: Lang): string {
  if (lang === 'en') return formatDateKey(key, style)
  const { year, month, day } = parseDateKey(key)
  const wd = KO_WEEKDAYS[weekdayIndex(key)]
  switch (style) {
    case 'short':
      return `${year}. ${month}. ${day}.`
    case 'medium':
    case 'long':
      return `${year}년 ${month}월 ${day}일`
    case 'weekdayShort':
    case 'weekdayMedium':
      return `${month}월 ${day}일 (${wd})`
    case 'weekdayLong':
      return `${year}년 ${month}월 ${day}일 ${wd}요일`
    case 'monthYear':
      return `${year}년 ${month}월`
    case 'monthDay':
    case 'monthDayLong':
      return `${month}월 ${day}일`
    case 'weekday':
      return `${wd}요일`
  }
}

/** Minutes after midnight in the language: "4:30 PM", "오후 4:30". */
export function timeText(minutes: number, lang: Lang): string {
  const h = Math.floor(minutes / 60) % 24
  const m = String(minutes % 60).padStart(2, '0')
  const h12 = h % 12 === 0 ? 12 : h % 12
  return lang === 'ko' ? `${h < 12 ? '오전' : '오후'} ${h12}:${m}` : `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`
}

/** A time range: "4:30 – 8:00 PM", "오후 4:30~8:00" (the second 오전/오후 only when it changes). */
export function timeRangeText(startMin: number, endMin: number, lang: Lang): string {
  if (lang === 'en') {
    const [a, b] = [timeText(startMin, 'en'), timeText(endMin, 'en')]
    return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`
  }
  const [a, b] = [timeText(startMin, 'ko'), timeText(endMin, 'ko')]
  return a.slice(0, 2) === b.slice(0, 2) ? `${a}~${b.slice(3)}` : `${a}~${b}`
}

/** An instant's time of day in the academy's zone, in the language. */
export const instantTimeText = (instant: Date | number, timeZone: string, lang: Lang): string => timeText(minutesOf(instant, timeZone), lang)

/** A length of time: "1h 50m", "1시간 50분". */
export function durationText(minutes: number, lang: Lang): string {
  const m = Math.max(0, Math.round(minutes))
  const [h, r] = [Math.floor(m / 60), m % 60]
  if (lang === 'en') return h === 0 ? `${r}m` : r === 0 ? `${h}h` : `${h}h ${r}m`
  return h === 0 ? `${r}분` : r === 0 ? `${h}시간` : `${h}시간 ${r}분`
}
