import { invoice } from '../billing/invoice'

export const page = (): string => `<h1>${invoice().title}</h1>`
