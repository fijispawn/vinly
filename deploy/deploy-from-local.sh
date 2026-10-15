#!/usr/bin/env bash
set -euo pipefail

target=${1:?Usage: bash deploy/deploy-from-local.sh USER@194.67.106.162}
if [[ ! $target =~ ^[a-zA-Z_][a-zA-Z0-9_-]*@[a-zA-Z0-9.-]+$ ]]; then
  echo 'Expected SSH target in USER@HOST format' >&2
  exit 1
fi

cd "$(dirname "$0")/.."
if [[ $(git branch --show-current) != main || -n $(git status --porcelain) ]]; then
  echo 'Deploy only from a clean main branch after its CI run succeeds' >&2
  exit 1
fi

source deploy/release-files.sh
if [[ -n $(find "${release_files[@]}" -type l -print) ]]; then
  echo 'Release contains a symlink; refusing to deploy' >&2
  exit 1
fi

revision=$(git rev-parse HEAD)
compose_hash=$(shasum -a 256 deploy/compose.prod.yaml | awk '{print $1}')
temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT
echo "Preparing Vinly release $revision..."
tar -czf "$temp_dir/release.tar.gz" "${release_files[@]}"

ssh_options=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes)
echo 'Checking Vinly directory on server...'
ssh "${ssh_options[@]}" "$target" "test \"\$(realpath /opt/wine-brackets)\" = /opt/wine-brackets && test ! -L /opt/wine-brackets/.incoming && test ! -L /opt/wine-brackets/.incoming/$revision.tar.gz && install -d -m 700 /opt/wine-brackets/.incoming"
echo 'Uploading Vinly release...'
scp "${ssh_options[@]}" "$temp_dir/release.tar.gz" "$target:/opt/wine-brackets/.incoming/$revision.tar.gz"
echo 'Starting guarded deployment...'
ssh "${ssh_options[@]}" "$target" "bash -s -- $revision $compose_hash" < deploy/deploy-release.sh
