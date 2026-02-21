import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomQueryPage } from './CustomQueryPage'
import { renderWithProviders } from '@/test/utils'
import { api } from '@/api/client'

vi.mock('@/api/client', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}))

const mockApi = vi.mocked(api)

function defaultGetMock(path: string) {
  if (path.startsWith('/api/v1/tag-suggestions')) {
    return Promise.resolve({
      data: { suggestions: [] as string[] },
      error: undefined,
      response: {} as Response,
    } as never)
  }
  return Promise.resolve({ data: {}, error: undefined, response: {} as Response } as never)
}

describe('CustomQueryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
    mockApi.GET.mockImplementation((path: string) => defaultGetMock(path))
  })

  it('shows page title and subtitle', () => {
    renderWithProviders(<CustomQueryPage />)
    expect(screen.getByRole('heading', { name: /^custom query$/i })).toBeInTheDocument()
    expect(
      screen.getByText(
        /total expense for entries that have all of the selected tags in the chosen date range/i
      )
    ).toBeInTheDocument()
  })

  it('shows form with tags label, date inputs and Run query button', () => {
    renderWithProviders(<CustomQueryPage />)
    expect(screen.getByLabelText(/tags for custom query/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/date range start/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/date range end/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run query/i })).toBeInTheDocument()
  })

  it('shows validation error when submitting with no tags', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CustomQueryPage />)
    const submit = screen.getByRole('button', { name: /run query/i })
    await user.click(submit)
    await waitFor(() => {
      expect(screen.getByText(/at least one tag is required/i)).toBeInTheDocument()
    })
    expect(mockApi.GET).not.toHaveBeenCalledWith(
      '/api/v1/analytics/custom-by-tags',
      expect.anything()
    )
  })

  it('calls custom-by-tags and shows result when form is valid', async () => {
    const user = userEvent.setup()
    mockApi.GET.mockImplementation((path: string) => {
      if (path === '/api/v1/analytics/custom-by-tags') {
        return Promise.resolve({
          data: { totalExpense: 2500 },
          error: undefined,
          response: {} as Response,
        } as never)
      }
      return defaultGetMock(path)
    })
    renderWithProviders(<CustomQueryPage />)
    const tagsInput = screen.getByLabelText(/tags for custom query/i)
    await user.type(tagsInput, 'food')
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(screen.getByText('food')).toBeInTheDocument()
    })
    const submit = screen.getByRole('button', { name: /run query/i })
    await user.click(submit)
    await waitFor(() => {
      expect(mockApi.GET).toHaveBeenCalledWith('/api/v1/analytics/custom-by-tags', {
        params: { query: { tags: 'food', from: expect.any(String), to: expect.any(String) } },
      })
    })
    const resultCard = await screen.findByRole('status')
    expect(resultCard).toHaveTextContent(/total expense/i)
    expect(resultCard).toHaveTextContent('₹2,500.00')
  })

  it('shows zero / no matching entries when API returns 0', async () => {
    const user = userEvent.setup()
    mockApi.GET.mockImplementation((path: string) => {
      if (path === '/api/v1/analytics/custom-by-tags') {
        return Promise.resolve({
          data: { totalExpense: 0 },
          error: undefined,
          response: {} as Response,
        } as never)
      }
      return defaultGetMock(path)
    })
    renderWithProviders(<CustomQueryPage />)
    const tagsInput = screen.getByLabelText(/tags for custom query/i)
    await user.type(tagsInput, 'nonexistent')
    await user.keyboard('{Enter}')
    const submit = screen.getByRole('button', { name: /run query/i })
    await user.click(submit)
    await waitFor(() => {
      expect(screen.getByText(/no matching entries/i)).toBeInTheDocument()
    })
  })

  it('shows API error when custom-by-tags returns error', async () => {
    const user = userEvent.setup()
    mockApi.GET.mockImplementation((path: string) => {
      if (path === '/api/v1/analytics/custom-by-tags') {
        return Promise.resolve({
          data: undefined,
          error: { detail: 'Date range must not exceed 366 days' },
          response: {} as Response,
        } as never)
      }
      return defaultGetMock(path)
    })
    renderWithProviders(<CustomQueryPage />)
    const tagsInput = screen.getByLabelText(/tags for custom query/i)
    await user.type(tagsInput, 'food')
    await user.keyboard('{Enter}')
    const submit = screen.getByRole('button', { name: /run query/i })
    await user.click(submit)
    await waitFor(() => {
      expect(screen.getByText(/date range must not exceed 366 days/i)).toBeInTheDocument()
    })
  })
})
