import { load, save } from '../store'
import { page } from '../../web/page'

// Only a test of the persistence uses the web: Diagrams leave test files out.
save('invoice-1', '12')
export const shown = page('invoice-1') === `Invoice: ${load('invoice-1')}`
