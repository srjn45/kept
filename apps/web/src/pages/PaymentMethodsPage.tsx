import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/api/client'
import type { PaymentMethod } from '@/types/payment-method'
import type { components } from '@/api/schema'
import { QueryErrorAlert } from '@/components/QueryErrorAlert'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useFocusModal } from '@/hooks/useFocusModal'

const paymentMethodFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters')
    .transform((s) => s.trim()),
  currency: z
    .string()
    .min(1, 'Currency is required')
    .max(10, 'Currency must be at most 10 characters')
    .transform((s) => s.trim()),
})

type PaymentMethodFormValues = z.infer<typeof paymentMethodFormSchema>

const PAYMENT_METHODS_QUERY_KEY = ['payment-methods'] as const

function usePaymentMethods() {
  return useQuery({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    queryFn: async (): Promise<PaymentMethod[]> => {
      const res = (await api.GET('/api/v1/payment-methods')) as
        | { data: { data: PaymentMethod[] }; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) {
        const msg =
          res.error.detail != null ? String(res.error.detail) : 'Failed to load payment methods'
        throw new Error(msg)
      }
      return res.data.data ?? []
    },
  })
}

export function PaymentMethodsPage() {
  const queryClient = useQueryClient()
  const { data: items = [], isLoading, error, refetch } = usePaymentMethods()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethod | null>(null)
  const formModalRef = useFocusModal(modalOpen)
  const deleteModalRef = useFocusModal(!!deleteTarget)

  const createMutation = useMutation({
    mutationFn: async (body: components['schemas']['PaymentMethodCreate']) => {
      const res = (await api.POST('/api/v1/payment-methods', { body })) as
        | { data: unknown; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) {
        throw new Error(res.error.detail != null ? String(res.error.detail) : 'Failed to create')
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY })
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
      body: components['schemas']['PaymentMethodCreate']
    }) => {
      const res = (await api.PUT('/api/v1/payment-methods/{id}', {
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
      queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY })
      setModalOpen(false)
      setEditingId(null)
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = (await api.DELETE('/api/v1/payment-methods/{id}', {
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
      queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY })
      setDeleteTarget(null)
    },
  })

  const form = useForm<PaymentMethodFormValues>({
    resolver: zodResolver(paymentMethodFormSchema),
    defaultValues: { name: '', currency: '' },
  })

  const resetForm = () => form.reset({ name: '', currency: '' })

  const openCreate = () => {
    setEditingId(null)
    resetForm()
    setModalOpen(true)
  }

  const openEdit = (row: PaymentMethod) => {
    setEditingId(row.id)
    form.reset({ name: row.name, currency: row.currency })
    setModalOpen(true)
  }

  const onSubmit = form.handleSubmit((values) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, body: values })
    } else {
      createMutation.mutate(values)
    }
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payment methods</h1>
          <p className="mt-1 text-sm text-gray-600">
            Add cards, cash, UPI, etc. Currency is set per method.
          </p>
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            Add payment method
          </button>
        </div>
      </div>

      {error && <QueryErrorAlert message={error.message} onRetry={() => refetch()} />}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <LoadingSpinner />
          <span>Loading…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">
            No payment methods yet. Add one to use when recording expenses.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Add payment method
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600"
                >
                  Currency
                </th>
                <th scope="col" className="relative px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{row.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {row.currency}
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
      )}

      {/* Add / Edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-method-modal-title"
        >
          <div ref={formModalRef} className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="payment-method-modal-title" className="text-lg font-semibold text-gray-900">
              {editingId ? 'Edit payment method' : 'Add payment method'}
            </h2>
            <form onSubmit={onSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="pm-name" className="block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  id="pm-name"
                  type="text"
                  maxLength={100}
                  placeholder="e.g. Card, Cash, UPI"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  {...form.register('name')}
                />
                {form.formState.errors.name && (
                  <p className="mt-1 text-sm text-red-600">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="pm-currency" className="block text-sm font-medium text-gray-700">
                  Currency
                </label>
                <input
                  id="pm-currency"
                  type="text"
                  maxLength={10}
                  placeholder="e.g. INR, USD"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  {...form.register('currency')}
                />
                {form.formState.errors.currency && (
                  <p className="mt-1 text-sm text-red-600">
                    {form.formState.errors.currency.message}
                  </p>
                )}
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
                  {editingId ? 'Save' : 'Create'}
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

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div ref={deleteModalRef} className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="delete-confirm-title" className="text-lg font-semibold text-gray-900">
              Remove payment method?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to remove this payment method? Existing ledger entries will keep
              showing its name.
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
