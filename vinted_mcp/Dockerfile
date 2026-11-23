FROM node:20-alpine
RUN apk add --no-cache tailscale jq openssl
WORKDIR /app
RUN printf '%s' '{"name":"vinted-mcp-ha","private":true,"dependencies":{"@andrijdavid/vinted-mcp":"0.1.2"},"overrides":{"@modelcontextprotocol/sdk":"1.25.3"}}' > package.json \
 && npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY patch.js itempage.js /app/
RUN node /app/patch.js && node --check /app/node_modules/@andrijdavid/vinted-mcp/dist/bundle.js
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
