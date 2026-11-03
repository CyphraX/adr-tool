/** What was invoiced, and notes beside it: two groups of methods that share no field. */
export class Ledger {
  private readonly entries: number[] = []
  private notes = ''

  record(cents: number): void {
    if (cents > 0) this.entries.push(cents)
  }

  total(): number {
    return this.entries.reduce((sum, cents) => sum + cents, 0)
  }

  note(text: string): void {
    this.notes = this.notes === '' ? text : `${this.notes}\n${text}`
  }
}
