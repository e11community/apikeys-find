# Firebase Key Discovery Workflow

Sample workflow that calls the `discover-firebase-keys` action on a schedule
and on demand, optionally opening a PR when the discovered key set changes.

## Place at

```
.github/workflows/discover-firebase-keys.yml
```

The action it calls must already exist at:

```
.github/actions/discover-firebase-keys/
```

(That's the previous zip — `dist/action.js`, `action.yml`, etc.)

## Required repository configuration

### Secrets (Settings → Secrets and variables → Actions → Secrets)

| Name | Value |
|---|---|
| `GCP_WIF_PROVIDER` | Full Workload Identity Provider resource name, e.g. `projects/123456789/locations/global/workloadIdentityPools/github/providers/github-provider` |
| `GCP_DISCOVERY_SA` | Service account email, e.g. `firebase-key-discovery@my-project.iam.gserviceaccount.com` |

### Variables (Settings → Secrets and variables → Actions → Variables)

| Name | Value |
|---|---|
| `GCP_PROJECT_ID` | Default project ID for scheduled runs (e.g. `my-firebase-project`) |

### Service account permissions

The discovery service account needs read-only access to API keys in the project.
Grant `roles/serviceusage.apiKeysViewer` on the target project.

> ⚠️ I have not independently verified `roles/serviceusage.apiKeysViewer` is the
> exact role name that grants `apikeys.keys.list` permission. If the action fails
> with a permission error, check the IAM role catalog for the correct read-only
> API Keys role — `roles/apikeys.viewer` is the likely alternative.

## Triggering modes

**Scheduled (daily 06:00 UTC)** — uses `vars.GCP_PROJECT_ID`, runs in `write`
mode, opens a PR if `discovered_keys.json` content changed.

**Manual (Actions → Discover Firebase API Keys → Run workflow)** — prompts for
project ID, mode (dump or write), and output path. Useful for ad-hoc auditing
of additional projects without modifying the workflow.

## Multi-project setup

If you need to scan multiple projects on the same schedule, duplicate the
`discover` job and parameterize each one — or use a matrix:

```yaml
jobs:
  discover:
    strategy:
      fail-fast: false
      matrix:
        project: [proj-prod, proj-staging, proj-dev]
    runs-on: ubuntu-latest
    steps:
      # ... same steps, but use ${{ matrix.project }} for project-id
      # and a per-project output-path like terraform/${{ matrix.project }}/discovered_keys.json
```

> ⚠️ Matrix runs may produce one PR per project from `peter-evans/create-pull-request`.
> If you'd rather batch them into a single PR, run discovery as a matrix and the
> PR step as a single follow-up job that depends on all matrix jobs completing.
