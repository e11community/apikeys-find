import { ApiKeysClient } from '@google-cloud/apikeys'
import * as fs from 'node:fs/promises'
import * as crypto from 'node:crypto'

export type Mode = 'dump' | 'write'

export interface MinimalKey {
  uid: string
  description: string
}

export interface DiscoverOptions {
  projectId: string
  mode: Mode
  outputPath: string
  displayNameFilter: string
}

export interface DiscoverResult {
  /** Full key objects from the API, after display-name filtering. */
  fullKeys: unknown[]
  /** Minimal {uid, description} shape, sorted by uid. */
  minimalKeys: MinimalKey[]
  /** Count after filtering. */
  keyCount: number
  /** True only in write mode when output file content actually changed. */
  changed: boolean
  /** Pretty-printed JSON intended for stdout in dump mode. */
  dumpPayload: string
  /** Pretty-printed JSON written (or compared) in write mode. */
  writePayload: string
}

export interface Logger {
  info(message: string): void
  debug(message: string): void
}

export const noopLogger: Logger = {
  info: () => {},
  debug: () => {},
}

async function listAllKeys(projectId: string): Promise<unknown[]> {
  const client = new ApiKeysClient()
  const parent = `projects/${projectId}/locations/global`

  const iterable = client.listKeysAsync({ parent })
  const keys: unknown[] = []
  for await (const key of iterable) {
    keys.push(key)
  }
  return keys
}

function filterByDisplayName(keys: unknown[], filter: string): unknown[] {
  if (!filter) return keys
  return keys.filter((k) => {
    const dn = (k as { displayName?: string | null }).displayName ?? ''
    return dn.includes(filter)
  })
}

function toMinimal(keys: unknown[]): MinimalKey[] {
  return keys
    .map((k) => k as { uid?: string | null; displayName?: string | null })
    .filter((k): k is { uid: string; displayName: string | null } => typeof k.uid === 'string')
    .map((k) => ({
      uid: k.uid,
      description: k.displayName ?? '',
    }))
    .sort((a, b) => a.uid.localeCompare(b.uid))
}

async function fileContentDiffers(path: string, newContent: string): Promise<boolean> {
  try {
    const existing = await fs.readFile(path, 'utf8')
    const hashOld = crypto.createHash('sha256').update(existing).digest('hex')
    const hashNew = crypto.createHash('sha256').update(newContent).digest('hex')
    return hashOld !== hashNew
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw err
  }
}

/**
 * Run discovery. In dump mode, returns the full payload but does not touch
 * the filesystem. In write mode, compares the new minimal payload to whatever
 * is currently at outputPath - only writes if content differs.
 *
 * Pure with respect to GHA and CLI concerns: takes a Logger, returns data,
 * does no process.exit, no core.setOutput, no console.log of results.
 */
export async function discover(
  options: DiscoverOptions,
  logger: Logger = noopLogger,
): Promise<DiscoverResult> {
  logger.info(`Discovering API keys in project: ${options.projectId}`)

  const allKeys = await listAllKeys(options.projectId)
  logger.info(`Total keys returned by API: ${allKeys.length}`)

  const filtered = filterByDisplayName(allKeys, options.displayNameFilter)
  if (options.displayNameFilter) {
    logger.info(`Keys matching filter "${options.displayNameFilter}": ${filtered.length}`)
  }

  const minimal = toMinimal(filtered)
  const dumpPayload = JSON.stringify(filtered, null, 2) + '\n'
  const writePayload = JSON.stringify(minimal, null, 2) + '\n'

  let changed = false
  if (options.mode === 'write') {
    changed = await fileContentDiffers(options.outputPath, writePayload)
    if (changed) {
      await fs.writeFile(options.outputPath, writePayload, 'utf8')
      logger.info(`Wrote ${minimal.length} keys to ${options.outputPath}`)
    } else {
      logger.info(`No changes to ${options.outputPath}`)
    }
  }

  return {
    fullKeys: filtered,
    minimalKeys: minimal,
    keyCount: filtered.length,
    changed,
    dumpPayload,
    writePayload,
  }
}
