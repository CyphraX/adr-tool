import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, describe, expect, it } from 'vitest'
import { menuTemplate } from '../src/main/menu'
import { setLanguage } from '../src/main/strings'

/** Every item of a menu, those of its submenus included. */
function items(menu: readonly MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return menu.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? items(item.submenu as MenuItemConstructorOptions[]) : [])
  ])
}

const roles = (menu: readonly MenuItemConstructorOptions[]): string[] =>
  items(menu).flatMap((item) => (item.role === undefined ? [] : [item.role]))

describe('the menu of the app', () => {
  afterEach(() => setLanguage('en'))

  it('has no item that reloads the window or opens the developer tools, on any system', () => {
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      const found = roles(menuTemplate(platform, 'Softarch Suite'))
      expect(found).not.toContain('reload')
      expect(found).not.toContain('forceReload')
      expect(found).not.toContain('toggleDevTools')
      expect(found).not.toContain('help')
      // The clipboard and the zoom work by the keys of the system.
      expect(found).toEqual(
        expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'zoomIn'])
      )
    }
  })

  it('has the app menu with About, Hide and Quit on a Mac, and Exit under File elsewhere', () => {
    const mac = menuTemplate('darwin', 'Softarch Suite')
    expect(mac[0]?.label).toBe('Softarch Suite')
    expect(roles(mac.slice(0, 1))).toEqual(['about', 'hide', 'hideOthers', 'unhide', 'quit'])
    expect(items(mac).find((item) => item.role === 'quit')?.label).toBe('Quit Softarch Suite')
    expect(mac.map((item) => item.label)).toEqual([
      'Softarch Suite',
      'File',
      'Edit',
      'View',
      'Window'
    ])

    const linux = menuTemplate('linux', 'Softarch Suite')
    expect(linux.map((item) => item.label)).toEqual(['File', 'Edit', 'View', 'Window'])
    expect(roles(linux)).not.toContain('about')
    expect(items(linux).find((item) => item.role === 'quit')?.label).toBe('Exit')
  })

  it('speaks the language of the window, every item with a label', () => {
    setLanguage('de')
    const mac = menuTemplate('darwin', 'Softarch Suite')
    expect(mac.map((item) => item.label)).toEqual([
      'Softarch Suite',
      'Datei',
      'Bearbeiten',
      'Darstellung',
      'Fenster'
    ])
    expect(items(mac).find((item) => item.role === 'about')?.label).toBe('Über Softarch Suite')
    for (const item of items(mac)) {
      if (item.type !== 'separator') expect(item.label, item.role).toBeTruthy()
    }
  })
})
