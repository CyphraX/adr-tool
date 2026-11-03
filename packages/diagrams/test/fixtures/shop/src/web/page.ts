import { invoiceOf } from '../billing/invoices/invoice'
import { load } from '../persistence/store'

export const page = (id: string): string => `Invoice: ${invoiceOf(id).total}`

export const raw = (id: string): string => load(id) ?? ''
