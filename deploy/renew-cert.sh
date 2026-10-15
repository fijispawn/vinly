#!/usr/bin/env bash
set -euo pipefail

base=/opt/wine-brackets
certificate="$base/certbot/config/live/wine-brackets-ip/fullchain.pem"
before=$(stat -L -c %Y "$certificate")

docker run --rm \
  -v "$base/certbot/config:/etc/letsencrypt" \
  -v "$base/certbot/work:/var/lib/letsencrypt" \
  -v "$base/certbot/logs:/var/log/letsencrypt" \
  -v "$base/acme-webroot:/var/www/acme" \
  certbot/certbot:latest renew --cert-name wine-brackets-ip --non-interactive --quiet --no-random-sleep-on-renew

after=$(stat -L -c %Y "$certificate")
if [[ "$before" != "$after" ]]; then
  nginx -t
  systemctl reload nginx
fi
