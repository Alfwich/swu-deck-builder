#!/usr/bin/env bash
set -euo pipefail

PATH="/usr/sbin:/usr/bin:/sbin:/bin"
DOMAIN=""
BUNDLE=""
PREFLIGHT="false"
STATUS="false"
ROLLBACK="false"
ALLOW_DOWNGRADE="false"

readonly SERVICE_USER="swu-deck-builder-service"
readonly INSTALL_DIR="/opt/swu-deck-builder"
readonly DATA_DIR="/var/lib/swu-deck-builder"
readonly CONFIG_DIR="/etc/swu-deck-builder"
readonly SERVICE_ENV="$CONFIG_DIR/service.env"
readonly NGINX_ROUTES="$CONFIG_DIR/nginx/routes.conf"
readonly SYSTEMD_UNIT="/etc/systemd/system/swu-deck-builder.service"
readonly PORT="8787"

log() {
    printf '[swu-install] %s\n' "$*"
}

fail() {
    printf '[swu-install] ERROR: %s\n' "$*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage:
  install-swu-deck-builder.sh --bundle <bundle.zip> --domain <domain>
  install-swu-deck-builder.sh --preflight --bundle <bundle.zip> --domain <domain>
  install-swu-deck-builder.sh --status
  install-swu-deck-builder.sh --rollback

Options:
  --allow-downgrade   Permit an incoming build lower than the active build.
EOF
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --bundle)
                [ "$#" -ge 2 ] || fail "--bundle requires a path"
                BUNDLE="$2"
                shift 2
                ;;
            --domain)
                [ "$#" -ge 2 ] || fail "--domain requires a value"
                DOMAIN="$2"
                shift 2
                ;;
            --preflight)
                PREFLIGHT="true"
                shift
                ;;
            --status)
                STATUS="true"
                shift
                ;;
            --rollback)
                ROLLBACK="true"
                shift
                ;;
            --allow-downgrade)
                ALLOW_DOWNGRADE="true"
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *) fail "unknown argument: $1" ;;
        esac
    done
}

require_root() {
    [ "$(id -u)" -eq 0 ] || fail "installer must run as root"
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "required command is missing: $1"
}

read_json_field() {
    local file="$1"
    local field="$2"
    node -e 'const fs=require("fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8").replace(/^\uFEFF/,""))[process.argv[2]];process.stdout.write(value==null?"":String(value));' "$file" "$field"
}

read_bundle_field() {
    local field="$1"
    unzip -p "$BUNDLE" manifest.json | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const value=JSON.parse(s.replace(/^\uFEFF/,""))[process.argv[1]];process.stdout.write(value==null?"":String(value));});' "$field"
}

validate_domain() {
    [[ "$DOMAIN" =~ ^[0-9A-Za-z.-]+$ ]] || fail "domain is missing or invalid"
}

validate_bundle() {
    [ -f "$BUNDLE" ] || fail "bundle not found: $BUNDLE"
    unzip -tq "$BUNDLE" >/dev/null || fail "bundle ZIP validation failed"
    local entry
    while IFS= read -r entry; do
        case "$entry" in
            /*|*\\*|..|../*|*/../*|*/..) fail "bundle contains an unsafe path: $entry" ;;
        esac
    done < <(unzip -Z1 "$BUNDLE")
    local required
    for required in manifest.json package.json package-lock.json dist/index.html server/index.mjs data/catalog.json data/agent/catalog.txt; do
        unzip -Z1 "$BUNDLE" | grep -Fxq "$required" || fail "bundle is missing $required"
    done
    [ "$(read_bundle_field name)" = "swu-deck-builder" ] || fail "bundle manifest name is invalid"
    [[ "$(read_bundle_field version)" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] || fail "bundle version is invalid"
    [[ "$(read_bundle_field build_number)" =~ ^[0-9]+$ ]] || fail "bundle build number is invalid"
    [[ "$(read_bundle_field commit)" =~ ^[0-9a-f]{40}$ ]] || fail "bundle commit is invalid"
}

active_release() {
    if [ -L "$INSTALL_DIR/current" ]; then
        readlink -f "$INSTALL_DIR/current"
    fi
}

lkg_release() {
    if [ -L "$INSTALL_DIR/lkg" ]; then
        readlink -f "$INSTALL_DIR/lkg"
    fi
}

active_build() {
    local release
    release="$(active_release)"
    if [ -n "$release" ] && [ -f "$release/manifest.json" ]; then
        read_json_field "$release/manifest.json" build_number
    fi
}

check_downgrade() {
    local current incoming
    current="$(active_build)"
    incoming="$(read_bundle_field build_number)"
    if [[ "$current" =~ ^[0-9]+$ ]] && [ "$incoming" -lt "$current" ] && [ "$ALLOW_DOWNGRADE" != "true" ]; then
        fail "incoming build $incoming is older than active build $current"
    fi
}

nginx_site() {
    printf '/etc/nginx/sites-available/%s\n' "$DOMAIN"
}

