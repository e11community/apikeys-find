import { parseArgs } from 'node:util'
import { discover, type Mode, type Logger } from './core.js'

const stderrLogger: Logger = {
  info: (msg) => process.stderr.write(`[info] ${msg}\n`),
  debug: (msg) => {
    if (process.env.DEBUG) process.stderr.write(`[debug] ${msg}\n`)
  },
}

function printUsage(): void {
  process.stderr.write(
    `Usage: discover-firebase-keys --project <id> --mode <dump|pretty|write> [options]

Required:
  --project <id>              GCP project ID

  --mode <dump|pretty|write>  Operation mode:
                                dump   - print full key objects to stdout
                                pretty - print {uid, displayName, apis} per
                                         key to stdout (jq-style stream)
                                write  - update minimal JSON file for Terraform

Optional:
  --output-path <path>        Path to write JSON in write mode
                              (default: discovered_keys.json)

  --display-name-filter <s>   Substring to match against displayName.
                              Pass empty string to disable filtering.
                              (default: "auto created by Firebase")

  --quiet                     Suppress progress logging on stderr

Authentication: uses Application Default Credentials. Run
'gcloud auth application-default login' or set GOOGLE_APPLICATION_CREDENTIALS.

Examples:
  discover-firebase-keys --project my-proj --mode dump
  discover-firebase-keys --project my-proj --mode write \\
    --output-path terraform/discovered_keys.json
`,
  )
}

interface CliArgs {
  projectId: string
  mode: Mode
  outputPath: string
  displayNameFilter: string
  quiet: boolean
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      mode: { type: 'string' },
      'output-path': { type: 'string', default: 'discovered_keys.json' },
      'display-name-filter': { type: 'string', default: 'auto created by Firebase' },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  })

  if (values.help) {
    printUsage()
    process.exit(0)
  }

  if (!values.project) {
    process.stderr.write('error: --project is required\n\n')
    printUsage()
    process.exit(2)
  }

  const modeRaw = (values.mode ?? '').toLowerCase()
  if (modeRaw !== 'dump' && modeRaw !== 'pretty' && modeRaw !== 'write') {
    process.stderr.write(
      `error: --mode must be "dump", "pretty", or "write" (got "${values.mode}")\n\n`,
    )
    printUsage()
    process.exit(2)
  }

  return {
    projectId: values.project,
    mode: modeRaw,
    // node:util parseArgs may resolve --display-name-filter="" to undefined
    // when explicitly empty; keep the explicit ?? to honor empty-string opt-out
    outputPath: values['output-path']!,
    displayNameFilter: values['display-name-filter'] ?? '',
    quiet: values.quiet ?? false,
  }
}

async function run(): Promise<void> {
  const args = parseCliArgs()
  const logger = args.quiet ? { info: () => {}, debug: () => {} } : stderrLogger

  const result = await discover(
    {
      projectId: args.projectId,
      mode: args.mode,
      outputPath: args.outputPath,
      displayNameFilter: args.displayNameFilter,
    },
    logger,
  )

  if (args.mode === 'write') {
    // In write mode, emit a small JSON status line on stdout so callers
    // (humans, scripts) can pipe it. All progress/log output goes to stderr.
    process.stdout.write(
      JSON.stringify({
        keyCount: result.keyCount,
        changed: result.changed,
        outputPath: args.outputPath,
      }) + '\n',
    )
  } else {
    process.stdout.write(result.dumpPayload)
  }
}

run().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
