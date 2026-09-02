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

## Long-running AI requests

New service environments allow up to 12,000 OpenAI output tokens and two minutes per request. The output limit includes both visible text and reasoning tokens. The managed nginx route waits three minutes for the service and passes its JSON error responses through unchanged.

Existing service environment files are intentionally preserved during deployment. Update `OPENAI_MAX_OUTPUT_TOKENS` in `/etc/swu-deck-builder/service.env` and restart the service to adopt the larger budget. Refresh the server bootstrap when its nginx route still uses older timeouts or intercepts upstream errors.

## Public AI access leases

To let a public client temporarily unlock the AI deck assistant, set a strong
shared password in the root-owned service environment and restart the service:

```ini
AGENT_ACCESS_PASSWORD=<shared access password>
AGENT_ACCESS_LEASE_TTL_MS=1800000
```

The password form at `/enable` grants the proxy-resolved public IP a fixed,
in-memory lease for the duration configured by `AGENT_ACCESS_LEASE_TTL_MS`.
Keep the nginx HTTPS route in front of the service;
the shared password must not be sent over plaintext HTTP.
`AGENT_ACCESS_ALLOWED_IPS` remains the permanent-access path and can be left
empty for a password-only public gate.

## Updating the server bootstrap

Application bundles do not overwrite the root-owned deployment hook, dispatcher, installer, systemd unit template, or nginx route template. Refresh the bootstrap when `ops/deploy/` changes or a release changes the package layout or generated service configuration.

For silent Google Drive reconnects on the hosted site, add the web OAuth client
secret and a random encryption key to the root-owned service environment, then
restart the service. Do not place either value in an application bundle:

```bash
sudo sh -c 'umask 077; openssl rand -base64 32'
sudoedit /etc/swu-deck-builder/service.env
sudo systemctl restart swu-deck-builder.service
```

Set `GOOGLE_DRIVE_CLIENT_SECRET` to the web OAuth client secret,
`GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` to the generated value, and
`GOOGLE_DRIVE_AUTHORIZED_ORIGINS=https://swu.wuteri.ch`. Rotating the encryption
key safely invalidates existing authorization cookies and requires users to
connect once again.

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
