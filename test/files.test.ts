import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_LISTED_FILES, skipDirectory, skipFile } from '../src/shared/files.ts'

describe('skipDirectory', () => {
  it('skips what a build or a package manager left', () => {
    assert.equal(skipDirectory('node_modules'), true)
    assert.equal(skipDirectory('dist'), true)
    assert.equal(skipDirectory('out'), true)
    assert.equal(skipDirectory('obj'), true)
    assert.equal(skipDirectory('Release'), true)
  })

  it('skips dot-directories, .git above all', () => {
    assert.equal(skipDirectory('.git'), true)
    assert.equal(skipDirectory('.vscode'), true)
    assert.equal(skipDirectory('.claude'), true)
  })

  it('keeps the ones a project is made of', () => {
    assert.equal(skipDirectory('src'), false)
    assert.equal(skipDirectory('docs'), false)
    assert.equal(skipDirectory('test'), false)
    assert.equal(skipDirectory('plans'), false)
  })
})

describe('skipFile', () => {
  it('skips what the pane could not show anyway', () => {
    assert.equal(skipFile('logo.png'), true)
    assert.equal(skipFile('app.exe'), true)
    assert.equal(skipFile('pty.node'), true)
    assert.equal(skipFile('Report.PDF'), true)
  })

  /*
   * Excluding by extension rather than allowing by one is the whole point: these are the
   * files people go looking for and none of them has an extension worth allowing.
   */
  it('keeps a file with no useful extension', () => {
    assert.equal(skipFile('Dockerfile'), false)
    assert.equal(skipFile('Makefile'), false)
    assert.equal(skipFile('.env'), false)
    assert.equal(skipFile('.env.local'), false)
    assert.equal(skipFile('LICENSE'), false)
  })

  it('keeps ordinary text', () => {
    assert.equal(skipFile('index.ts'), false)
    assert.equal(skipFile('README.md'), false)
    assert.equal(skipFile('package.json'), false)
    assert.equal(skipFile('server.log'), false)
  })
})

describe('the cap', () => {
  it('is a number a list can still be read at', () => {
    assert.ok(MAX_LISTED_FILES >= 500 && MAX_LISTED_FILES <= 5000)
  })
})
