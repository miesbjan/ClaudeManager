import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/*
 * The stylesheet is edited by hand and by scripts, and a selector can be split in
 * half without anything failing to build - a broken rule is still valid CSS. These
 * check the invariants that would otherwise only show up on screen.
 */
const css = readFileSync(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8')

/** Every rule as [selector, body], ignoring at-rule blocks. */
function rules(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  for (const match of css.matchAll(pattern)) {
    out.push([match[1].trim(), match[2]])
  }
  return out
}

describe('stylesheet', () => {
  it('has balanced braces', () => {
    const open = (css.match(/\{/g) ?? []).length
    const close = (css.match(/\}/g) ?? []).length
    assert.equal(open, close, `${open} opening braces against ${close} closing ones`)
  })

  /*
   * A comment inside a selector means a rule was cut in half by an edit that landed
   * between the selector and its body - exactly how ".tab.unavailable .tab-label"
   * once turned into a bare ".tab-label" that struck through every tab.
   */
  it('has no rule whose selector contains a comment', () => {
    for (const [selector] of rules()) {
      assert.ok(
        !selector.includes('/*') || selector.trimStart().startsWith('/*'),
        `selector cut in half: ${selector.slice(0, 80)}`
      )
    }
  })

  it('strikes through a tab only when the file is unavailable', () => {
    for (const [selector, body] of rules()) {
      if (!body.includes('line-through')) continue
      assert.ok(
        selector.includes('unavailable'),
        `line-through applied by "${selector}", which is not limited to unavailable files`
      )
    }
  })

  it('keeps the danger colour off ordinary tab labels', () => {
    for (const [selector, body] of rules()) {
      if (!selector.includes('.tab-label') || selector.includes('unavailable')) continue
      assert.ok(!body.includes('--danger'), `"${selector}" paints every tab label red`)
    }
  })
})
