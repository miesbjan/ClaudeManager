/**
 * The Electron half of `npm run icon`: reads `build/icon.svg` and writes
 * `build/icon.ico` and `build/icon.png`. Run through `scripts/icon.mjs`, never alone.
 *
 * CommonJS on purpose. Electron's main process is an older Node, and in an ES module
 * `app.whenReady()` never resolves here - the app sits waiting for an event that has
 * already gone by. `app.on('ready')` in CommonJS has no such problem.
 */
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const BUILD = join(__dirname, '..', 'build')

/** What Windows asks for, from a taskbar at 100 % up to the file dialog at 250 %. */
const SIZES = [16, 24, 32, 48, 64, 128, 256]

/**
 * An `.ico` is a directory of images, and since Vista each of them may simply be a
 * PNG. That makes the file a header, one 16-byte entry per size, and the PNGs.
 */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries = []
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    // 0 means 256: the field is one byte and 256 does not fit in it.
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // palette colours: none, this is true colour
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

app.on('ready', async () => {
  try {
    const win = new BrowserWindow({ width: 320, height: 320, show: false })
    const svg = readFileSync(join(BUILD, 'icon.svg'), 'utf8')
    const page =
      '<!doctype html><meta charset="utf-8">' +
      `<img id="art" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">` +
      '<canvas id="c"></canvas>'
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page))

    const images = []
    for (const size of SIZES) {
      const dataUrl = await win.webContents.executeJavaScript(`
        (async () => {
          const art = document.getElementById('art')
          await art.decode()
          const canvas = document.getElementById('c')
          canvas.width = canvas.height = ${size}
          const context = canvas.getContext('2d')
          context.clearRect(0, 0, ${size}, ${size})
          context.drawImage(art, 0, 0, ${size}, ${size})
          return canvas.toDataURL('image/png')
        })()
      `)
      images.push({ size, png: Buffer.from(dataUrl.split(',')[1], 'base64') })
    }

    writeFileSync(join(BUILD, 'icon.ico'), ico(images))
    // The largest one on its own, for anything that wants a plain image.
    writeFileSync(join(BUILD, 'icon.png'), images[images.length - 1].png)
    app.exit(0)
  } catch (error) {
    // Electron on Windows has no console to complain to, so it goes in the file.
    writeFileSync(join(BUILD, 'icon-error.txt'), String(error && error.stack))
    app.exit(1)
  }
})
