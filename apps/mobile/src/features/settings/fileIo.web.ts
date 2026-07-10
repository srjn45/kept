/**
 * Web file I/O for backup export/import (§8 Phase 7). Metro picks this over `fileIo.ts` on web.
 *
 * The web build has no share sheet and its SQLite lives in browser storage the browser may evict
 * (§1) — so export/backup matters MOST here. Export triggers a plain Blob download; import opens
 * a hidden `<input type=file>` and reads the picked file as text. Same {@link ExportRequest} /
 * {@link PickedFile} contract as the native module.
 */
export type FileKind = 'json' | 'csv'
export type ExportRequest = { filename: string; mimeType: string; content: string }
export type PickedFile = { name: string; content: string }

/** Download the content as a file via a temporary object URL + anchor click. */
export async function exportFile({ filename, mimeType, content }: ExportRequest): Promise<void> {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Give the download a tick to start before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Open a file picker and resolve the chosen file's text, or null if the user cancels. */
export async function pickTextFile(kind: FileKind): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = kind === 'json' ? 'application/json,.json' : 'text/csv,.csv,text/plain'
    input.style.display = 'none'
    document.body.appendChild(input)

    let settled = false
    const finish = (value: PickedFile | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus)
      input.remove()
      resolve(value)
    }

    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return finish(null)
      const reader = new FileReader()
      reader.onload = () => finish({ name: file.name, content: String(reader.result ?? '') })
      reader.onerror = () => finish(null)
      reader.readAsText(file)
    }

    // If the dialog is dismissed without a selection, `onchange` never fires. The window regains
    // focus when the dialog closes; if no file was picked shortly after, treat it as a cancel so
    // the caller's "importing…" state never hangs.
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files || input.files.length === 0) finish(null)
      }, 350)
    }
    window.addEventListener('focus', onFocus)

    input.click()
  })
}
