import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { api } from '@/api/client'
import type { LedgerEntry } from '@/types/ledger-entry'
import { QueryErrorAlert } from '@/components/QueryErrorAlert'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const DASHBOARD_QUERY_KEY = ['analytics', 'dashboard'] as const
const MAX_RANGE_DAYS = 366
const DEFAULT_CURRENCY = 'INR'

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  return { from, to }
}

function formatCurrency(amount: number, currency: string = DEFAULT_CURRENCY): string {
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const formatted = formatter.format(Math.abs(amount))
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `
  return amount < 0 ? `−${symbol}${formatted}` : `${symbol}${formatted}`
}

function formatAmount(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const formatted = formatter.format(Math.abs(amount))
  return amount < 0 ? `−${currency} ${formatted}` : `${currency} ${formatted}`
}

interface DashboardData {
  totalExpense: number
  totalRefund: number
  entryCount: number
  lastEntries: LedgerEntry[]
}

function useDashboard(from: string, to: string) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, from, to],
    queryFn: async (): Promise<DashboardData> => {
      const res = await api.GET('/api/v1/analytics/dashboard', {
        params: { query: { from, to } },
      })
      if (res.error) {
        const msg = res.error.detail != null ? String(res.error.detail) : 'Failed to load dashboard'
        throw new Error(msg)
      }
      const d = res.data as DashboardData
      return {
        totalExpense: d.totalExpense ?? 0,
        totalRefund: d.totalRefund ?? 0,
        entryCount: d.entryCount ?? 0,
        lastEntries: d.lastEntries ?? [],
      }
    },
    enabled: Boolean(from && to),
  })
}

function dateRangeDays(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1
}

export function DashboardPage() {
  const [range, setRange] = useState(getDefaultDateRange)
  const from = range.from
  const to = range.to
  const rangeDays = useMemo(() => dateRangeDays(from, to), [from, to])
  const rangeValid = from && to && from <= to && rangeDays <= MAX_RANGE_DAYS

  const dashboard = useDashboard(from, to)

  const handleFromChange = (value: string) => setRange((r) => ({ ...r, from: value }))
  const handleToChange = (value: string) => setRange((r) => ({ ...r, to: value }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Summary and recent entries for the selected date range.
        </p>
      </div>

      {/* Date range */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="dashboard-from" className="block text-xs font-medium text-gray-600">
              From
            </label>
            <input
              id="dashboard-from"
              type="date"
              value={from}
              onChange={(e) => handleFromChange(e.target.value)}
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
              aria-label="Date range start"
            />
          </div>
          <div>
            <label htmlFor="dashboard-to" className="block text-xs font-medium text-gray-600">
              To
            </label>
            <input
              id="dashboard-to"
              type="date"
              value={to}
              onChange={(e) => handleToChange(e.target.value)}
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
              aria-label="Date range end"
            />
          </div>
          {rangeDays > MAX_RANGE_DAYS && (
            <p className="text-sm text-red-600" role="alert">
              Date range must not exceed {MAX_RANGE_DAYS} days.
            </p>
          )}
        </div>
      </div>

      {dashboard.error && (
        <QueryErrorAlert message={dashboard.error.message} onRetry={() => dashboard.refetch()} />
      )}

      {dashboard.isLoading && rangeValid ? (
        <div className="flex items-center gap-2 text-gray-500">
          <LoadingSpinner />
          <span>Loading…</span>
        </div>
      ) : !rangeValid ? (
        <p className="text-gray-500">Set a valid date range (max {MAX_RANGE_DAYS} days).</p>
      ) : dashboard.error ? null : dashboard.data ? (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(dashboard.data.totalExpense)}
              </p>
              <p className="mt-1 text-sm text-gray-600">Sum of expenses in range.</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(dashboard.data.totalRefund)}
              </p>
              <p className="mt-1 text-sm text-gray-600">Refunds in range.</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-2xl font-semibold text-gray-900">{dashboard.data.entryCount}</p>
              <p className="mt-1 text-sm text-gray-600">Transactions in range.</p>
            </div>
          </div>

          {/* Last entries */}
          <section aria-labelledby="last-entries-heading">
            <h2 id="last-entries-heading" className="text-lg font-medium text-gray-900">
              Recent entries
            </h2>
            {dashboard.data.lastEntries.length === 0 ? (
              <p className="mt-2 text-gray-600">No entries in this range.</p>
            ) : (
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600"
                      >
                        Date
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600"
                      >
                        Description
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600"
                      >
                        Category
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600"
                      >
                        Payment method
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600"
                      >
                        Amount
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600"
                      >
                        Tags
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {dashboard.data.lastEntries.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                          {row.date}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-4 py-3 text-sm text-gray-900"
                          title={row.description}
                        >
                          {row.description}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                          {row.categoryName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                          {row.paymentMethodName}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right text-sm font-medium ${
                            Number(row.amount) < 0 ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {formatAmount(Number(row.amount), row.currency)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {row.tags?.length ? row.tags.join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dashboard.data.lastEntries.length > 0 && (
              <p className="mt-2">
                <Link to="/ledger" className="text-sm font-medium text-gray-900 hover:underline">
                  View in Ledger
                </Link>
              </p>
            )}
          </section>

          {/* Links to charts */}
          <p className="text-sm text-gray-600">
            View{' '}
            <Link to="/charts?view=monthly" className="font-medium text-gray-900 hover:underline">
              Monthly trend
            </Link>{' '}
            (bar chart) ·{' '}
            <Link to="/charts?view=category" className="font-medium text-gray-900 hover:underline">
              By category
            </Link>{' '}
            (bar/pie) ·{' '}
            <Link
              to="/charts?view=payment-method"
              className="font-medium text-gray-900 hover:underline"
            >
              By payment method
            </Link>{' '}
            (bar/pie).
          </p>
        </>
      ) : (
        <p className="text-gray-500">Loading…</p>
      )}
    </div>
  )
}