validate_nginx_bootstrap() {
    local site
    site="$(nginx_site)"
    [ -f "$site" ] || fail "nginx site is missing: $site"
    grep -Fq "include $NGINX_ROUTES;" "$site" || fail "nginx site does not include the managed route file: $NGINX_ROUTES"
}

port_available_for_service() {
    if ! ss -ltn "sport = :$PORT" 2>/dev/null | tail -n +2 | grep -q .; then
        return 0
    fi
    systemctl is-active --quiet swu-deck-builder.service
}

run_preflight() {
    require_command node
    require_command npm
    require_command unzip
    require_command nginx
    require_command systemctl
    require_command curl
    require_command ss
    require_command sha256sum
    validate_domain
    validate_bundle
    check_downgrade
    validate_nginx_bootstrap
    port_available_for_service || fail "port $PORT is occupied by another process"
    local node_major
    node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
    [ "$node_major" -ge 20 ] || fail "Node 20 or newer is required"
    log "preflight passed for version=$(read_bundle_field version) build=$(read_bundle_field build_number)"
}

ensure_service_user() {
    if ! id "$SERVICE_USER" >/dev/null 2>&1; then
        useradd --system --home-dir "$DATA_DIR" --create-home --shell /usr/sbin/nologin --comment "SWU deck builder service" "$SERVICE_USER"
    fi
}

prepare_directories() {
    install -d -o root -g "$SERVICE_USER" -m 0750 "$INSTALL_DIR" "$INSTALL_DIR/releases"
    install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$DATA_DIR" "$DATA_DIR/agent-cli"
    install -d -o root -g "$SERVICE_USER" -m 0750 "$CONFIG_DIR" "$CONFIG_DIR/nginx"
}

ensure_service_environment() {
    if [ ! -f "$SERVICE_ENV" ]; then
        cat > "$SERVICE_ENV" <<'EOF'
# Production secrets and feature configuration. Keep this file root-owned.
AGENTIC_DECK_GENERATION_ENABLED=false
AGENTIC_DECK_PROVIDER=
SWU_OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
OPENAI_MAX_OUTPUT_TOKENS=4000
OPENAI_REQUEST_TIMEOUT_MS=120000
OPENAI_STORE_RESPONSES=false
OPENAI_CATALOG_FILE_ID=
AGENT_CLI_PATH=
AGENT_CLI_MODEL=
AGENT_CLI_REASONING_EFFORT=
AGENT_CLI_WEB_SEARCH_ENABLED=false
AGENT_CLI_TIMEOUT_MS=120000
AGENT_CLI_MAX_OUTPUT_BYTES=1048576
AGENT_CLI_MAX_CONCURRENCY=1
AGENT_ACCESS_ALLOWED_IPS=
AGENT_RATE_LIMIT_WINDOW_MS=900000
AGENT_RATE_LIMIT_MAX_REQUESTS=5
AGENT_RATE_LIMIT_BYPASS_IPS=
AGENT_RATE_LIMIT_EXPANDED_IPS=
AGENT_RATE_LIMIT_EXPANDED_MAX_REQUESTS=30
EOF
    fi
    chown root:"$SERVICE_USER" "$SERVICE_ENV"
    chmod 0640 "$SERVICE_ENV"
}

release_name() {
    printf 'swu-deck-builder-%s-b%s-%s-%s\n' \
        "$(read_bundle_field version)" \
        "$(read_bundle_field build_number)" \
        "$(read_bundle_field commit | cut -c1-12)" \
        "$(sha256sum "$BUNDLE" | awk '{print substr($1, 1, 12)}')"
}

install_release() {
    local name target staging
    name="$(release_name)"
    target="$INSTALL_DIR/releases/$name"
    staging="$INSTALL_DIR/releases/.$name.installing.$$"
    case "$target" in "$INSTALL_DIR/releases/"*) ;; *) fail "release path escaped release root" ;; esac
    if [ -d "$target" ]; then
        log "reusing the already extracted release: $target" >&2
        printf '%s\n' "$target"
        return 0
    fi
    rm -rf -- "$staging"
    mkdir -p "$staging"
    if ! unzip -q "$BUNDLE" -d "$staging"; then
        rm -rf -- "$staging"
        fail "bundle extraction failed"
    fi
    (cd "$staging" && npm ci --omit=dev --ignore-scripts) >&2
    chown -R root:"$SERVICE_USER" "$staging"
    chmod -R u=rwX,g=rX,o= "$staging"
    mv "$staging" "$target"
    printf '%s\n' "$target"
}

