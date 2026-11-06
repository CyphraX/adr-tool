import type { Schema } from './schema'

// What the tools are described with: the parts of their input schemas, and their annotations.

export const text = (description: string): Schema => ({ type: 'string', description })
export const required = (description: string): Schema => ({
  type: 'string',
  description,
  minLength: 1
})
export const list = (description: string): Schema => ({
  type: 'array',
  description,
  items: { type: 'string' }
})
export const number = (description: string): Schema => ({ type: 'number', description })
export const flag = (description: string): Schema => ({ type: 'boolean', description })
export const oneOf = (values: readonly string[], description: string): Schema => ({
  type: 'string',
  enum: values,
  description
})
export const object = (properties: Record<string, Schema>, needed: string[] = []): Schema => ({
  type: 'object',
  properties,
  required: needed,
  additionalProperties: false
})

/** A tool that only reads. */
export const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}
/** A plan writes nothing either; it is held until it is applied or discarded. */
export const PLAN = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
}
