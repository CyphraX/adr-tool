/**
 * The part of JSON Schema the tools' inputs are described with, and checked against before a
 * tool runs: an agent that sends something else is told what, and can try again.
 */
export type Schema =
  | {
      readonly type: 'object'
      readonly description?: string
      readonly properties: Readonly<Record<string, Schema>>
      readonly required?: readonly string[]
      readonly additionalProperties?: false | Schema
    }
  | {
      readonly type: 'array'
      readonly description?: string
      readonly items: Schema
    }
  | {
      readonly type: 'string'
      readonly description?: string
      readonly enum?: readonly string[]
      readonly minLength?: number
    }
  | { readonly type: 'boolean'; readonly description?: string }
  | { readonly type: 'number'; readonly description?: string }

/** What is wrong with `value`, said of `where`; `undefined` when it fits. */
export function validate(schema: Schema, value: unknown, where: string): string | undefined {
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return `${where} must be an object.`
      }
      const record = value as Record<string, unknown>
      for (const key of schema.required ?? []) {
        if (record[key] === undefined) return `${where}.${key} is missing.`
      }
      for (const [key, item] of Object.entries(record)) {
        if (item === undefined) continue
        const property = Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined
        const extra = schema.additionalProperties
        if (property === undefined && extra === false) {
          const known = Object.keys(schema.properties)
          return `${where}.${key} is not expected${known.length > 0 ? `; there is ${known.join(', ')}` : ''}.`
        }
        const wrong =
          property !== undefined
            ? validate(property, item, `${where}.${key}`)
            : extra
              ? validate(extra, item, `${where}.${key}`)
              : undefined
        if (wrong !== undefined) return wrong
      }
      return undefined
    }
    case 'array': {
      if (!Array.isArray(value)) return `${where} must be an array.`
      for (const [position, item] of value.entries()) {
        const wrong = validate(schema.items, item, `${where}[${position}]`)
        if (wrong !== undefined) return wrong
      }
      return undefined
    }
    case 'string': {
      if (typeof value !== 'string') return `${where} must be a string.`
      if (schema.enum && !schema.enum.includes(value)) {
        return `${where} must be one of ${schema.enum.join(', ')}.`
      }
      if (schema.minLength !== undefined && value.trim().length < schema.minLength) {
        return `${where} must not be empty.`
      }
      return undefined
    }
    case 'boolean':
      return typeof value === 'boolean' ? undefined : `${where} must be true or false.`
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? undefined
        : `${where} must be a number.`
  }
}