write_systemd_unit() {
    cat > "$SYSTEMD_UNIT" <<EOF
[Unit]
Description=Star Wars Unlimited Deck Builder
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/current
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=APP_SERVER_HOST=127.0.0.1
Environment=APP_SERVER_PORT=$PORT
Environment=APP_DIST_PATH=$INSTALL_DIR/current/dist
Environment=SWU_CATALOG_PATH=$INSTALL_DIR/current/data/catalog.json
Environment=SWU_AGENT_CATALOG_PATH=$INSTALL_DIR/current/data/agent/catalog.txt
Environment=SWU_OPENAI_FILE_CACHE_PATH=$DATA_DIR/openai-file-cache.json
Environment=AGENT_CLI_WORK_PATH=$DATA_DIR/agent-cli/work
Environment=AGENT_CLI_STATE_PATH=$DATA_DIR/agent-cli/state
EnvironmentFile=-$SERVICE_ENV
ExecStart=/usr/bin/node server/index.mjs
Restart=on-failure
RestartSec=3
TimeoutStopSec=20
NoNewPrivileges=true
# The API binds to loopback, but optional AI requests require outbound HTTPS.
# Clear systemd IP filters so hardened host defaults do not block OpenAI.
IPAddressDeny=
IPAddressAllow=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
    chmod 0644 "$SYSTEMD_UNIT"
    systemctl daemon-reload
    systemctl enable swu-deck-builder.service >/dev/null
}

write_nginx_routes() {
    cat > "$NGINX_ROUTES" <<EOF
# Managed by install-swu-deck-builder.sh.
location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 180s;
    client_max_body_size 32k;
}
EOF
    chown root:root "$NGINX_ROUTES"
    chmod 0644 "$NGINX_ROUTES"
    nginx -t
    systemctl reload nginx
}

restart_and_check() {
    systemctl restart swu-deck-builder.service || return 1
    local attempt
    for attempt in $(seq 1 30); do
        if curl --fail --silent --max-time 2 "http://127.0.0.1:$PORT/healthz" | grep -Fq '"status":"ok"'; then
            return 0
        fi
        sleep 1
    done
    return 1
}

set_lkg() {
    local release="$1"
    if [ -n "$release" ] && [ -d "$release" ]; then
        ln -sfn "$release" "$INSTALL_DIR/lkg"
    fi
}

prune_releases() {
    local current lkg releases_root candidate resolved
    current="$(active_release)"
    lkg="$(lkg_release)"
    releases_root="$(readlink -f "$INSTALL_DIR/releases")"
    while IFS= read -r candidate; do
        resolved="$(readlink -f "$candidate")"
        case "$resolved" in "$releases_root/"*) ;; *) fail "refusing to prune outside the release root" ;; esac
        [ "$resolved" = "$current" ] && continue
        [ -n "$lkg" ] && [ "$resolved" = "$lkg" ] && continue
        rm -rf -- "$resolved"
    done < <(find "$releases_root" -mindepth 1 -maxdepth 1 -type d ! -name '.*.installing.*' | sort)
}

print_status() {
    local current
    current="$(active_release)"
    if [ -z "$current" ] || [ ! -f "$current/manifest.json" ]; then
        printf 'installed=false\n'
        return 1
    fi
    printf 'installed=true\n'
    printf 'release=%s\n' "$current"
    printf 'version=%s\n' "$(read_json_field "$current/manifest.json" version)"
    printf 'build_number=%s\n' "$(read_json_field "$current/manifest.json" build_number)"
    printf 'commit=%s\n' "$(read_json_field "$current/manifest.json" commit)"
    printf 'systemd=%s\n' "$(systemctl is-active swu-deck-builder.service 2>/dev/null || true)"
    if curl --fail --silent --max-time 2 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
        printf 'health=ok\n'
    else
        printf 'health=failed\n'
        return 1
    fi
}

run_rollback() {
    local current previous
    current="$(active_release)"
    previous="$(lkg_release)"
    [ -n "$previous" ] && [ -d "$previous" ] || fail "no last-known-good release is available"
    ln -sfn "$previous" "$INSTALL_DIR/current"
    set_lkg "$current"
    if ! restart_and_check; then
        ln -sfn "$current" "$INSTALL_DIR/current"
        set_lkg "$previous"
        restart_and_check || true
        fail "rollback target failed health checks; restored the prior release"
    fi
    log "rollback complete: $previous"
}

run_install() {
    run_preflight
    ensure_service_user
    prepare_directories
    ensure_service_environment
    local previous next
    previous="$(active_release)"
    next="$(install_release)"
    write_nginx_routes
    ln -sfn "$next" "$INSTALL_DIR/current"
    write_systemd_unit
    if ! restart_and_check; then
        if [ -n "$previous" ] && [ -d "$previous" ]; then
            ln -sfn "$previous" "$INSTALL_DIR/current"
            restart_and_check || true
        else
            rm -f "$INSTALL_DIR/current"
        fi
        fail "new release failed health checks; restored the previous release"
    fi
    if [ -n "$previous" ] && [ "$previous" != "$next" ]; then
        set_lkg "$previous"
    fi
    prune_releases
    log "install complete: $next"
}

main() {
    parse_args "$@"
    require_root
    if [ "$STATUS" = "true" ]; then
        print_status
    elif [ "$ROLLBACK" = "true" ]; then
        run_rollback
    elif [ "$PREFLIGHT" = "true" ]; then
        run_preflight
    else
        run_install
    fi
}

main "$@"
