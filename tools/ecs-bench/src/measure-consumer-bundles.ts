import { captureConsumerBundleEvidence } from './consumer-bundle-evidence.ts'

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
}

function hasArgument(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`)
}

if (hasArgument('help')) {
  process.stdout.write(`Usage: node --import tsx tools/ecs-bench/src/measure-consumer-bundles.ts [options]

Options:
  --output=/absolute/path  External output directory for report, bundles, and raw metafiles
  --allow-dirty            Permit a smoke-only capture from a dirty source tree
  --help                   Show this help

Without --output, artifacts are written below the operating system's temporary directory.
Definitive capture requires a clean source tree and a current packages/three-flatland/dist build.
`)
  process.exit(0)
}

const known = new Set(['--allow-dirty', '--help'])
for (const argument of process.argv.slice(2)) {
  if (known.has(argument) || argument.startsWith('--output=')) continue
  throw new Error(`Unknown argument '${argument}'`)
}

const { outputDirectory, report } = await captureConsumerBundleEvidence({
  allowDirty: hasArgument('allow-dirty'),
  outputDirectory: argumentValue('output'),
})

process.stdout.write(
  `${JSON.stringify(
    {
      captures: report.captures.map(({ fixture, saving }) => ({ fixture: fixture.id, saving })),
      outputDirectory,
      status: report.status,
    },
    null,
    2
  )}\n`
)
