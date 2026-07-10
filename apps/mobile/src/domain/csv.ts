/**
 * Minimal, dependency-free CSV reader/writer (RFC-4180-ish) for the backup feature (§8 Phase 7).
 *
 * Fields are comma-separated; a field is quoted with `"` when it contains a comma, quote, or
 * newline, and an embedded quote is escaped by doubling it (`""`). Records are separated by
 * `\n` or `\r\n`. This is deliberately small — the CSV import is the "legacy data path", not a
 * general spreadsheet engine — but it round-trips quoted fields with embedded commas/newlines.
 *
 * Pure TypeScript, no React/RN imports (see §4).
 */

/** True if a field must be quoted (contains a delimiter, quote, or line break). */
function needsQuoting(field: string): boolean {
  return /[",\r\n]/.test(field)
}

/** Quote + escape a single field if required. */
function encodeField(field: string): string {
  if (!needsQuoting(field)) return field
  return `"${field.replace(/"/g, '""')}"`
}

/** Serialise a matrix of cells into CSV text (LF line endings, no trailing newline). */
export function stringifyCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(encodeField).join(',')).join('\n')
}

/**
 * Parse CSV text into a matrix of cells. Handles quoted fields (with embedded commas,
 * quotes, and newlines) and both `\n` and `\r\n` line endings. Blank lines are skipped so a
 * trailing newline does not produce a spurious empty record.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let started = false // whether the current row has any content yet

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    // Skip a row that is a single empty field (a blank line / trailing newline).
    if (!(row.length === 1 && row[0] === '' && !started)) {
      rows.push(row)
    }
    row = []
    started = false
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++ // skip the escaped quote
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      started = true
      continue
    }

    if (ch === '"') {
      inQuotes = true
      started = true
    } else if (ch === ',') {
      pushField()
      started = true
    } else if (ch === '\n') {
      pushRow()
    } else if (ch === '\r') {
      // Handled together with a following \n; a lone \r also terminates a record.
      if (text[i + 1] === '\n') i++
      pushRow()
    } else {
      field += ch
      started = true
    }
  }

  // Flush the last record if the text did not end with a newline.
  if (started || field !== '' || row.length > 0) {
    pushField()
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
  }

  return rows
}
