#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# Install only Chromium browser
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright-chromium
npx playwright install chromium

# Additional system dependencies (if needed)
apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2