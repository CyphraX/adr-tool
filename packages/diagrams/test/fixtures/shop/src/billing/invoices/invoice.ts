import { load, save } from '../../persistence/store'

export interface Invoice {
  readonly id: string
  readonly total: number
}

export const invoiceOf = (id: string): Invoice => ({ id, total: Number(load(id) ?? 0) })

export const record = (invoice: Invoice): void => save(invoice.id, String(invoice.total))
