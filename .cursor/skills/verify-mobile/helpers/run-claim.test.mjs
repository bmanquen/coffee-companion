import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { claimRun, readRunClaim } from './control.mjs'

const control = fileURLToPath(new URL('./control.mjs', import.meta.url))

function freePort() {
  return new Promise((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('run claim', () => {
  it('goes to exactly one of several launches racing for it', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'verify-claim-')), '.run')
    const claimers = Array.from(
      { length: 12 },
      (_, i) =>
        new Promise((resolve) => {
          const child = spawn(process.execPath, [
            '--input-type=module',
            '-e',
            `import { claimRun } from ${JSON.stringify(control)}
           process.stdout.write(claimRun(process.argv[1], process.argv[2]) ? 'held' : 'won')`,
            dir,
            `owner-${i}`,
          ])
          let out = ''
          child.stdout.on('data', (chunk) => (out += chunk))
          child.on('close', () => resolve(out))
        }),
    )
    const results = await Promise.all(claimers)
    assert.equal(results.filter((r) => r === 'won').length, 1)
    assert.equal(results.filter((r) => r === 'held').length, 11)
    const winner = results.indexOf('won')
    assert.equal(readRunClaim(dir).owner, `owner-${winner}`)
    assert.deepEqual(claimRun(dir, 'late').owner, `owner-${winner}`)
  })

  it('keeps cleanup off an instance another launch claimed after our check', async () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-claim-cli-'))
    const dir = join(root, '.run')
    const env = {
      ...process.env,
      VERIFY_RUN_DIR: dir,
      VERIFY_REPO_ROOT: root,
      VERIFY_METRO_PORT: String(await freePort()),
      VERIFY_PORT: String(await freePort()),
    }
    const cli = (command, owner) =>
      spawnSync(process.execPath, [control, command], {
        env: { ...env, VERIFY_OWNER: owner },
        encoding: 'utf8',
        timeout: 60_000,
      })
    // Run A's launch: it has claimed .run/ and started Metro, but not yet
    // written state.json.
    const metro = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' })
    try {
      assert.equal(claimRun(dir, 'run-a'), null)

      // Run B's launch now refuses, and the cleanup its trap runs leaves A's
      // instance and claim alone.
      const launch = cli('launch', 'run-b')
      assert.notEqual(launch.status, 0)
      assert.match(launch.stderr, /owner run-a/)
      const cleanupB = cli('cleanup', 'run-b')
      assert.equal(cleanupB.status, 0, cleanupB.stderr)
      assert.match(cleanupB.stdout, /not claimed by VERIFY_OWNER run-b/)
      assert.equal(alive(metro.pid), true)
      assert.equal(readRunClaim(dir).owner, 'run-a')

      // A's launch fails part way, with Metro recorded; A's cleanup stops it.
      writeFileSync(
        join(dir, 'state.json'),
        JSON.stringify({ metroPid: metro.pid, metroPids: [metro.pid] }),
      )
      const cleanupA = cli('cleanup', 'run-a')
      assert.equal(cleanupA.status, 0, cleanupA.stderr)
      await new Promise((resolve) => setTimeout(resolve, 500))
      assert.equal(alive(metro.pid), false)
      assert.equal(existsSync(dir), false)
    } finally {
      if (alive(metro.pid)) process.kill(metro.pid)
      rmSync(root, { recursive: true, force: true })
    }
  })
})
