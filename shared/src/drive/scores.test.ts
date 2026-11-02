import { describe, expect, it } from 'vitest'
import type { Position } from '../shooting/evaluation'
import { scoreTotal, scoresByFile } from './scores'

// Made-up scores: a results sheet's three positions in one file, a SIUS PDF, a paper card, and one typed in by hand.
const score = (id: string, fileId: string | null, position: Position, dateKey = '2026-10-20', timeMin: number | null = null) => ({ id, fileId, position, dateKey, timeMin })

describe('the scores made from each Drive file', () => {
  it('keeps every score of a file, in the positions’ order', () => {
    const list = [score('p', 'sheet', 'prone'), score('s', 'sheet', 'standing'), score('k', 'sheet', 'kneeling'), score('one', 'pdf', 'kneeling')]
    const byFile = scoresByFile(list)
    expect(byFile.get('sheet')?.map((e) => e.id)).toEqual(['s', 'k', 'p'])
    expect(byFile.get('pdf')?.map((e) => e.id)).toEqual(['one'])
    expect(byFile.size).toBe(2)
  })

  it('leaves out scores that came from no file', () => {
    expect(scoresByFile([score('typed', null, 'prone')]).size).toBe(0)
  })

  it('puts two of the same position by date, then time', () => {
    const list = [score('later', 'f', 'prone', '2026-10-21', 600), score('evening', 'f', 'prone', '2026-10-20', 1140), score('morning', 'f', 'prone', '2026-10-20', 540)]
    expect(scoresByFile(list).get('f')?.map((e) => e.id)).toEqual(['morning', 'evening', 'later'])
  })

  it('keeps what each score holds', () => {
    const e = { ...score('a', 'f', 'standing'), total: 186.8 }
    expect(scoresByFile([e]).get('f')?.[0]).toBe(e)
  })
})

describe('a score’s total in the Drive', () => {
  it('has one decimal for SIUS, even when it’s whole', () => {
    expect(scoreTotal({ source: 'sius', total: 186.8 })).toBe('186.8')
    expect(scoreTotal({ source: 'sius', total: 187 })).toBe('187.0')
  })

  it('is as written for a paper card or a results sheet', () => {
    expect(scoreTotal({ source: 'paper', total: 86 })).toBe('86')
    expect(scoreTotal({ source: 'sheet', total: 571 })).toBe('571')
    expect(scoreTotal({ source: 'sheet', total: 612.4 })).toBe('612.4')
  })
})
