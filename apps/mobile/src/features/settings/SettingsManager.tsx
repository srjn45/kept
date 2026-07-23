import { useCallback, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { Button, Card, Screen } from '@/components'
import {
  exportEntriesCsv,
  importBackup,
  importEntriesCsv,
  serializeBackup,
  type AppDatabase,
  type CsvImportReport,
} from '@/data'
import { parseBackupText, todayISO, type BackupFile } from '@/domain'

import type { ExportRequest, FileKind, PickedFile } from './fileIo'

/**
 * Settings screen — the home for backup export / import (§7.5 · §8 Phase 7). Pure and
 * DB-injected: it imports NO expo-sqlite and NO platform file I/O directly. The route wrapper
 * ({@link SettingsScreen}) provides `getDatabase()` plus the platform `exportFile`/`pickTextFile`
 * (native share sheet / web download), so the whole flow runs under Jest against in-memory
 * better-sqlite3 with injected file callbacks.
 *
 * SCOPE: this phase's DoD (§8 Phase 7) is export/import only. Change-PIN / toggle-biometrics /
 * default-currency editing (§7.5) are intentionally NOT built here — they belong to the lock
 * feature and are out of Phase 7's scope.
 */
export type SettingsManagerProps = {
  db: AppDatabase
  /** App version stamped into the JSON backup envelope. */
  appVersion: string
  /** Default currency assumed for CSV rows with a blank currency cell. */
  defaultCurrency: string
  /** Bump the app's reactive read signal after an import writes many rows (web reactivity, §8). */
  onChanged?: () => void
  /** Navigate back to the ledger. */
  onBack?: () => void
  /** Platform export (native share sheet / web download). Injected for testability. */
  exportFile: (req: ExportRequest) => Promise<void>
  /** Platform file picker returning the file's text, or null if cancelled. Injected. */
  pickTextFile: (kind: FileKind) => Promise<PickedFile | null>
}

type Notice =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'report'; report: CsvImportReport }
  | null

/** A parsed, validated backup awaiting the user's Replace-vs-Merge choice. */
type PendingRestore = { backup: BackupFile; fileName: string }

type BusyAction = 'export-json' | 'export-csv' | 'import-json' | 'import-csv' | 'restore' | null

