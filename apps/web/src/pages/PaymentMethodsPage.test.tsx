import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentMethodsPage } from './PaymentMethodsPage'
import { renderWithProviders } from '@/test/utils'
import { api } from '@/api/client'
import type { PaymentMethod } from '@/types/payment-method'

vi.mock('@/api/client', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}))

const mockApi = vi.mocked(api)

describe('PaymentMethodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('shows page title and subtitle', () => {
    mockApi.GET.mockResolvedValue({ data: { data: [] } } as never)
    renderWithProviders(<PaymentMethodsPage />)
    expect(screen.getByRole('heading', { name: /payment methods/i })).toBeInTheDocument()
    expect(
      screen.getByText(/add cards, cash, upi.*currency is set per method/i)
    ).toBeInTheDocument()
  })

  it('shows empty state and Add payment method button when list is empty', async () => {
    mockApi.GET.mockResolvedValue({ data: { data: [] } } as never)
    renderWithProviders(<PaymentMethodsPage />)
    expect(
      await screen.findByText(/no payment methods yet\. Add one to use when recording expenses/i)
    ).toBeInTheDocument()
    const addButtons = screen.getAllByRole('button', { name: /add payment method/i })
    expect(addButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('shows table with payment methods when data is returned', async () => {
    const items: PaymentMethod[] = [
      {
        id: '1',
        name: 'Card',
        currency: 'INR',
        active: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]
    mockApi.GET.mockResolvedValue({ data: { data: items } } as never)
    renderWithProviders(<PaymentMethodsPage />)
    await waitFor(() => {
      expect(screen.getByText('Card')).toBeInTheDocument()
    })
    expect(screen.getByText('INR')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('opens add modal when Add payment method is clicked', async () => {
    const user = userEvent.setup()
    mockApi.GET.mockResolvedValue({ data: { data: [] } } as never)
    renderWithProviders(<PaymentMethodsPage />)
    await waitFor(() => {
      expect(mockApi.GET).toHaveBeenCalledWith('/api/v1/payment-methods')
    })
    const addButtons = screen.getAllByRole('button', { name: /add payment method/i })
    await user.click(addButtons[0]!)
    expect(screen.getByRole('dialog', { name: /add payment method/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/e\.g\. card, cash, upi/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/e\.g\. inr, usd/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows error with Retry when payment methods query fails', async () => {
    mockApi.GET.mockRejectedValue(new Error('Failed to load'))
    renderWithProviders(<PaymentMethodsPage />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i)
    })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
