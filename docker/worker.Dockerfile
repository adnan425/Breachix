FROM golang:1.25 AS recon-tools

ARG HTTPX_VERSION=latest
ARG NUCLEI_VERSION=latest
ARG FFUF_VERSION=latest
ARG GOBUSTER_VERSION=latest

RUN GOBIN=/out go install github.com/projectdiscovery/httpx/cmd/httpx@${HTTPX_VERSION} && \
    GOBIN=/out go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@${NUCLEI_VERSION} && \
    GOBIN=/out go install github.com/ffuf/ffuf/v2@${FFUF_VERSION} && \
    GOBIN=/out go install github.com/OJ/gobuster/v3@${GOBUSTER_VERSION}

FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    nmap \
    curl \
    wget \
    git \
    python3 \
    python3-pip \
    chromium \
    chromium-driver \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY --from=recon-tools /out/httpx /usr/local/bin/httpx
COPY --from=recon-tools /out/nuclei /usr/local/bin/nuclei
COPY --from=recon-tools /out/ffuf /usr/local/bin/ffuf
COPY --from=recon-tools /out/gobuster /usr/local/bin/gobuster

RUN pip3 install sqlmap --break-system-packages

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN nuclei -update-templates -silent || true

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npx prisma generate

CMD ["npx", "trigger.dev@latest", "dev"]