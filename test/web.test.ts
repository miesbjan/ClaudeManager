import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  createUrlReader,
  FRAMED_HOSTS,
  isLocalUrl,
  nextRightMode,
  normalizeUrl,
  sniffLocalUrl,
  WEB_PARTITION
} from '../src/shared/web.ts'
import { sanitisePane } from '../src/shared/session.ts'

/*
 * The pane's page must be in a session of its own, because that is what puts it in a
 * process of its own: a page sharing this application's process can take it down, and
 * one did - a dev server that ran out of memory killed the console and every shell in
 * it. The element says which session in static HTML and the renderer says it again when
 * it has to build a replacement, so the two are held together here.
 */
describe('the web pane element', () => {
  const html = readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8')

  it('is a webview rather than a frame', () => {
    assert.match(html, /<webview id="web-frame"/)
    assert.ok(!html.includes('<iframe'), 'a frame would share this process with the page')
  })

  it('puts the page in the session the renderer also names', () => {
    assert.ok(
      html.includes('partition="' + WEB_PARTITION + '"'),
      'index.html must give the webview partition ' + WEB_PARTITION
    )
  })
})

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

  /*
   * A server that binds every interface prints 0.0.0.0, which is not somewhere to
   * browse to. Left as it was, the address was accepted and remembered and then
   * refused by the frame policy, so the pane just stayed blank.
   */
  it('rewrites the bind-everything address to the name of this machine', () => {
    assert.equal(normalizeUrl('http://0.0.0.0:3000'), 'http://localhost:3000/')
    assert.equal(normalizeUrl('0.0.0.0:8080/admin'), 'http://localhost:8080/admin')
  })

  // CSP has no syntax for an IPv6 literal, so this one cannot be allowed as written.
  it('rewrites the IPv6 loopback, which no frame policy can name', () => {
    assert.equal(normalizeUrl('http://[::1]:3000'), 'http://localhost:3000/')
  })

  it('keeps the name it was given when the policy can allow it', () => {
    assert.equal(normalizeUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000')
    assert.equal(normalizeUrl('http://localhost:3000/app'), 'http://localhost:3000/app')
  })
})

/*
 * What the code accepts and what the page's Content-Security-Policy will put in a
 * frame are two separate allowlists, and one of them lives in static HTML where no
 * constant can reach it. When they drift, the address is taken, stored and then
 * silently refused - an empty pane with nothing to explain it. This is the join.
 */
describe('the frame policy and the accepted addresses', () => {
  const html = readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8')
  const frameSrc = /frame-src ([^;"]+)/.exec(html)?.[1].trim().split(/\s+/) ?? []

  it('is declared in the page at all', () => {
    assert.ok(frameSrc.length > 0, 'no frame-src found in index.html')
  })

  it('covers every host an accepted address can carry', () => {
    for (const host of FRAMED_HOSTS) {
      assert.ok(
        frameSrc.includes('http://' + host + ':*'),
        `frame-src does not cover ${host}: ${frameSrc.join(' ')}`
      )
    }
  })

  /*
   * Chromium answers an IPv6 literal in a source list with "contains an invalid
   * source. It will be ignored." - so putting one there looks like a permission and
   * is not one. Such a host has to be normalised away instead.
   */
  it('names no host that CSP cannot express', () => {
    for (const source of frameSrc) {
      assert.ok(!source.includes('['), `frame-src source ${source} would be ignored as invalid`)
    }
    for (const host of FRAMED_HOSTS) {
      assert.ok(!host.includes('['), `${host} cannot be written in a source list`)
    }
  })

  it('has nothing in it that is not on this machine', () => {
    for (const source of frameSrc) {
      const host = source.replace(/^https?:\/\//, '').replace(/:\*$/, '')
      assert.ok(
        (FRAMED_HOSTS as readonly string[]).includes(host),
        `frame-src allows ${source}, which is not a local host`
      )
    }
  })

  it('leaves no accepted address pointing at a host the policy refuses', () => {
    const typed = ['3000', 'localhost:5173', 'http://127.0.0.1:8080/x', 'http://0.0.0.0:3000', 'http://[::1]:3000', 'https://localhost:8443']
    for (const input of typed) {
      const url = normalizeUrl(input)
      assert.ok(url, `${input} should be accepted`)
      const host = new URL(url).hostname
      assert.ok(
        (FRAMED_HOSTS as readonly string[]).includes(host),
        `${input} normalises to ${host}, which frame-src does not allow`
      )
    }
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
  it('answers with the other one, whatever it is asked', () => {
    assert.equal(nextRightMode('doc'), 'web')
    assert.equal(nextRightMode('web'), 'doc')
  })
})

describe('the arrangement that went away', () => {
  /*
   * Both at once is gone, and a file that remembers it is read as whichever of the two
   * its owner was actually watching. The field for typing an address lives inside the
   * pane, so an empty server pane is still a thing you can ask for - that is how a
   * server started by hand gets shown at all.
   */
  it('reads a remembered "both" as the one that was being watched', () => {
    assert.equal(sanitisePane({ rightMode: 'both', web: 'http://localhost:5173' }).rightMode, 'web')
    assert.equal(sanitisePane({ rightMode: 'both' }).rightMode, 'doc')
  })

  it('still reads the two that remain, and the flag before them', () => {
    assert.equal(sanitisePane({ rightMode: 'web' }).rightMode, 'web')
    assert.equal(sanitisePane({ rightMode: 'doc' }).rightMode, 'doc')
    assert.equal(sanitisePane({ showWeb: true }).rightMode, 'web')
    assert.equal(sanitisePane({}).rightMode, 'doc')
  })
})
