// An invoice, as billing makes it.
import { save } from '../persistence/store'
import { formatDate } from '../web/format'

export const invoice = (): { title: string } => {
  save('invoice')
  return { title: `Invoice of ${formatDate(new Date())}` }
}
