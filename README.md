# discover-firebase-keys

Enumerates Firebase auto-provisioned API keys in a GCP project. Provides both a
GitHub Action and a standalone CLI sharing a common core.

## Architecture

- `src/core.ts` — pure logic, zero dependency on `@actions/*` or CLI parsing
- `src/action.ts` — GitHub Action wrapper (entry point for `action.yml`)
- `src/cli.ts` — CLI wrapper (entry point for command line use)

The CLI bundle does not pull in `@actions/core`. Verify after building:

```bash
grep -c '@actions/core' dist/cli.js     # should print 0
grep -c '@actions/core' dist/action.js  # should print > 0
```

## Build

```bash
npm install
npm run build
```

Both `dist/action.js` and `dist/cli.js` must be committed — GitHub Actions runs
the bundled `dist/action.js` directly without `npm install`. Both are bundled
as CommonJS for compatibility with Node's runtime requirements.

## CLI usage

Authentication uses Application Default Credentials. Run
`gcloud auth application-default login` or set `GOOGLE_APPLICATION_CREDENTIALS`.

```bash
# Dump full key objects to stdout (logs go to stderr)
./dist/cli.js --project-id my-firebase-project --mode dump

# Write minimal JSON file for Terraform to ingest
./dist/cli.js --project-id my-firebase-project --mode write \
  --output-path terraform/discovered_keys.json

# Audit every key in the project (disable display-name filtering)
./dist/cli.js --project-id my-firebase-project --mode dump \
  --display-name-filter ""

# Pipeable: write mode emits a JSON status line on stdout
./dist/cli.js --project-id my-firebase-project --mode write --quiet \
  | jq -r 'if .changed then "PR-worthy" else "no diff" end'
```

## GitHub Action usage

```yaml
- uses: ./.github/actions/discover-firebase-keys
  id: discover
  with:
    project-id: ${{ vars.GCP_PROJECT_ID }}
    mode: write
    output-path: terraform/discovered_keys.json
    # display-name-filter defaults to "auto created by Firebase"

- if: steps.discover.outputs.changed == 'true'
  run: echo "Keys changed; ${{ steps.discover.outputs.key-count }} total"
```

## How `changed` works

In `write` mode, the core reads the existing file at `output-path` (if present),
computes sha256 of both the existing and new content, and reports `changed=true`
only when they differ. Output is deterministic (sorted by uid, fixed indent) so
identical key sets produce byte-identical JSON. This keeps PRs noise-free.

If the file doesn't exist (`ENOENT`), `changed=true`.
In `dump` mode, `changed` is always `false` (no file is written).
