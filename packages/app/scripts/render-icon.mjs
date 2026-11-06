// Draws build/icon.svg in the Chromium of Electron — the app's icon is drawn by what draws the
// app — into build/icon.png, 1024 px square, from which electron-builder derives the .ico of
// Windows and the .icns of macOS, and into build/icons/<size>x<size>.png, from 16 to 512 px,
// which go into the hicolor theme on Linux (electron-builder.yml, docs/release.md). A desktop
// looks a launcher's icon up there by size, and finds none in a theme without the sizes it asks
// for. Each size is drawn from the SVG, not scaled down from the large one. It runs when the
// icon changes and is not shipped; it lives outside build/, which the analysis leaves out where
// git does not list the files (docs/structure-format.md, section 2), so that its Exception of
// .arch/rules.yml holds either way (ADR-0023). Run it from packages/app after a change to the
// SVG, and commit what it writes:
//
//   pnpm exec electron scripts/render-icon.mjs
//
// On Linux without a display, under `xvfb-run -a`; as root, with `--no-sandbox` as well.
import { app, BrowserWindow } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const LARGE = 1024
const SIZES = [512, 256, 128, 64, 48, 32, 16]
const svg = fileURLToPath(new URL('../build/icon.svg', import.meta.url))
const png = fileURLToPath(new URL('../build/icon.png', import.meta.url))
const icons = fileURLToPath(new URL('../build/icons/', import.meta.url))

// One pixel of the picture is one of the PNG, whatever the screen.
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()
// Each size has a window of its own; the app quits when all are drawn, not when one closes.
app.on('window-all-closed', () => undefined)

app.whenReady().then(async () => {
  const source = (await readFile(svg)).toString('base64')
  /** The SVG drawn `size` px square, as a PNG, in a window of that size. */
  const draw = async (size) => {
    const window = new BrowserWindow({
      width: size,
      height: size,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: { offscreen: true, javascript: false }
    })
    try {
      const page = [
        '<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">',
        `<img alt="" width="${size}" height="${size}" src="data:image/svg+xml;base64,${source}">`,
        '</body></html>'
      ].join('')
      await window.loadURL(`data:text/html;base64,${Buffer.from(page).toString('base64')}`)
      const image = await window.webContents.capturePage()
      const { width, height } = image.getSize()
      if (width !== size || height !== size) {
        throw new Error(`The picture came out ${width} × ${height} px, not ${size} × ${size}.`)
      }
      return image.toPNG()
    } finally {
      window.destroy()
    }
  }
  try {
    await writeFile(png, await draw(LARGE))
    console.log(`Wrote ${png}.`)
    await mkdir(icons, { recursive: true })
    for (const size of SIZES) {
      const file = `${icons}${size}x${size}.png`
      await writeFile(file, await draw(size))
      console.log(`Wrote ${file}.`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    app.exit(1)
    return
  }
  app.quit()
})
