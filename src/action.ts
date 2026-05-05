import * as core from '@actions/core'
import { discover, type Mode, type Logger } from './core.js'

const ghaLogger: Logger = {
  info: (msg) => core.info(msg),
  debug: (msg) => core.debug(msg),
}

function readMode(): Mode {
  const raw = core.getInput('mode', { required: true }).toLowerCase()
  if (raw !== 'dump' && raw !== 'pretty' && raw !== 'write') {
    throw new Error(`Invalid mode "${raw}". Expected "dump", "pretty", or "write".`)
  }
  return raw
}

async function run(): Promise<void> {
  const mode = readMode()

  const result = await discover(
    {
      projectId: core.getInput('project_id', { required: true }),
      mode,
      outputPath: core.getInput('output-path') || 'discovered_keys.json',
      displayNameFilter: core.getInput('display-name-filter'),
    },
    ghaLogger,
  )

  core.setOutput('key-count', result.keyCount)
  core.setOutput('changed', String(result.changed))

  // In dump/pretty modes, emit the payload to the workflow log.
  // setOutput is unsuitable - multi-line / large values get awkward.
  if (mode !== 'write') {
    process.stdout.write(result.dumpPayload)
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err))
})
