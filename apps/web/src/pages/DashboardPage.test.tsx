import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from './DashboardPage'
import { renderWithProviders } from '@/test/utils'
import { api } from '@/api/client'
import type { LedgerEntry } from '@/types/ledger-entry'

vi.mock('@/api/client', () => ({
  api: {
    GET: vi.fn(),
  },
}))

const mockApi = vi.mocked(api)

function renderDashboard() {
  return renderWithProviders(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('shows page title and subtitle', () => {
    mockApi.GET.mockResolvedValue({
      data: {
        totalExpense: 0,
        totalRefund: 0,
        entryCount: 0,
        lastEntries: [],
      },
    } as never)
    renderDashboard()
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
    expect(
      screen.getByText(/summary and recent entries for the selected date range/i)
    ).toBeInTheDocument()
  })

  it('shows date range inputs From and To with default range', () => {
    mockApi.GET.mockResolvedValue({
      data: {
        totalExpense: 0,
        totalRefund: 0,
        entryCount: 0,
        lastEntries: [],
      },
    } as never)
    renderDashboard()
    const fromInput = screen.getByLabelText(/date range start/i)
    const toInput = screen.getByLabelText(/date range end/i)
    expect(fromInput).toBeInTheDocument()
    expect(toInput).toBeInTheDocument()
    expect((fromInput as HTMLInputElement).type).toBe('date')
    expect((toInput as HTMLInputElement).type).toBe('date')
  })

  it('fetches dashboard with from and to query params when range is valid', async () => {
    mockApi.GET.mockResolvedValue({
      data: {
        totalExpense: 100,
        totalRefund: 0,
        entryCount: 1,
        lastEntries: [],
      },
    } as never)
    renderDashboard()
    await waitFor(() => {
      expect(mockApi.GET).toHaveBeenCalledWith(
        '/api/v1/analytics/dashboard',
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
          },
        })
      )
    })
  })

  it('shows summary cards when data is returned', async () => {
    mockApi.GET.mockResolvedValue({
      data: {
        totalExpense: 12345.5,
        totalRefund: 200,
        entryCount: 42,
        lastEntries: [],
      },
    } as never)
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/sum of expenses in range/i)).toBeInTheDocument()
    })
    expect(screen.getByText('₹12,345.50')).toBeInTheDocument()
    expect(screen.getByText('₹200.00')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText(/refunds in range/i)).toBeInTheDocument()
    expect(screen.getByText(/transactions in range/i)).toBeInTheDocument()
  })

  it('shows Recent entries section and "No entries in this range" when lastEntries empty', async () => {
    mockApi.GET.mockResolvedValue({
      data: {
        totalExpense: 0,
        totalRefund: 0,
        entryCount: 0,
        lastEntries: [],
      },
    } as never)
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /recent entries/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/no entries in this range/i)).toBeInTheDocument()
  })

  it('shows last entries table when lastEntries has data', async () => {
    const entries: LedgerEntry[] = [
      {
        id: 'e1',
        date: '2025-02-15',
        description: 'Coffee',
        categoryId: 'c1',
        categoryName: 'Food',
        paymentMethodId: 'p1',
        paymentMethodName: 'Card',
        currency: 'INR',
        amount: 150,
        tags: ['work'],
        createdAt: '2025-02-15T10:00:00Z',
        updatedAt: '2025-02-15T10:00:00Z',
      },
    ]
    mockApi.GET.mockResolvedValue({
      data: {
        totalExpense: 150,
        totalRefund: 0,
        entryCount: 1,
        lastEntries: entries,
      },
    } as never)
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Coffee')).toBeInTheDocument()
    })
    expect(screen.getByText('2025-02-15')).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Card')).toBeInTheDocument()
    expect(screen.getByText(/INR 150\.00/)).toBeInTheDocument()
    expect(screen.getByText('work')).toBeInTheDocument()
  })

  it('shows View in Ledger link when there are last entries', async () => {
    mockApi.GET.mockResolvedValue({
      data: {
        totalExpense: 100,
        totalRefund: 0,
        entryCount: 1,
        lastEntries: [
          {
            id: 'e1',
            date: '2025-02-01',
            description: 'Test',
            categoryId: 'c1',
            categoryName: 'Food',
            paymentMethodId: 'p1',
            paymentMethodName: 'Card',
            currency: 'INR',
            amount: 100,
            tags: [],
            createdAt: '',
            updatedAt: '',
          },
        ],
      },
    } as never)
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view in ledger/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /view in ledger/i })).toHaveAttribute('href', '/ledger')
  })

  it('shows links to charts: Monthly trend, By category, By payment method', async () => {
    mockApi.GET.mockResolvedValue({
      data: {
        totalExpense: 0,
        totalRefund: 0,
        entryCount: 0,
        lastEntries: [],
      },
    } as never)
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /monthly trend/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /monthly trend/i })).toHaveAttribute(
      'href',
      '/charts?view=monthly'
    )
    expect(screen.getByRole('link', { name: /by category/i })).toHaveAttribute(
      'href',
      '/charts?view=category'
    )
    expect(screen.getByRole('link', { name: /by payment method/i })).toHaveAttribute(
      'href',
      '/charts?view=payment-method'
    )
  })

  it('refetches when date range changes', async () => {
    const user = userEvent.setup()
    mockApi.GET.mockResolvedValue({
      data: {
        totalExpense: 0,
        totalRefund: 0,
        entryCount: 0,
        lastEntries: [],
      },
    } as never)
    renderDashboard()
    await waitFor(() => {
      expect(mockApi.GET).toHaveBeenCalledTimes(1)
    })
    const fromInput = screen.getByLabelText(/date range start/i)
    await user.clear(fromInput)
    await user.type(fromInput, '2025-01-01')
    await waitFor(() => {
      expect(mockApi.GET).toHaveBeenCalledWith(
        '/api/v1/analytics/dashboard',
        expect.objectContaining({
          params: { query: expect.objectContaining({ from: '2025-01-01' }) },
        })
      )
    })
  })

  it('shows error message and Retry when API returns error', async () => {
    mockApi.GET.mockRejectedValue(new Error('Server error'))
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/server error/i)
    })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