export function SettingsManager({
  db,
  appVersion,
  defaultCurrency,
  onChanged,
  onBack,
  exportFile,
  pickTextFile,
}: SettingsManagerProps) {
  const [busy, setBusy] = useState<BusyAction>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<PendingRestore | null>(null)
  const busyRef = useRef<BusyAction>(null)

  const run = useCallback(async (action: BusyAction, fn: () => Promise<void>) => {
    if (busyRef.current) return // ignore taps while another action is in flight
    busyRef.current = action
    setBusy(action)
    try {
      await fn()
    } catch (e) {
      setNotice({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      busyRef.current = null
      setBusy(null)
    }
  }, [])

  const handleExportJson = () =>
    run('export-json', async () => {
      setNotice(null)
      const content = serializeBackup(db, appVersion)
      await exportFile({
        filename: `kept-backup-${todayISO()}.json`,
        mimeType: 'application/json',
        content,
      })
      setNotice({ kind: 'success', message: 'Backup exported.' })
    })

  const handleExportCsv = () =>
    run('export-csv', async () => {
      setNotice(null)
      const content = exportEntriesCsv(db)
      await exportFile({
        filename: `kept-${todayISO()}.csv`,
        mimeType: 'text/csv',
        content,
      })
      setNotice({ kind: 'success', message: 'Expenses exported to CSV.' })
    })

  const handlePickBackup = () =>
    run('import-json', async () => {
      setNotice(null)
      setPending(null)
      const file = await pickTextFile('json')
      if (!file) return // cancelled
      const parsed = parseBackupText(file.content)
      if (!parsed.ok) {
        setNotice({ kind: 'error', message: parsed.message })
        return
      }
      setPending({ backup: parsed.backup, fileName: file.name })
    })

  const applyRestore = (strategy: 'replace' | 'merge') => {
    if (!pending) return
    return run('restore', async () => {
      const entryCount = pending.backup.data.ledgerEntries.length
      importBackup(db, pending.backup, { strategy })
      setPending(null)
      onChanged?.()
      setNotice({
        kind: 'success',
        message:
          strategy === 'replace'
            ? `Restored ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} from the backup.`
            : `Merged the backup (${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}).`,
      })
    })
  }

  const handleImportCsv = () =>
    run('import-csv', async () => {
      setNotice(null)
      const file = await pickTextFile('csv')
      if (!file) return // cancelled
      const report = importEntriesCsv(db, file.content, { defaultCurrency })
      onChanged?.()
      setNotice({ kind: 'report', report })
    })

  return (
    <Screen scroll contentClassName="gap-4">
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        className="self-start"
        testID="settings-back"
      >
        <Text className="text-base text-primary">‹ Back</Text>
      </Pressable>

      <Text className="text-2xl font-semibold text-fg">Settings</Text>

      {/* Your-data-stays-with-you note + web-storage caveat (§1 / §7.5). */}
      <Card className="gap-1">
        <Text className="text-base font-semibold text-fg">Your data stays with you</Text>
        <Text className="text-sm text-muted">
          Everything is stored on this device — there is no account and no server. On the web, your
          data lives in this browser&apos;s storage, which the browser can clear, so export a backup
          regularly. On your phone it stays on the device.
        </Text>
      </Card>

      {/* Export */}
      <Card className="gap-3">
        <View className="gap-0.5">
          <Text className="text-base font-semibold text-fg">Export</Text>
          <Text className="text-sm text-muted">
            A JSON backup captures everything (a full, restorable copy). A CSV lists your current
            expenses for a spreadsheet.
          </Text>
        </View>
        <View className="gap-2">
          <Button
            label="Export backup (JSON)"
            onPress={handleExportJson}
            loading={busy === 'export-json'}
            disabled={busy !== null}
            fullWidth
            testID="settings-export-json"
          />
          <Button
            label="Export expenses (CSV)"
            variant="secondary"
            onPress={handleExportCsv}
            loading={busy === 'export-csv'}
            disabled={busy !== null}
            fullWidth
            testID="settings-export-csv"
          />
        </View>
      </Card>

      {/* Import */}
      <Card className="gap-3">
        <View className="gap-0.5">
          <Text className="text-base font-semibold text-fg">Import</Text>
          <Text className="text-sm text-muted">
            Restore a JSON backup, or bring in expenses from a CSV (columns: date, title, amount,
            currency, category, tags, description).
          </Text>
        </View>
        <View className="gap-2">
          <Button
            label="Restore from backup (JSON)"
            variant="secondary"
            onPress={handlePickBackup}
            loading={busy === 'import-json'}
            disabled={busy !== null}
            fullWidth
            testID="settings-import-json"
          />
          <Button
            label="Import expenses (CSV)"
            variant="secondary"
            onPress={handleImportCsv}
            loading={busy === 'import-csv'}
            disabled={busy !== null}
            fullWidth
            testID="settings-import-csv"
          />
        </View>
      </Card>

      {/* Replace-vs-Merge confirmation for a validated backup. */}
      {pending ? (
        <Card className="gap-3 border-primary" testID="settings-restore-confirm">
          <View className="gap-0.5">
            <Text className="text-base font-semibold text-fg">Restore “{pending.fileName}”?</Text>
            <Text className="text-sm text-muted">
              Replace erases everything currently in the app and installs the backup exactly. Merge
              keeps your current data and adds anything from the backup that isn&apos;t already
              here.
            </Text>
          </View>
          <View className="gap-2">
            <Button
              label="Replace everything"
              variant="danger"
              onPress={() => applyRestore('replace')}
              loading={busy === 'restore'}
              disabled={busy !== null}
              fullWidth
              testID="settings-restore-replace"
            />
            <Button
              label="Merge"
              variant="secondary"
              onPress={() => applyRestore('merge')}
              disabled={busy !== null}
              fullWidth
              testID="settings-restore-merge"
            />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setPending(null)}
              disabled={busy !== null}
              fullWidth
              testID="settings-restore-cancel"
            />
          </View>
        </Card>
      ) : null}

      {/* Result notice: success / error / CSV import report. */}
      {notice?.kind === 'success' ? (
        <Card className="gap-1 border-success" testID="settings-notice">
          <Text className="text-sm font-medium text-fg">{notice.message}</Text>
        </Card>
      ) : notice?.kind === 'error' ? (
        <Card className="gap-1 border-danger" testID="settings-notice">
          <Text className="text-sm font-medium text-danger">{notice.message}</Text>
        </Card>
      ) : notice?.kind === 'report' ? (
        <Card className="gap-2 border-primary" testID="settings-import-report">
          <Text className="text-base font-semibold text-fg">
            {notice.report.imported} imported
            {notice.report.duplicates > 0
              ? `, ${notice.report.duplicates} duplicate${notice.report.duplicates === 1 ? '' : 's'} skipped`
              : ''}
            {notice.report.skipped > 0 ? `, ${notice.report.skipped} skipped` : ''}
          </Text>
          {notice.report.errors.length > 0 ? (
            <View className="gap-1">
              {notice.report.errors.slice(0, 12).map((err) => (
                <Text key={err.row} className="text-xs text-muted">
                  Row {err.row}: {err.reason}
                </Text>
              ))}
              {notice.report.errors.length > 12 ? (
                <Text className="text-xs text-muted">
                  …and {notice.report.errors.length - 12} more.
                </Text>
              ) : null}
            </View>
          ) : notice.report.total === 0 ? (
            <Text className="text-xs text-muted">The file had no rows to import.</Text>
          ) : null}
        </Card>
      ) : null}

      {/* App version — helps users report the exact build they're on. */}
      <Text className="mt-2 text-center text-xs text-muted" testID="settings-app-version">
        Version {appVersion}
      </Text>
    </Screen>
  )
}
