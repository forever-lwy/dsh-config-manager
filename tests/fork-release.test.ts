import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'

const root = resolve(import.meta.dirname, '..')
test('fork releases build the tagged source and only CI pushes release', () => {
  const workflow = load(readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8')) as {
    on: { push: { tags: string[]; branches?: string[] } }
    jobs: { release: { steps: { run?: string }[] } }
  }
  assert.deepEqual(workflow.on.push.tags, ['v*'])
  assert.equal(workflow.on.push.branches, undefined)
  const commands = workflow.jobs.release.steps.map((step) => step.run ?? '').join('\n')
  assert.match(commands, /npm ci/)
  assert.match(commands, /node scripts\/release\.mjs/)
  assert.match(commands, /git push origin refs\/heads\/release/)
  const upstream = readFileSync(resolve(root, '.github/workflows/publish.yml'), 'utf8')
  assert.match(upstream, /if: github\.repository == 'xiajiajun516\/dsh-config-manager'/)
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@forever-lwy/dsh-config-manager')
  assert.equal(manifest.repository.url, 'git+https://github.com/forever-lwy/dsh-config-manager.git')
})
