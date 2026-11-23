#!/bin/sh
set -e
OPTS=/data/options.json
HOSTNAME_TS=$(jq -r '.ts_hostname // "vinted"' "$OPTS")
AUTHKEY=$(jq -r '.ts_authkey // ""' "$OPTS")
TS="tailscale --socket=/tmp/tailscaled.sock"

# Geheimer Pfad: aus Option uebernehmen (z. B. beim Umzug), sonst einmal erzeugen; dauerhaft in /data
OPT_SECRET=$(jq -r '.secret_path // ""' "$OPTS" | sed 's#^/*##; s#/*$##')
if [ -n "$OPT_SECRET" ]; then
  echo "$OPT_SECRET" > /data/secret_path
elif [ ! -s /data/secret_path ]; then
  echo "mcp-$(openssl rand -hex 24)" > /data/secret_path
fi
SECRET=$(cat /data/secret_path)

# Eigenes Tailscale (userspace, Zustand in /data)
mkdir -p /data/tailscale
tailscaled --tun=userspace-networking --statedir=/data/tailscale --socket=/tmp/tailscaled.sock >/tmp/tailscaled.log 2>&1 &
sleep 3

echo "[vinted] Tailscale-Anmeldung als '$HOSTNAME_TS' ..."
if [ -n "$AUTHKEY" ]; then
  $TS up --hostname="$HOSTNAME_TS" --authkey="$AUTHKEY"
else
  echo "[vinted] Falls unten ein Login-Link erscheint: im Browser oeffnen und bestaetigen."
  $TS up --hostname="$HOSTNAME_TS"
fi

DNS=$($TS status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
echo "[vinted] Funnel wird eingerichtet (bei Bedarf erscheint ein Link zum Aktivieren) ..."
( $TS funnel --bg 3001 || echo "[vinted] Funnel fehlgeschlagen - siehe Meldung oben" ) &

echo "=================================================================="
echo " Connector-URL fuer Claude:"
echo " https://$DNS/$SECRET"
echo "=================================================================="

export VINTED_MCP_TRANSPORT=http VINTED_MCP_HOST=127.0.0.1 VINTED_MCP_PORT=3001
export VINTED_MCP_PATH="/$SECRET" VINTED_MCP_ENABLE_LEGACY_SSE=false VINTED_AUTH_MODE=http
export VINTED_MAX_CONCURRENCY=2 VINTED_REQUEST_DELAY_MS=1500
exec node /app/node_modules/@andrijdavid/vinted-mcp/dist/bundle.js
