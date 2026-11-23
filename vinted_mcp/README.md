# Vinted MCP

Vinted-Suche als MCP-Server (Remote/Streamable HTTP) fuer Claude-Custom-Connectoren.
Basiert auf `@andrijdavid/vinted-mcp` 0.1.2, gepatcht auf die aktuelle Vinted-API (siehe `patch.js`, `itempage.js`).
Oeffentlich erreichbar per eigenem Tailscale Funnel; geschuetzt durch einen geheimen Pfad.

## Optionen
- `ts_hostname`: Tailscale-Geraetename (Standard `vinted`)
- `ts_authkey`: optional, sonst erscheint ein Login-Link im Protokoll
- `secret_path`: optional, z. B. `mcp-abc123...` – uebernimmt einen bestehenden geheimen Pfad (Umzug). Leer = wird einmalig erzeugt und in `/data` gespeichert.

Die Connector-URL steht nach dem Start im Protokoll.
