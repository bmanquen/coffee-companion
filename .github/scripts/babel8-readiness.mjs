// Is Babel 8 safe to adopt yet? Run weekly by .github/workflows/babel8-readiness.yml.
// Two things hold @babel/core at 7 (see the ignore in .github/dependabot.yml):
//  1. babel-plugin-react-compiler skips components with destructured prop
//     defaults under Babel 8 (react#36868). Ready when the latest compiler
//     compiles exactly as many functions in apps/web/src on Babel 8 as on 7.
//  2. babel-preset-expo is built on Babel 7 plugins. Ready when the latest
//     preset for our Expo SDK depends on no Babel 7 package.
// Writes ready=true|false to $GITHUB_OUTPUT and a summary to $GITHUB_STEP_SUMMARY.
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const npm = (...args) =>
  execFileSync('npm', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })

// 1. React Compiler: same source, latest compiler, Babel 7 vs Babel 8.
const scratch = mkdtempSync(join(tmpdir(), 'babel8-'))
writeFileSync(join(scratch, 'package.json'), '{}')
npm(
  'install',
  '--prefix',
  scratch,
  '--no-audit',
  '--no-fund',
  'babel7@npm:@babel/core@7',
  'babel8@npm:@babel/core@8',
  'babel-plugin-react-compiler@latest',
  'semver@7',
)
const scratchRequire = createRequire(join(scratch, 'package.json'))
const compiler = scratchRequire.resolve('babel-plugin-react-compiler')
const compilerVersion = scratchRequire(
  'babel-plugin-react-compiler/package.json',
).version

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.tsx?$/.test(name) && !/\.test\.|routeTree\.gen/.test(name))
      files.push(path)
  }
}
walk('apps/web/src')

async function compiled(alias) {
  const babel = await import(pathToFileURL(scratchRequire.resolve(alias)).href)
  let count = 0
  const skipped = new Set()
  for (const filename of files) {
    const code = readFileSync(filename, 'utf8')
    // The same pre-filter @vitejs/plugin-react's reactCompilerPreset applies.
    if (!/forwardRef|memo|\b(?:[A-Z]|use[A-Z0-9])/.test(code)) continue
    await babel.transformAsync(code, {
      filename,
      babelrc: false,
      configFile: false,
      parserOpts: {
        plugins: filename.endsWith('x')
          ? ['typescript', 'jsx']
          : ['typescript'],
      },
      plugins: [
        [
          compiler,
          {
            logger: {
              logEvent(_file, event) {
                if (event.kind === 'CompileSuccess') count++
                if (event.kind === 'CompileError')
                  skipped.add(
                    event.detail?.options?.reason ?? event.detail?.reason,
                  )
              },
            },
          },
        ],
      ],
    })
  }
  return { version: babel.version, count, skipped }
}
const b7 = await compiled('babel7')
const b8 = await compiled('babel8')
const compilerReady = b7.count > 0 && b8.count === b7.count
const newReasons = [...b8.skipped].filter((reason) => !b7.skipped.has(reason))

// 2. Expo: the newest babel-preset-expo in the SDK we're on.
const sdk = createRequire(join(process.cwd(), 'apps/mobile/package.json'))(
  'expo/package.json',
).version.split('.')[0]
const versions = [].concat(
  JSON.parse(npm('view', `babel-preset-expo@^${sdk}`, 'version', '--json')),
)
// npm lists versions in registry order, not semver order.
const latestPreset = scratchRequire('semver').maxSatisfying(versions, `^${sdk}`)
const deps = JSON.parse(
  npm('view', `babel-preset-expo@${latestPreset}`, 'dependencies', '--json'),
)
const babel7Deps = Object.entries(deps).filter(
  ([name, range]) => name.startsWith('@babel/') && /(^|[^\d.])7\./.test(range),
)
const expoReady = babel7Deps.length === 0

const ready = compilerReady && expoReady
const summary = [
  `## Babel 8 readiness: ${ready ? 'READY' : 'not yet'}`,
  '',
  `- React Compiler ${compilerVersion}: ${b8.count} functions compiled on Babel ${b8.version} vs ${b7.count} on ${b7.version} (${files.length} files) - ${compilerReady ? 'ready' : 'not ready'}`,
  ...newReasons.map((reason) => `  - skipped only under Babel 8: ${reason}`),
  `- babel-preset-expo ${latestPreset} (SDK ${sdk}): ${expoReady ? 'no Babel 7 dependencies - ready' : `${babel7Deps.length} Babel 7 dependencies, e.g. ${babel7Deps[0].join('@')} - not ready`}`,
].join('\n')
console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `ready=${ready}\n`)
