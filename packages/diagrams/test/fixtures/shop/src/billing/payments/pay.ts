import type { Invoice } from '../invoices/invoice'

export const settle = (invoice: Invoice): string => `paid ${invoice.total}`
