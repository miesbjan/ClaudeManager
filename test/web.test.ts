import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isLocalUrl, normalizeUrl, sniffLocalUrl } from '../src/renderer/src/web.ts'

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
})
