FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg espeak-ng fonts-noto-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /avp
COPY package*.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw
RUN npx playwright install chromium --with-deps
COPY . .
RUN mkdir -p /work /work/home /work/public && chown -R 1000:1000 /work /avp && chmod -R a+rX /opt/pw
USER 1000:1000
ENV HOME=/work/home CI=1 AVP_EDUTWIN_ISOLATED=1
RUN npx remotion browser ensure
ENTRYPOINT ["node","/avp/benchmarks/external-edutwin.mjs"]
