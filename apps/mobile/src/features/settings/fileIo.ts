/**
 * Native file I/O for backup export/import (§8 Phase 7).
 *
 * Metro resolves this `.ts` on iOS/Android and the sibling `fileIo.web.ts` on web, so each
 * platform gets its natural affordance without runtime branching: native uses the OS share
 * sheet (`expo-sharing`) + document picker (`expo-document-picker`); web downloads a Blob and
 * opens a `<input type=file>` (see `fileIo.web.ts`). The Settings UI depends only on the shared
 * {@link ExportRequest}/{@link PickedFile} contract and is injected with these functions, so it
 * stays platform-agnostic and unit-testable.
 */
import { File, Paths } from 'expo-file-system'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'

export type FileKind = 'json' | 'csv'
export type ExportRequest = { filename: string; mimeType: string; content: string }
export type PickedFile = { name: string; content: string }

/** Write the content to a cache file and open the OS share sheet targeting it. */
export async function exportFile({ filename, mimeType, content }: ExportRequest): Promise<void> {
  const file = new File(Paths.cache, filename)
  if (file.exists) file.delete()
  file.create()
  file.write(content)

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle: filename,
      UTI: mimeType === 'application/json' ? 'public.json' : 'public.comma-separated-values-text',
    })
  }
}

/** Open the OS document picker, returning the chosen file's text, or null if cancelled. */
export async function pickTextFile(kind: FileKind): Promise<PickedFile | null> {
  const type =
    kind === 'json'
      ? ['application/json', 'text/json', '*/*']
      : ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*']
  const result = await DocumentPicker.getDocumentAsync({
    type,
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset) return null
  const content = new File(asset.uri).textSync()
  return { name: asset.name, content }
}
