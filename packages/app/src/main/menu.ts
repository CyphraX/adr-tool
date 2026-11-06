import type { MenuItemConstructorOptions } from 'electron'
import { t } from './strings'

/**
 * The menu of the app, in the language of the window. Electron's own menu has Reload, Force
 * Reload and the developer tools under View, and a reload throws away the text of the editor;
 * its Help menu points to Electron. So the app sets its own: what a window of the system has —
 * on a Mac the app menu, File, Edit with the clipboard (without it, Cmd+C and Cmd+V do
 * nothing), View with the zoom, and Window. Elsewhere the bar shows when Alt is pressed.
 */
export function menuTemplate(
  platform: NodeJS.Platform,
  name: string
): MenuItemConstructorOptions[] {
  const mac = platform === 'darwin'
  const { menu } = t
  const separator: MenuItemConstructorOptions = { type: 'separator' }
  return [
    ...(mac
      ? [
          {
            label: name,
            submenu: [
              { role: 'about', label: menu.about(name) },
              separator,
              { role: 'hide', label: menu.hide(name) },
              { role: 'hideOthers', label: menu.hideOthers },
              { role: 'unhide', label: menu.unhide },
              separator,
              { role: 'quit', label: menu.quit(name) }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: menu.file,
      submenu: [mac ? { role: 'close', label: menu.close } : { role: 'quit', label: menu.exit }]
    },
    {
      label: menu.edit,
      submenu: [
        { role: 'undo', label: menu.undo },
        { role: 'redo', label: menu.redo },
        separator,
        { role: 'cut', label: menu.cut },
        { role: 'copy', label: menu.copy },
        { role: 'paste', label: menu.paste },
        { role: 'delete', label: menu.delete },
        separator,
        { role: 'selectAll', label: menu.selectAll }
      ]
    },
    {
      label: menu.view,
      submenu: [
        { role: 'resetZoom', label: menu.resetZoom },
        { role: 'zoomIn', label: menu.zoomIn },
        { role: 'zoomOut', label: menu.zoomOut },
        separator,
        { role: 'togglefullscreen', label: menu.fullScreen }
      ]
    },
    {
      label: menu.window,
      role: 'window',
      submenu: mac
        ? [
            { role: 'minimize', label: menu.minimize },
            { role: 'zoom', label: menu.zoom },
            separator,
            { role: 'front', label: menu.front }
          ]
        : [
            { role: 'minimize', label: menu.minimize },
            { role: 'close', label: menu.close }
          ]
    }
  ]
}
