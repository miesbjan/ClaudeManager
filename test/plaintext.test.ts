import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectEol, isMarkdown, toFileText } from '../src/renderer/src/plaintext.ts'

describe('detectEol', () => {
  it('recognises each kind', () => {
    assert.equal(detectEol('a\r\nb\r\n'), '\r\n')
    assert.equal(detectEol('a\nb\n'), '\n')
  })

  /*
   * One stray CRLF in an LF file must not convert the whole file, and the other way
   * round. Counting is the only way to get that right.
   */
  it('goes with the majority in a mixed file', () => {
    assert.equal(detectEol('a\nb\nc\r\nd\n'), '\n')
    assert.equal(detectEol('a\r\nb\r\nc\nd\r\n'), '\r\n')
  })

  it('answers LF when the file says nothing', () => {
    assert.equal(detectEol(''), '\n')
    assert.equal(detectEol('one line, no ending'), '\n')
  })

  it('is not fooled by a lone carriage return', () => {
    assert.equal(detectEol('a\rb\nc\n'), '\n')
  })
})

describe('toFileText', () => {
  it('puts the file ending back', () => {
    assert.equal(toFileText('a\nb', '\r\n'), 'a\r\nb')
    assert.equal(toFileText('a\nb', '\n'), 'a\nb')
  })

  it('does not double an ending that is already there', () => {
    assert.equal(toFileText('a\r\nb', '\r\n'), 'a\r\nb')
  })

  it('converts back to LF when that is the file', () => {
    assert.equal(toFileText('a\r\nb', '\n'), 'a\nb')
  })

  // Whatever the textarea holds is what the user sees, trailing newline included.
  it('leaves the end of the text alone', () => {
    assert.equal(toFileText('a\n', '\n'), 'a\n')
    assert.equal(toFileText('a', '\n'), 'a')
    assert.equal(toFileText('a\n', '\r\n'), 'a\r\n')
  })

  it('survives a round trip through the editor', () => {
    const original = 'first\r\nsecond\r\nthird\r\n'
    const inEditor = original.replace(/\r\n/g, '\n')
    assert.equal(toFileText(inEditor, detectEol(original)), original)
  })
})

describe('isMarkdown', () => {
  it('knows what is worth rendering', () => {
    assert.equal(isMarkdown('C:/x/ROADMAP.md'), true)
    assert.equal(isMarkdown('notes.MARKDOWN'), true)
    assert.equal(isMarkdown('a.mdx'), true)
  })

  it('leaves everything else as text', () => {
    assert.equal(isMarkdown('package.json'), false)
    assert.equal(isMarkdown('server.log'), false)
    assert.equal(isMarkdown('.env'), false)
    assert.equal(isMarkdown('README.md.bak'), false)
  })
})
