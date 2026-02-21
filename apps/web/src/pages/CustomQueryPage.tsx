import { useMutation } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'

const MAX_RANGE_DAYS = 366
const DEFAULT_CURRENCY = 'INR'

const customQueryFormSchema = z
  .object({
    tags: z.array(z.string().min(1)).min(1, 'At least one tag is required'),
    from: z.string().min(1, 'From date is required'),
    to: z.string().min(1, 'To date is required'),
  })
  .refine((data) => data.from <= data.to, {
    message: 'From date must be on or before To date',
    path: ['to'],
  })
  .refine(
    (data) => {
      const fromMs = new Date(data.from).getTime()
      const toMs = new Date(data.to).getTime()
      const days = Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24)) + 1
      return days <= MAX_RANGE_DAYS
    },
    { message: `Date range must not exceed ${MAX_RANGE_DAYS} days`, path: ['to'] }
  )

type CustomQueryFormValues = z.infer<typeof customQueryFormSchema>

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
  const formatted = formatter.format(Math.abs(amount))
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `
  return amount < 0 ? `−${symbol}${formatted}` : `${symbol}${formatted}`
}

interface CustomByTagsResult {
  totalExpense: number
}

export function CustomQueryPage() {
  const form = useForm<CustomQueryFormValues>({
    resolver: zodResolver(customQueryFormSchema),
    defaultValues: {
      tags: [],
      from: (() => {
        const d = new Date()
        d.setMonth(d.getMonth() - 1)
        return d.toISOString().slice(0, 10)
      })(),
      to: new Date().toISOString().slice(0, 10),
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: CustomQueryFormValues): Promise<CustomByTagsResult> => {
      const tagsParam = values.tags.join(',')
      const res = await api.GET('/api/v1/analytics/custom-by-tags', {
        params: { query: { tags: tagsParam, from: values.from, to: values.to } },
      })
      if (res.error) {
        const detail = res.error.detail
        const msg =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? (detail as { msg?: string }[]).map((x) => x.msg ?? '').join(', ')
              : detail != null
                ? String(detail)
                : 'Request failed'
        throw new Error(msg)
      }
      const data = res.data as { totalExpense?: number }
      return { totalExpense: data?.totalExpense ?? 0 }
    },
  })

  const from = useWatch({ control: form.control, name: 'from', defaultValue: '' })
  const to = useWatch({ control: form.control, name: 'to', defaultValue: '' })
  const rangeDays = from && to ? dateRangeDays(from, to) : 0

  const onSubmit = form.handleSubmit((values) => {
    mutation.reset()
    mutation.mutate(values)
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Custom query</h1>
        <p className="mt-1 text-sm text-gray-600">
          Total expense for entries that have all of the selected tags in the chosen date range.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="custom-query-tags"
                className="block text-sm font-medium text-gray-700"
              >
                Tags
              </label>
              <p className="mt-0.5 text-xs text-gray-500">
                At least one tag required. Type to search suggestions or add your own.
              </p>
              <div className="mt-2">
                <Controller
                  name="tags"
                  control={form.control}
                  render={({ field }) => (
                    <TagInput
                      id="custom-query-tags"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="e.g. food, work"
                      aria-label="Tags for custom query"
                    />
                  )}
                />
              </div>
              {form.formState.errors.tags && (
                <p className="mt-1 text-sm text-red-600" role="alert">
                  {form.formState.errors.tags.message}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-4">
              <div>
                <label
                  htmlFor="custom-query-from"
                  className="block text-sm font-medium text-gray-700"
                >
                  From
                </label>
                <input
                  id="custom-query-from"
                  type="date"
                  {...form.register('from')}
                  className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
                  aria-label="Date range start"
                />
                {form.formState.errors.from && (
                  <p className="mt-1 text-sm text-red-600" role="alert">
                    {form.formState.errors.from.message}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="custom-query-to"
                  className="block text-sm font-medium text-gray-700"
                >
                  To
                </label>
                <input
                  id="custom-query-to"
                  type="date"
                  {...form.register('to')}
                  className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm"
                  aria-label="Date range end"
                />
                {form.formState.errors.to && (
                  <p className="mt-1 text-sm text-red-600" role="alert">
                    {form.formState.errors.to.message}
                  </p>
                )}
              </div>
            </div>
            {from && to && rangeDays > MAX_RANGE_DAYS && !form.formState.errors.to && (
              <p className="text-sm text-red-600" role="alert">
                Date range must not exceed {MAX_RANGE_DAYS} days.
              </p>
            )}
          </div>
        </div>

        {mutation.error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-800" role="alert">
            {mutation.error.message}
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {mutation.isPending ? 'Calculating…' : 'Run query'}
        </button>
      </form>

      {mutation.isSuccess && mutation.data !== undefined && (
        <div
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm text-gray-600">Total expense</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {mutation.data.totalExpense === 0
              ? `${formatCurrency(0)} (No matching entries)`
              : formatCurrency(mutation.data.totalExpense)}
          </p>
        </div>
      )}
    </div>
  )
}
