#!/usr/bin/env bash
# Files copied to the server by deploy-from-local.sh and built by CI.
release_files=(
  Dockerfile .dockerignore package.json package-lock.json
  app components public
  backend.js logic.js scraper.js clipboard-image.js world-map.js wine-regions.js diary-filters.js
)
