import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pickDotnetProject, runScripts } from '../src/main/project.ts'

describe('runScripts', () => {
  it('answers with the one script that runs a single-app project', () => {
    assert.deepEqual(runScripts({ build: 'x', dev: 'x', test: 'x' }), ['dev'])
    assert.deepEqual(runScripts({ build: 'x', start: 'x' }), ['start'])
  })

  /*
   * A monorepo has no plain `dev` but one per app. Which app to run is a question
   * only the user can answer, so every candidate is offered.
   */
  it('offers every app of a monorepo', () => {
    const scripts = {
      'dev:bravoweb': 'x',
      'dev:bravoweb:backend': 'x',
      'dev:bravoweb:all': 'x',
      'dev:atlascloud': 'x',
      'build:all': 'x',
      lint: 'x'
    }
    assert.deepEqual(runScripts(scripts), ['dev:atlascloud', 'dev:bravoweb'])
  })

  it('prefers a plain script over the per-app ones', () => {
    assert.deepEqual(runScripts({ dev: 'x', 'dev:web': 'x' }), ['dev'])
  })

  it('offers nothing when a project only builds and tests', () => {
    assert.deepEqual(runScripts({ build: 'x', test: 'x', lint: 'x' }), [])
    assert.deepEqual(runScripts({}), [])
  })

  it('ignores a script that is not a command', () => {
    assert.deepEqual(runScripts({ dev: 42 as unknown as string, start: 'x' }), ['start'])
  })
})

describe('pickDotnetProject', () => {
  const lib = '<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>'
  const app = '<Project><PropertyGroup><OutputType>WinExe</OutputType></PropertyGroup></Project>'
  const console = '<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>'

  it('picks the executable out of a solution full of libraries', () => {
    const chosen = pickDotnetProject([
      { path: 'C:/s/Core/Core.csproj', content: lib },
      { path: 'C:/s/App/App.csproj', content: app },
      { path: 'C:/s/Data/Data.csproj', content: lib }
    ])
    assert.equal(chosen, 'C:/s/App/App.csproj')
  })

  it('treats a console app as runnable too', () => {
    assert.equal(
      pickDotnetProject([{ path: 'C:/s/Tool/Tool.csproj', content: console }]),
      'C:/s/Tool/Tool.csproj'
    )
  })

  /* The app at the top of a solution beats something buried in a test folder. */
  it('prefers the shallower project when several are executable', () => {
    const chosen = pickDotnetProject([
      { path: 'C:/s/tests/Harness/Harness.csproj', content: console },
      { path: 'C:/s/App.csproj', content: app }
    ])
    assert.equal(chosen, 'C:/s/App.csproj')
  })

  it('falls back to a library when nothing declares an output type', () => {
    assert.equal(pickDotnetProject([{ path: 'C:/s/Only.csproj', content: lib }]), 'C:/s/Only.csproj')
  })

  it('has nothing to pick from an empty solution', () => {
    assert.equal(pickDotnetProject([]), null)
  })
})
