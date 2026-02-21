import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { api } from '@/api/client'
import type { LedgerEntry } from '@/types/ledger-entry'
import type { PaymentMethod } from '@/types/payment-method'
import type { Category } from '@/types/category'
import type { components } from '@/api/schema'
import { TagInput } from '@/components/TagInput'
import { QueryErrorAlert } from '@/components/QueryErrorAlert'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useFocusModal } from '@/hooks/useFocusModal'

const ledgerEntryFormSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description must be at most 500 characters')
    .transform((s) => s.trim()),
  categoryId: z.string().uuid('Select a category'),
  paymentMethodId: z.string().uuid('Select a payment method'),
  amount: z.coerce.number({ message: 'Amount is required' }),
  tags: z.array(z.string()).default([]),
})

type LedgerEntryFormValues = z.infer<typeof ledgerEntryFormSchema>

const LEDGER_QUERY_KEY = ['ledger-entries'] as const
const PAYMENT_METHODS_QUERY_KEY = ['payment-methods'] as const
const CATEGORIES_QUERY_KEY = ['categories'] as const

function formatAmount(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const formatted = formatter.format(Math.abs(amount))
  return amount < 0 ? `−${currency} ${formatted}` : `${currency} ${formatted}`
}

function useLedgerEntries(filters: {
  dateFrom?: string
  dateTo?: string
  categoryId?: string
  paymentMethodId?: string
}) {
  return useInfiniteQuery({
    queryKey: [...LEDGER_QUERY_KEY, filters],
    queryFn: async ({ pageParam }): Promise<{ data: LedgerEntry[]; nextCursor: string | null }> => {
      const res = (await api.GET('/api/v1/ledger-entries', {
        params: {
          query: {
            cursor: pageParam ?? undefined,
            limit: 50,
            dateFrom: filters.dateFrom || undefined,
            dateTo: filters.dateTo || undefined,
            categoryId: filters.categoryId || undefined,
            paymentMethodId: filters.paymentMethodId || undefined,
          },
        },
      })) as unknown as
        | { data: { data: LedgerEntry[]; nextCursor: string | null }; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) {
        const msg =
          res.error.detail != null ? String(res.error.detail) : 'Failed to load ledger entries'
        throw new Error(msg)
      }
      return { data: res.data.data ?? [], nextCursor: res.data.nextCursor ?? null }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

function usePaymentMethods() {
  return useQuery({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    queryFn: async (): Promise<PaymentMethod[]> => {
      const res = (await api.GET('/api/v1/payment-methods')) as
        | { data: { data: PaymentMethod[] }; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) throw new Error('Failed to load payment methods')
      return res.data.data ?? []
    },
  })
}

function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: async (): Promise<Category[]> => {
      const res = (await api.GET('/api/v1/categories')) as
        | { data: { data: Category[] }; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) throw new Error('Failed to load categories')
      return res.data.data ?? []
    },
  })
}

const today = () => new Date().toISOString().slice(0, 10)

export function LedgerPage() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null)
  const [filters, setFilters] = useState<{
    dateFrom: string
    dateTo: string
    categoryId: string
    paymentMethodId: string
  }>({ dateFrom: '', dateTo: '', categoryId: '', paymentMethodId: '' })
  const [filtersApplied, setFiltersApplied] = useState(filters)

  const { data: paymentMethods = [] } = usePaymentMethods()
  const { data: categories = [] } = useCategories()
  const ledgerQuery = useLedgerEntries({
    dateFrom: filtersApplied.dateFrom || undefined,
    dateTo: filtersApplied.dateTo || undefined,
    categoryId: filtersApplied.categoryId || undefined,
    paymentMethodId: filtersApplied.paymentMethodId || undefined,
  })

  const entries = useMemo(
    () => ledgerQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [ledgerQuery.data]
  )
  const hasNextPage = ledgerQuery.data?.pages.at(-1)?.nextCursor != null
  const hasFilters =
    !!filtersApplied.dateFrom ||
    !!filtersApplied.dateTo ||
    !!filtersApplied.categoryId ||
    !!filtersApplied.paymentMethodId

  const createMutation = useMutation({
    mutationFn: async (body: components['schemas']['LedgerEntryCreate']) => {
      const res = (await api.POST('/api/v1/ledger-entries', { body })) as
        | { data: unknown; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) {
        throw new Error(res.error.detail != null ? String(res.error.detail) : 'Failed to create')
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY })
      setModalOpen(false)
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: components['schemas']['LedgerEntryCreate']
    }) => {
      const res = (await api.PUT('/api/v1/ledger-entries/{id}', {
        params: { path: { id } },
        body,
      })) as
        | { data: unknown; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) {
        throw new Error(res.error.detail != null ? String(res.error.detail) : 'Failed to update')
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY })
      setModalOpen(false)
      setEditingId(null)
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = (await api.DELETE('/api/v1/ledger-entries/{id}', {
        params: { path: { id } },
      })) as
        | { data: unknown; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) {
        throw new Error(res.error.detail != null ? String(res.error.detail) : 'Failed to delete')
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY })
      setDeleteTarget(null)
    },
  })

  const form = useForm<LedgerEntryFormValues>({
    resolver: zodResolver(ledgerEntryFormSchema) as never,
    defaultValues: {
      date: today(),
      description: '',
      categoryId: '',
      paymentMethodId: '',
      amount: 0,
      tags: [],
    },
  })

  const resetForm = () =>
    form.reset({
      date: today(),
      description: '',
      categoryId: '',
      paymentMethodId: '',
      amount: 0,
      tags: [],
    })

  const openCreate = () => {
    setEditingId(null)
    resetForm()
    setModalOpen(true)
  }

  const openEdit = (row: LedgerEntry) => {
    setEditingId(row.id)
    form.reset({
      date: row.date,
      description: row.description,
      categoryId: row.categoryId,
      paymentMethodId: row.paymentMethodId,
      amount: Number(row.amount),
      tags: row.tags ?? [],
    })
    setModalOpen(true)
  }

  const onSubmit = form.handleSubmit((values) => {
    const body: components['schemas']['LedgerEntryCreate'] = {
      date: values.date,
      description: values.description,
      categoryId: values.categoryId,
      paymentMethodId: values.paymentMethodId,
      amount: values.amount,
      tags: values.tags?.length ? values.tags : undefined,
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, body })
    } else {
      createMutation.mutate(body)
    }
  })

  const applyFilters = () => setFiltersApplied({ ...filters })
  const clearFilters = () => {
    setFilters({ dateFrom: '', dateTo: '', categoryId: '', paymentMethodId: '' })
    setFiltersApplied({ dateFrom: '', dateTo: '', categoryId: '', paymentMethodId: '' })
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const ledgerModalRef = useFocusModal(modalOpen)
  const deleteModalRef = useFocusModal(!!deleteTarget)

  const showOnboardingBanner = paymentMethods.length === 0 || categories.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ledger</h1>
          <p className="mt-1 text-sm text-gray-600">
            All your expense and refund entries. Newest first.
          </p>
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            Add entry
          </button>
        </div>
      </div>

      {showOnboardingBanner && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          <p>
            Add at least one{' '}
            <Link to="/payment-methods" className="font-medium underline hover:no-underline">
              payment method
            </Link>{' '}
            and one{' '}
            <Link to="/categories" className="font-medium underline hover:no-underline">
              category
            </Link>{' '}
            to start recording expenses.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="filter-dateFrom" className="block text-xs font-medium text-gray-600">
              Date from
            </label>
            <input
              id="filter-dateFrom"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="filter-dateTo" className="block text-xs font-medium text-gray-600">
              Date to
            </label>
            <input
              id="filter-dateTo"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="filter-category" className="block text-xs font-medium text-gray-600">
              Category
            </label>
            <select
              id="filter-category"
              value={filters.categoryId}
              onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-pm" className="block text-xs font-medium text-gray-600">
              Payment method
            </label>
            <select
              id="filter-pm"
              value={filters.paymentMethodId}
              onChange={(e) => setFilters((f) => ({ ...f, paymentMethodId: e.target.value }))}
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {paymentMethods.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Apply filters
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {ledgerQuery.error && (
        <QueryErrorAlert
          message={ledgerQuery.error.message}
          onRetry={() => ledgerQuery.refetch()}
        />
      )}

      {ledgerQuery.isLoading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <LoadingSpinner />
          <span>Loading…</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">
            {hasFilters
              ? 'No entries match the filters. Try changing them.'
              : 'No entries yet. Add your first expense or refund.'}
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Add entry
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
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
                  <th scope="col" className="relative px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {entries.map((row) => (
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
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        Edit
                      </button>
                      <span className="mx-2 text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(row)}
                        className="font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasNextPage && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => ledgerQuery.fetchNextPage()}
                disabled={ledgerQuery.isFetchingNextPage}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {ledgerQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
          {!hasNextPage && entries.length > 0 && (
            <p className="text-center text-sm text-gray-500">No more entries</p>
          )}
        </>
      )}

      {/* Add / Edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ledger-entry-modal-title"
        >
          <div
            ref={ledgerModalRef}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id="ledger-entry-modal-title" className="text-lg font-semibold text-gray-900">
              {editingId ? 'Edit entry' : 'Add entry'}
            </h2>
            <form onSubmit={onSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="entry-date" className="block text-sm font-medium text-gray-700">
                  Date
                </label>
                <input
                  id="entry-date"
                  type="date"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  {...form.register('date')}
                />
                {form.formState.errors.date && (
                  <p className="mt-1 text-sm text-red-600">{form.formState.errors.date.message}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="entry-description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Description
                </label>
                <input
                  id="entry-description"
                  type="text"
                  maxLength={500}
                  placeholder="What was this for?"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  {...form.register('description')}
                />
                {form.formState.errors.description && (
                  <p className="mt-1 text-sm text-red-600">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="entry-category" className="block text-sm font-medium text-gray-700">
                  Category
                </label>
                <select
                  id="entry-category"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  {...form.register('categoryId')}
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.categoryId && (
                  <p className="mt-1 text-sm text-red-600">
                    {form.formState.errors.categoryId.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="entry-pm" className="block text-sm font-medium text-gray-700">
                  Payment method
                </label>
                <select
                  id="entry-pm"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  {...form.register('paymentMethodId')}
                >
                  <option value="">Select payment method</option>
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name} ({pm.currency})
                    </option>
                  ))}
                </select>
                {form.formState.errors.paymentMethodId && (
                  <p className="mt-1 text-sm text-red-600">
                    {form.formState.errors.paymentMethodId.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="entry-amount" className="block text-sm font-medium text-gray-700">
                  Amount (negative for refund)
                </label>
                <input
                  id="entry-amount"
                  type="number"
                  step="any"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  {...form.register('amount', { valueAsNumber: true })}
                />
                {form.formState.errors.amount && (
                  <p className="mt-1 text-sm text-red-600">
                    {form.formState.errors.amount.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="entry-tags" className="block text-sm font-medium text-gray-700">
                  Tags
                </label>
                <Controller
                  name="tags"
                  control={form.control}
                  render={({ field }) => (
                    <TagInput
                      id="entry-tags"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Type and press Enter to add"
                      aria-label="Tags"
                    />
                  )}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false)
                    setEditingId(null)
                    resetForm()
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {editingId ? 'Save' : 'Create entry'}
                </button>
              </div>
            </form>
            {(createMutation.isError || updateMutation.isError) && (
              <p className="mt-2 text-sm text-red-600">
                {(createMutation.error ?? updateMutation.error)?.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-entry-confirm-title"
        >
          <div ref={deleteModalRef} className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="delete-entry-confirm-title" className="text-lg font-semibold text-gray-900">
              Delete entry?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to delete this entry? This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
            {deleteMutation.isError && (
              <p className="mt-2 text-sm text-red-600">{deleteMutation.error?.message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
