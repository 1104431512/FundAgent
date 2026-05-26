FROM node:20-alpine

WORKDIR /app
ARG FUNDAGENT_COMMIT=""
ARG FUNDAGENT_BRANCH=""
ENV NODE_ENV=production
ENV FUNDAGENT_COMMIT=$FUNDAGENT_COMMIT
ENV FUNDAGENT_BRANCH=$FUNDAGENT_BRANCH

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --ignore-scripts; \
    else \
      npm install --omit=dev --ignore-scripts; \
    fi

COPY . .
RUN node -e "const fs=require('fs'); const release={commit:process.env.FUNDAGENT_COMMIT||'',branch:process.env.FUNDAGENT_BRANCH||'',source:'docker-build-file',builtAt:new Date().toISOString()}; fs.writeFileSync('/app/.fundagent-release.json', JSON.stringify(release)+'\n')"

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.mjs"]
