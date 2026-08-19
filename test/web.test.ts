import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createUrlReader,
  isLocalUrl,
  nextRightMode,
  normalizeUrl,
  sniffLocalUrl
} from '../src/renderer/src/web.ts'

describe('isLocalUrl', () => {
  it('accepts the local machine', () => {
    assert.equal(isLocalUrl('http://localhost:5173/'), true)
    assert.equal(isLocalUrl('http://127.0.0.1:3000'), true)
    assert.equal(isLocalUrl('https://localhost:8443/app'), true)
  })

  /* The pane exists to show your own dev server, not the web. */
  it('refuses anything that is not on this machine', () => {
    assert.equal(isLocalUrl('https://example.com'), false)
    assert.equal(isLocalUrl('http://localhost.evil.com'), false)
    assert.equal(isLocalUrl('file:///C:/secrets.txt'), false)
    assert.equal(isLocalUrl('javascript:alert(1)'), false)
    assert.equal(isLocalUrl('not a url'), false)
  })
})

describe('normalizeUrl', () => {
  it('accepts what a person would type', () => {
    assert.equal(normalizeUrl('3000'), 'http://localhost:3000')
    assert.equal(normalizeUrl('localhost:5173'), 'http://localhost:5173')
    assert.equal(normalizeUrl(' http://127.0.0.1:8080/x '), 'http://127.0.0.1:8080/x')
  })

  it('rejects a remote address rather than silently loading it', () => {
    assert.equal(normalizeUrl('example.com'), null)
    assert.equal(normalizeUrl(''), null)
  })
})

describe('sniffLocalUrl', () => {
  it('reads the address a dev server prints', () => {
    assert.equal(
      sniffLocalUrl('  VITE v5.4.21  ready in 300 ms\n  ➜  Local:   http://localhost:5173/\n'),
      'http://localhost:5173/'
    )
    assert.equal(sniffLocalUrl('- Local:        http://localhost:3000'), 'http://localhost:3000')
  })

  it('survives the colour codes around it', () => {
    const coloured = '\x1b[32m  ➜  Local:\x1b[39m   \x1b[36mhttp://localhost:4321/\x1b[39m'
    assert.equal(sniffLocalUrl(coloured), 'http://localhost:4321/')
  })

  it('keeps the last address when several are printed', () => {
    const text = 'Local: http://localhost:5173/\nNetwork: http://127.0.0.1:5174/'
    assert.equal(sniffLocalUrl(text), 'http://127.0.0.1:5174/')
  })

  it('drops punctuation that belongs to the sentence', () => {
    assert.equal(sniffLocalUrl('open http://localhost:3000.'), 'http://localhost:3000')
  })

  it('ignores output with no address in it', () => {
    assert.equal(sniffLocalUrl('PS C:\\project> npm run dev'), null)
    assert.equal(sniffLocalUrl('see https://example.com/docs'), null)
  })

  /*
   * A chunk can end in the middle of an address. Accepting a port-less localhost
   * would take that half for the whole and replace a working address with one that
   * shows nothing.
   */
  it('does not take half an address for the whole of it', () => {
    assert.equal(sniffLocalUrl('  Local:   http://localhost'), null)
    assert.equal(sniffLocalUrl('http://localhost:'), null)
  })
})

describe('createUrlReader', () => {
  it('joins an address split across two chunks', () => {
    const read = createUrlReader()
    assert.equal(read('  Local:   http://localhost'), null)
    assert.equal(read(':5180/\r\n'), 'http://localhost:5180/')
  })

  /*
   * The dangerous split is inside the port: ":51" on its own is a valid address, and
   * believing it would point the pane at a port nothing listens on. An address that
   * runs to the end of the buffer therefore waits for whatever comes after it.
   */
  it('waits rather than believe half a port number', () => {
    const read = createUrlReader()
    assert.equal(read('Local: http://localhost:51'), null)
    assert.equal(read('80/'), null)
    assert.equal(read('\r\n'), 'http://localhost:5180/')
  })

  it('follows the server to another port', () => {
    const read = createUrlReader()
    assert.equal(read('Local: http://localhost:5180/\n'), 'http://localhost:5180/')
    assert.equal(read('in use, using http://localhost:5181/\n'), 'http://localhost:5181/')
  })

  it('reports nothing for output without an address', () => {
    const read = createUrlReader()
    assert.equal(read('building...\n'), null)
    assert.equal(read('done\n'), null)
  })
})

describe('nextRightMode', () => {
  it('cycles document, server, both', () => {
    assert.equal(nextRightMode('doc', true), 'web')
    assert.equal(nextRightMode('web', true), 'both')
    assert.equal(nextRightMode('both', true), 'doc')
  })

  it('has nowhere to go without an address', () => {
    assert.equal(nextRightMode('doc', false), 'doc')
    assert.equal(nextRightMode('both', false), 'doc')
  })
})
