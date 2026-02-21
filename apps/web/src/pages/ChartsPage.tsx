import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { api } from '@/api/client'
import { QueryErrorAlert } from '@/components/QueryErrorAlert'
import { LoadingSpinner } from '@/components/LoadingSpinner'

const MAX_RANGE_DAYS = 366
const DEFAULT_CURRENCY = 'INR'

// --- Defaults ---
function getDefaultMonthlyRange(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10)
  return { from, to }
}

function getDefaultMonth(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function dateRangeDays(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1
}

function formatCurrency(amount: number, currency: string = DEFAULT_CURRENCY): string {
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `
  return `${symbol}${formatter.format(Math.abs(amount))}`
}

// --- API types (schema uses [key: string]: unknown) ---
interface MonthlyDatum {
  month: string
  totalExpense: number
  totalRefund: number
}

interface CategoryDatum {
  categoryId: string
  categoryName: string
  amount: number
}

interface PaymentMethodDatum {
  paymentMethodId: string
  paymentMethodName: string
  amount: number
}

// --- Query keys and hooks ---
const MONTHLY_KEY = ['analytics', 'monthly-expense'] as const
const BY_CATEGORY_KEY = ['analytics', 'expense-by-category'] as const
const BY_PAYMENT_KEY = ['analytics', 'expense-by-payment-method'] as const

function useMonthlyExpense(from: string, to: string) {
  return useQuery({
    queryKey: [...MONTHLY_KEY, from, to],
    queryFn: async (): Promise<MonthlyDatum[]> => {
      const res = await api.GET('/api/v1/analytics/monthly-expense', {
        params: { query: { from, to } },
      })
      if (res.error) {
        const msg =
          res.error.detail != null ? String(res.error.detail) : 'Failed to load monthly expense'
        throw new Error(msg)
      }
      const body = res.data as { data?: MonthlyDatum[] }
      return body.data ?? []
    },
    enabled: Boolean(from && to),
  })
}

function useExpenseByCategory(month: string) {
  return useQuery({
    queryKey: [...BY_CATEGORY_KEY, month],
    queryFn: async (): Promise<CategoryDatum[]> => {
      const res = await api.GET('/api/v1/analytics/expense-by-category', {
        params: { query: { month } },
      })
      if (res.error) {
        const msg =
          res.error.detail != null ? String(res.error.detail) : 'Failed to load by category'
        throw new Error(msg)
      }
      const body = res.data as { data?: CategoryDatum[] }
      return (body.data ?? []).sort((a, b) => b.amount - a.amount)
    },
    enabled: Boolean(month),
  })
}

function useExpenseByPaymentMethod(month: string) {
  return useQuery({
    queryKey: [...BY_PAYMENT_KEY, month],
    queryFn: async (): Promise<PaymentMethodDatum[]> => {
      const res = await api.GET('/api/v1/analytics/expense-by-payment-method', {
        params: { query: { month } },
      })
      if (res.error) {
        const msg =
          res.error.detail != null ? String(res.error.detail) : 'Failed to load by payment method'
        throw new Error(msg)
      }
      const body = res.data as { data?: PaymentMethodDatum[] }
      return (body.data ?? []).sort((a, b) => b.amount - a.amount)
    },
    enabled: Boolean(month),
  })
}

// --- Chart colors ---
const COLORS = [
  '#4F46E5',
  '#059669',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#0891B2',
  '#E11D48',
  '#65A30D',
]
const EXPENSE_COLOR = '#059669'
const REFUND_COLOR = '#DC2626'

type ChartView = 'monthly' | 'category' | 'payment-method'

const TABS: { id: ChartView; label: string }[] = [
  { id: 'monthly', label: 'Monthly trend' },
  { id: 'category', label: 'By category' },
  { id: 'payment-method', label: 'By payment method' },
]

export function ChartsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const viewParam = searchParams.get('view') as ChartView | null
  const view: ChartView = viewParam && TABS.some((t) => t.id === viewParam) ? viewParam : 'monthly'

  const [monthlyRange, setMonthlyRange] = useState(getDefaultMonthlyRange)
  const [categoryMonth, setCategoryMonth] = useState(getDefaultMonth)
  const [paymentMonth, setPaymentMonth] = useState(getDefaultMonth)
  const [categoryChartType, setCategoryChartType] = useState<'bar' | 'pie'>('bar')
  const [paymentChartType, setPaymentChartType] = useState<'bar' | 'pie'>('bar')

  const monthlyRangeDays = useMemo(
    () => dateRangeDays(monthlyRange.from, monthlyRange.to),
    [monthlyRange.from, monthlyRange.to]
  )
  const monthlyRangeValid =
    monthlyRange.from &&
    monthlyRange.to &&
    monthlyRange.from <= monthlyRange.to &&
    monthlyRangeDays <= MAX_RANGE_DAYS

  const monthly = useMonthlyExpense(monthlyRange.from, monthlyRange.to)
  const byCategory = useExpenseByCategory(categoryMonth)
  const byPayment = useExpenseByPaymentMethod(paymentMonth)

  const setView = (id: ChartView) => {
    setSearchParams({ view: id })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Charts</h1>
        <p className="mt-1 text-sm text-gray-600">
          Monthly trend, expense by category, and by payment method.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4" aria-label="Chart sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium ${
                view === tab.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
              aria-current={view === tab.id ? 'true' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Monthly trend */}
      {view === 'monthly' && (
        <section aria-labelledby="monthly-heading">
          <h2 id="monthly-heading" className="sr-only">
            Monthly trend
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="monthly-from" className="block text-xs font-medium text-gray-600">
                  From
                </label>
                <input
                  id="monthly-from"
                  type="date"
                  value={monthlyRange.from}
                  onChange={(e) => setMonthlyRange((r) => ({ ...r, from: e.target.value }))}
                  className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
                  aria-label="Date range start"
                />
              </div>
              <div>
                <label htmlFor="monthly-to" className="block text-xs font-medium text-gray-600">
                  To
                </label>
                <input
                  id="monthly-to"
                  type="date"
                  value={monthlyRange.to}
                  onChange={(e) => setMonthlyRange((r) => ({ ...r, to: e.target.value }))}
                  className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
                  aria-label="Date range end"
                />
              </div>
              {monthlyRangeDays > MAX_RANGE_DAYS && (
                <p className="text-sm text-red-600" role="alert">
                  Date range must not exceed {MAX_RANGE_DAYS} days.
                </p>
              )}
            </div>
            {monthly.error && (
              <QueryErrorAlert message={monthly.error.message} onRetry={() => monthly.refetch()} />
            )}
            {monthly.isLoading && monthlyRangeValid && (
              <div className="flex items-center gap-2 text-gray-500">
                <LoadingSpinner />
                <span>Loading…</span>
              </div>
            )}
            {monthlyRangeValid && !monthly.isLoading && !monthly.error && (
              <>
                {monthly.data && monthly.data.length > 0 ? (
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthly.data}
                        margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          axisLine={{ stroke: '#e5e7eb' }}
                        />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => formatCurrency(v)}
                        />
                        <Tooltip
                          formatter={(value: number) => [formatCurrency(value), '']}
                          labelFormatter={(label) => `Month: ${label}`}
                          contentStyle={{
                            borderRadius: 8,
                            border: '1px solid #e5e7eb',
                          }}
                        />
                        <Legend />
                        <Bar
                          dataKey="totalExpense"
                          name="Expense"
                          fill={EXPENSE_COLOR}
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="totalRefund"
                          name="Refund"
                          fill={REFUND_COLOR}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-gray-600">No data for this range.</p>
                )}
              </>
            )}
            {!monthlyRangeValid && !monthly.error && (
              <p className="text-gray-500">Set a valid date range (max {MAX_RANGE_DAYS} days).</p>
            )}
          </div>
        </section>
      )}

      {/* By category */}
      {view === 'category' && (
        <section aria-labelledby="category-heading">
          <h2 id="category-heading" className="sr-only">
            By category
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="category-month" className="block text-xs font-medium text-gray-600">
                  Month
                </label>
                <input
                  id="category-month"
                  type="month"
                  value={categoryMonth}
                  onChange={(e) => setCategoryMonth(e.target.value)}
                  className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
                  aria-label="Month for category breakdown"
                />
              </div>
              <div className="flex gap-2">
                <span className="block text-xs font-medium text-gray-600">Chart:</span>
                <button
                  type="button"
                  onClick={() => setCategoryChartType('bar')}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    categoryChartType === 'bar'
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Bar
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryChartType('pie')}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    categoryChartType === 'pie'
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pie
                </button>
              </div>
            </div>
            {byCategory.error && (
              <QueryErrorAlert
                message={byCategory.error.message}
                onRetry={() => byCategory.refetch()}
              />
            )}
            {byCategory.isLoading && (
              <div className="flex items-center gap-2 text-gray-500">
                <LoadingSpinner />
                <span>Loading…</span>
              </div>
            )}
            {!byCategory.isLoading && !byCategory.error && (
              <>
                {byCategory.data && byCategory.data.length > 0 ? (
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {categoryChartType === 'bar' ? (
                        <BarChart
                          data={byCategory.data}
                          layout="vertical"
                          margin={{ top: 8, right: 24, left: 100, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                          <XAxis
                            type="number"
                            tickFormatter={(v) => formatCurrency(v)}
                            tick={{ fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: '#e5e7eb' }}
                          />
                          <YAxis
                            type="category"
                            dataKey="categoryName"
                            width={90}
                            tick={{ fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            formatter={(value: number) => [formatCurrency(value), 'Amount']}
                            contentStyle={{
                              borderRadius: 8,
                              border: '1px solid #e5e7eb',
                            }}
                          />
                          <Bar
                            dataKey="amount"
                            name="Amount"
                            fill={COLORS[0]}
                            radius={[0, 4, 4, 0]}
                          />
                        </BarChart>
                      ) : (
                        <PieChart>
                          <Pie
                            data={byCategory.data}
                            dataKey="amount"
                            nameKey="categoryName"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={({ categoryName, amount }) =>
                              `${categoryName}: ${formatCurrency(amount)}`
                            }
                            labelLine={false}
                          >
                            {byCategory.data.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => formatCurrency(value)}
                            contentStyle={{
                              borderRadius: 8,
                              border: '1px solid #e5e7eb',
                            }}
                          />
                          <Legend />
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-gray-600">No expenses in this month.</p>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* By payment method */}
      {view === 'payment-method' && (
        <section aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="sr-only">
            By payment method
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="payment-month" className="block text-xs font-medium text-gray-600">
                  Month
                </label>
                <input
                  id="payment-month"
                  type="month"
                  value={paymentMonth}
                  onChange={(e) => setPaymentMonth(e.target.value)}
                  className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
                  aria-label="Month for payment method breakdown"
                />
              </div>
              <div className="flex gap-2">
                <span className="block text-xs font-medium text-gray-600">Chart:</span>
                <button
                  type="button"
                  onClick={() => setPaymentChartType('bar')}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    paymentChartType === 'bar'
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Bar
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentChartType('pie')}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    paymentChartType === 'pie'
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pie
                </button>
              </div>
            </div>
            {byPayment.error && (
              <QueryErrorAlert
                message={byPayment.error.message}
                onRetry={() => byPayment.refetch()}
              />
            )}
            {byPayment.isLoading && (
              <div className="flex items-center gap-2 text-gray-500">
                <LoadingSpinner />
                <span>Loading…</span>
              </div>
            )}
            {!byPayment.isLoading && !byPayment.error && (
              <>
                {byPayment.data && byPayment.data.length > 0 ? (
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {paymentChartType === 'bar' ? (
                        <BarChart
                          data={byPayment.data}
                          layout="vertical"
                          margin={{ top: 8, right: 24, left: 100, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                          <XAxis
                            type="number"
                            tickFormatter={(v) => formatCurrency(v)}
                            tick={{ fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: '#e5e7eb' }}
                          />
                          <YAxis
                            type="category"
                            dataKey="paymentMethodName"
                            width={90}
                            tick={{ fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            formatter={(value: number) => [formatCurrency(value), 'Amount']}
                            contentStyle={{
                              borderRadius: 8,
                              border: '1px solid #e5e7eb',
                            }}
                          />
                          <Bar
                            dataKey="amount"
                            name="Amount"
                            fill={COLORS[0]}
                            radius={[0, 4, 4, 0]}
                          />
                        </BarChart>
                      ) : (
                        <PieChart>
                          <Pie
                            data={byPayment.data}
                            dataKey="amount"
                            nameKey="paymentMethodName"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={({ paymentMethodName, amount }) =>
                              `${paymentMethodName}: ${formatCurrency(amount)}`
                            }
                            labelLine={false}
                          >
                            {byPayment.data.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => formatCurrency(value)}
                            contentStyle={{
                              borderRadius: 8,
                              border: '1px solid #e5e7eb',
                            }}
                          />
                          <Legend />
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-gray-600">No expenses in this month.</p>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
