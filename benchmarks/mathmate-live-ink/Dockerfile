# Build dependencies only. No target repository source, keys or database dumps in image.
FROM node:22-bookworm AS node
FROM python:3.12-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw
WORKDIR /work
COPY requirements-lock.txt /tmp/requirements-lock.txt
RUN python -m pip install --no-cache-dir --only-binary=:all: -r /tmp/requirements-lock.txt
WORKDIR /work/frontend
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && node node_modules/@playwright/test/cli.js install --with-deps chromium
RUN mkdir -p /work/backend /work/private /work/public /work/home && chown -R 1000:1000 /work && chmod -R a+rX /opt/pw
COPY run-live-ink.sh /usr/local/bin/run-live-ink
RUN chmod 755 /usr/local/bin/run-live-ink
USER 1000:1000
ENV HOME=/work/home NEXT_TELEMETRY_DISABLED=1
WORKDIR /work
ENTRYPOINT ["/bin/bash","/usr/local/bin/run-live-ink"]
