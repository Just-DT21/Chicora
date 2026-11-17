import type {
  AdminStats,
  Booking,
  BookingQuote,
  Category,
  CreateBookingResult,
  PaymentSettingsPublic,
  Product,
  PublicConfig,
} from '@shared/types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status}).`
    throw new ApiError(res.status, message)
  }
  return data as T
}

export interface ProductFilters {
  q?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  featured?: boolean
  newArrival?: boolean
  sort?: string
  limit?: number
}

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue
    search.set(key, value === true ? '1' : String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  config: () => request<PublicConfig>('/api/config'),
  categories: () => request<{ categories: Category[] }>('/api/categories'),
  products: (filters: ProductFilters = {}) =>
    request<{ products: Product[] }>(
      `/api/products${queryString({
        q: filters.q,
        category: filters.category,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        inStock: filters.inStock,
        featured: filters.featured,
        new: filters.newArrival,
        sort: filters.sort,
        limit: filters.limit,
      })}`,
    ),
  product: (id: string) => request<{ product: Product }>(`/api/products/${encodeURIComponent(id)}`),
  quote: (items: { productId: string; quantity: number }[]) =>
    request<{ quote: BookingQuote }>('/api/quote', { method: 'POST', body: JSON.stringify({ items }) }),
  createBooking: (body: {
    customerName: string
    customerPhone: string
    customerEmail?: string
    items: { productId: string; quantity: number }[]
    upiTransactionId: string
    proofToken?: string | null
  }) => request<CreateBookingResult>('/api/bookings', { method: 'POST', body: JSON.stringify(body) }),
  paymentSettings: () =>
    request<{ settings: PaymentSettingsPublic }>('/api/payment-settings', { cache: 'no-store' }),
  uploadProof: async (file: File) => {
    const form = new FormData()
    form.append('screenshot', file)
    return request<{ token: string }>('/api/booking-proof', { method: 'POST', body: form })
  },
  lookupBooking: (reference: string, phone: string) =>
    request<{ booking: Booking }>(
      `/api/bookings/${encodeURIComponent(reference)}?phone=${encodeURIComponent(phone)}`,
    ),

  admin: {
    session: () => request<{ authenticated: boolean }>('/api/admin/session'),
    login: (code: string) =>
      request<{ authenticated: boolean }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ code }) }),
    logout: () => request<{ authenticated: boolean }>('/api/admin/logout', { method: 'POST' }),
    stats: () =>
      request<{ stats: AdminStats; lowStock: Product[]; lowStockThreshold: number }>('/api/admin/stats'),
    products: () => request<{ products: Product[] }>('/api/admin/products'),
    createProduct: (body: Record<string, unknown>) =>
      request<{ product: Product }>('/api/admin/products', { method: 'POST', body: JSON.stringify(body) }),
    updateProduct: (id: string, body: Record<string, unknown>) =>
      request<{ product: Product }>(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteProduct: (id: string) =>
      request<{ ok: boolean }>(`/api/admin/products/${id}`, { method: 'DELETE' }),
    categories: () => request<{ categories: Category[] }>('/api/admin/categories'),
    createCategory: (name: string) =>
      request<{ category: Category }>('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name }) }),
    deleteCategory: (id: string) =>
      request<{ ok: boolean }>(`/api/admin/categories/${id}`, { method: 'DELETE' }),
    bookings: () => request<{ bookings: Booking[] }>('/api/admin/bookings'),
    updateBooking: (id: string, status: string) =>
      request<{ booking: Booking }>(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    verifyPayment: (id: string) =>
      request<{ booking: Booking; alreadyVerified: boolean }>(`/api/admin/bookings/${id}/verify-payment`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    rejectPayment: (id: string, reason: string) =>
      request<{ booking: Booking }>(`/api/admin/bookings/${id}/reject-payment`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    paymentSettings: () =>
      request<{ settings: PaymentSettingsPublic }>('/api/admin/payment-settings', { cache: 'no-store' }),
    savePaymentSettings: (body: { upiId: string; displayName: string }) =>
      request<{ settings: PaymentSettingsPublic }>('/api/admin/payment-settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    uploadPaymentQr: async (file: File) => {
      const form = new FormData()
      form.append('qr', file)
      return request<{ settings: PaymentSettingsPublic }>('/api/admin/payment-settings/qr', {
        method: 'POST',
        body: form,
      })
    },
    removePaymentQr: () =>
      request<{ settings: PaymentSettingsPublic }>('/api/admin/payment-settings/qr', { method: 'DELETE' }),
    upload: async (files: File[]) => {
      const form = new FormData()
      for (const file of files) form.append('images', file)
      return request<{ urls: string[] }>('/api/admin/upload', { method: 'POST', body: form })
    },
  },
}
