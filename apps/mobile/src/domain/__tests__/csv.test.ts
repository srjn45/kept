import { parseCsv, stringifyCsv } from '../csv'

describe('parseCsv / stringifyCsv (§8 Phase 7)', () => {
  it('parses a simple table', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('ignores a trailing newline (no spurious empty record)', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('preserves quoted fields with embedded commas, quotes, and newlines', () => {
    const text = '"a,b","he said ""hi""","line1\nline2"'
    expect(parseCsv(text)).toEqual([['a,b', 'he said "hi"', 'line1\nline2']])
  })

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']])
  })

  it('returns [] for empty or whitespace-only input', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n')).toEqual([])
  })

  it('round-trips through stringify → parse', () => {
    const rows = [
      ['date', 'title', 'amount'],
      ['2026-07-04', 'Coffee, black', '3.50'],
      ['2026-07-05', 'Quote " test', '-9.00'],
      ['2026-07-06', 'Multi\nline', '+12.00'],
    ]
    expect(parseCsv(stringifyCsv(rows))).toEqual(rows)
  })

  it('only quotes fields that require it', () => {
    expect(stringifyCsv([['plain', 'has,comma', 'has"quote']])).toBe(
      'plain,"has,comma","has""quote"'
    )
  })
})
