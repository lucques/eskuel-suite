#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -d dist ]]; then
    echo 'Missing ./dist directory. Build the project before uploading.' >&2
    exit 1
fi

rclone sync --progress ./dist strato-sftp:eskuel-test
