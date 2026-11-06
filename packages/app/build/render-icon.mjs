// Draws icon.svg into icon.png, 1024 px square, in the Chromium of Electron: the app's icon is
// drawn by what draws the app. electron-builder derives the .ico of Windows and the .icns of
// macOS from the PNG (electron-builder.yml, docs/release.md). Run it from packages/app after
// a change to the SVG, and commit both files:
//
//   pnpm exec electron build/render-icon.mjs
//
// On Linux without a display, under `xvfb-run -a`.
import { app, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SIZE = 1024
const svg = fileURLToPath(new URL('icon.svg', import.meta.url))
const png = fileURLToPath(new URL('icon.png', import.meta.url))

// One pixel of the picture is one of the PNG, whatever the screen.
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true, javascript: false }
  })
  const source = (await readFile(svg)).toString('base64')
  const page = [
    '<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">',
    `<img alt="" width="${SIZE}" height="${SIZE}" src="data:image/svg+xml;base64,${source}">`,
    '</body></html>'
  ].join('')
  await window.loadURL(`data:text/html;base64,${Buffer.from(page).toString('base64')}`)
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  const { width, height } = image.getSize()
  if (width !== SIZE || height !== SIZE) {
    console.error(`The picture came out ${width} × ${height} px, not ${SIZE} × ${SIZE}.`)
    app.exit(1)
    return
  }
  await writeFile(png, image.toPNG())
  console.log(`Wrote ${png}.`)
  app.quit()
})
