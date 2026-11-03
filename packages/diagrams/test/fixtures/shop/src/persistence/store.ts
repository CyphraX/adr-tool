const rows = new Map<string, string>()

export const save = (key: string, value: string): void => {
  rows.set(key, value)
}

export const load = (key: string): string | undefined => rows.get(key)
