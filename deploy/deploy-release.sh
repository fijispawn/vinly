#!/usr/bin/env bash
set -euo pipefail

revision=${1:?Revision is required}
expected_compose_hash=${2:?Compose checksum is required}
app_dir=/opt/wine-brackets
backup_dir=$app_dir/backups
compose_file=$app_dir/deploy/compose.prod.yaml

if [[ ! $revision =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Invalid revision' >&2
  exit 1
fi
if [[ ! $expected_compose_hash =~ ^[0-9a-f]{64}$ ]]; then
  echo 'Invalid Compose checksum' >&2
  exit 1
fi

archive=$app_dir/.incoming/$revision.tar.gz
if [[ $(realpath "$app_dir") != "$app_dir" || -L $backup_dir || -L $app_dir/.incoming ]]; then
  echo 'Unexpected deployment directory or symlink' >&2
  exit 1
fi
for path in Dockerfile .dockerignore package.json package-lock.json backend.js logic.js scraper.js app components public deploy; do
  if [[ -L $app_dir/$path ]]; then
    echo "Refusing to write through symlink: $path" >&2
    exit 1
  fi
done
if [[ -n $(find "$app_dir/app" "$app_dir/components" "$app_dir/public" "$app_dir/deploy" -type l -print -quit) ]]; then
  echo 'Refusing to deploy into a tree containing symlinks' >&2
  exit 1
fi
if [[ ! -f $archive || -L $archive ]]; then
  echo 'Expected release archive is missing or is a symlink' >&2
  exit 1
fi
if [[ $(sha256sum "$compose_file" | cut -d ' ' -f 1) != "$expected_compose_hash" ]]; then
  echo 'Production Compose configuration differs from reviewed source' >&2
  exit 1
fi

cd "$app_dir"
mkdir -p "$backup_dir"
compose=(docker compose --project-name wine-brackets -f "$compose_file")
container_id=$("${compose[@]}" ps -q app)
if [[ -z $container_id ]]; then
  echo 'Production app is not running; data backup was not made' >&2
  exit 1
fi
if [[ $(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container_id") != wine-brackets || $(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$container_id") != app ]]; then
  echo 'Unexpected Docker container; refusing to deploy' >&2
  exit 1
fi

stamp=$(date -u +%Y%m%dT%H%M%SZ)
data_backup=$backup_dir/data-$stamp-$revision.tar.gz
source_backup=$backup_dir/source-$stamp-$revision.tar.gz
"${compose[@]}" exec -T app tar -czf - -C /app/data . > "$data_backup.tmp"
mv "$data_backup.tmp" "$data_backup"
tar -czf "$source_backup" Dockerfile .dockerignore package.json package-lock.json app components public backend.js logic.js scraper.js

tar --no-same-owner -xzf "$archive" -C "$app_dir"
rm -f "$archive"
"${compose[@]}" up --build -d --no-deps app

healthy=false
for _ in {1..30}; do
  container_id=$("${compose[@]}" ps -q app)
  if [[ -n $container_id ]] && [[ $(docker inspect -f '{{.State.Health.Status}}' "$container_id") == healthy ]]; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ $healthy != true ]]; then
  echo 'Deployment is unhealthy; restoring previous source' >&2
  tar --no-same-owner -xzf "$source_backup" -C "$app_dir"
  "${compose[@]}" up --build -d --no-deps app
  exit 1
fi

echo "Deployed $revision; data backup: $data_backup"
