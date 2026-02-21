import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/api/client'
import type { Category } from '@/types/category'
import type { components } from '@/api/schema'
import { QueryErrorAlert } from '@/components/QueryErrorAlert'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useFocusModal } from '@/hooks/useFocusModal'

const categoryFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters')
    .transform((s) => s.trim()),
  color: z
    .string()
    .max(20, 'Color must be at most 20 characters')
    .transform((s) => s.trim() || undefined)
    .optional(),
})

type CategoryFormValues = z.infer<typeof categoryFormSchema>

const CATEGORIES_QUERY_KEY = ['categories'] as const

function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: async (): Promise<Category[]> => {
      const res = (await api.GET('/api/v1/categories')) as
        | { data: { data: Category[] }; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) {
        const msg =
          res.error.detail != null ? String(res.error.detail) : 'Failed to load categories'
        throw new Error(msg)
      }
      return res.data.data ?? []
    },
  })
}

export function CategoriesPage() {
  const queryClient = useQueryClient()
  const { data: items = [], isLoading, error, refetch } = useCategories()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const formModalRef = useFocusModal(modalOpen)
  const deleteModalRef = useFocusModal(!!deleteTarget)

  const createMutation = useMutation({
    mutationFn: async (body: components['schemas']['CategoryCreate']) => {
      const res = (await api.POST('/api/v1/categories', { body })) as
        | { data: unknown; error?: undefined }
        | { data?: undefined; error: { detail?: unknown } }
      if (res.error) {
        throw new Error(res.error.detail != null ? String(res.error.detail) : 'Failed to create')
      }
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY })
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
      body: components['schemas']['CategoryCreate']
    }) => {
      const res = (await api.PUT('/api/v1/categories/{id}', {
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
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY })
      setModalOpen(false)
      setEditingId(null)
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = (await api.DELETE('/api/v1/categories/{id}', {
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
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY })
      setDeleteTarget(null)
    },
  })

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: '', color: '' },
  })

  const resetForm = () => form.reset({ name: '', color: '' })

  const openCreate = () => {
    setEditingId(null)
    resetForm()
    setModalOpen(true)
  }

  const openEdit = (row: Category) => {
    setEditingId(row.id)
    form.reset({ name: row.name, color: row.color ?? '' })
    setModalOpen(true)
  }

  const onSubmit = form.handleSubmit((values) => {
    const body = {
      name: values.name,
      color: values.color && values.color.length > 0 ? values.color : undefined,
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, body })
    } else {
      createMutation.mutate(body)
    }
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Categories</h1>
          <p className="mt-1 text-sm text-gray-600">
            Expense categories like Food, Transport, Bills. Optional color is used in charts and
            ledger.
          </p>
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            Add category
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
          <p className="text-gray-600">No categories yet. Add one to categorize expenses.</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Add category
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
                  Color
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
                    {row.color ? (
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-6 w-6 shrink-0 rounded border border-gray-300"
                          style={{ backgroundColor: row.color }}
                          aria-hidden
                        />
                        {row.color}
                      </span>
                    ) : (
                      '—'
                    )}
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
          aria-labelledby="category-modal-title"
        >
          <div ref={formModalRef} className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="category-modal-title" className="text-lg font-semibold text-gray-900">
              {editingId ? 'Edit category' : 'Add category'}
            </h2>
            <form onSubmit={onSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="cat-name" className="block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  id="cat-name"
                  type="text"
                  maxLength={100}
                  placeholder="e.g. Food, Transport"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  {...form.register('name')}
                />
                {form.formState.errors.name && (
                  <p className="mt-1 text-sm text-red-600">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="cat-color" className="block text-sm font-medium text-gray-700">
                  Color (optional)
                </label>
                <input
                  id="cat-color"
                  type="text"
                  maxLength={20}
                  placeholder="e.g. #4F46E5"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  {...form.register('color')}
                />
                {form.formState.errors.color && (
                  <p className="mt-1 text-sm text-red-600">{form.formState.errors.color.message}</p>
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
          aria-labelledby="delete-category-confirm-title"
        >
          <div ref={deleteModalRef} className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="delete-category-confirm-title" className="text-lg font-semibold text-gray-900">
              Remove category?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to remove this category? Existing entries will keep showing its
              name.
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
