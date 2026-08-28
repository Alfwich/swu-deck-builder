# Linux service deployment

The deployment workflow packages the production site and Node service on Windows, uploads a versioned archive, runs a remote preflight, deploys it, and verifies its health.

## Package and deploy

Create a release archive and SHA-256 sidecar:

```powershell
npm run service:package
```

Artifacts are written to the ignored `artifacts/service/` directory. Packages exclude `.env`, credentials, private endpoints, cached provider IDs, and deployment helpers.

After the initial server bootstrap, deploy with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-service.ps1 `
  -HostName deck.example.com
```

Host-key checking is strict. Verify a new host's ED25519 fingerprint through an independent channel before using `-AcceptNewHostKey`. The restricted account supports only upload, preflight, deploy, status, and rollback. Releases run under a separate locked service account, and the previous healthy release is retained for rollback.

## Updating the server bootstrap

Application bundles do not overwrite the root-owned deployment hook, dispatcher, installer, systemd unit template, or nginx route template. Refresh the bootstrap when `ops/deploy/` changes or a release changes the package layout or generated service configuration.

Transfer these scripts through an independently authorized administrative channel, then install them as root:

```bash
sudo install -o root -g root -m 0755 install-swu-deck-builder.sh \
  /usr/local/sbin/install-swu-deck-builder
sudo install -o root -g root -m 0755 swu-deck-builder-deploy-root \
  /usr/local/sbin/swu-deck-builder-deploy-root
sudo install -o root -g root -m 0755 swu-deck-builder-ssh-hook \
  /usr/local/sbin/swu-deck-builder-ssh-hook
```

Do not transfer these files with the restricted deployment key. Replacing the scripts at their existing paths preserves the authorized-key command and sudo policy created during the original secure bootstrap.

## Legacy agent-catalog migration

Servers bootstrapped before the agent catalog moved from `data/agent/catalog.csv` to `data/agent/catalog.txt` must refresh the bootstrap before deploying current bundles. An outdated preflight fails with `data/agent/catalog.csv is missing`.

Do not add a duplicate `.csv` file as a workaround. The current installer validates `catalog.txt` and generates:

```ini
SWU_AGENT_CATALOG_PATH=/opt/swu-deck-builder/current/data/agent/catalog.txt
```

After refreshing the bootstrap, rerun the normal deployment. If an unchanged bundle is still in the remote inbox, reuse it without repackaging or uploading:

```powershell
$bundle = Get-ChildItem ./artifacts/service/swu-deck-builder-*.zip |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-service.ps1 `
  -HostName deck.example.com `
  -SkipPackage `
  -SkipUpload `
  -Bundle $bundle.FullName
```
