#!/usr/bin/env bash

set -euo pipefail

REF="${REF:-development}"
BUILD_MAIN="${BUILD_MAIN:-true}"

usage() {
  cat <<'EOF'
Usage:
  ./release.sh prepare-pr
  ./release.sh sync-back [--post-release] [--dry-run]
  ./release.sh release [--dry-run] [--with-docker-images]

Environment:
  REF=development   Branch ref to use for workflow dispatch
  BUILD_MAIN=true   When true, request Release 4 - Build Main after the release PR merges
EOF
}

require_gh() {
  command -v gh >/dev/null 2>&1 || {
    echo "Error: gh is not installed." >&2
    exit 1
  }
}

run_prepare_pr() {
  gh workflow run release_1_prepare_release_pr.yml --ref "$REF" -f build_main="$BUILD_MAIN"
}

run_sync_back() {
  local mode="reconcile"
  local dry_run="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        dry_run="true"
        ;;
      --post-release)
        mode="post-release"
        ;;
      *)
        usage >&2
        echo "Error: unknown sync-back option: $1" >&2
        exit 1
        ;;
    esac
    shift
  done

  gh workflow run release_3_sync_back.yml --ref "$REF" -f mode="$mode" -f dry_run="$dry_run"
}

run_release() {
  local dry_run="false"
  local with_docker_images="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        dry_run="true"
        ;;
      --with-docker-images)
        with_docker_images="true"
        ;;
      *)
        usage >&2
        echo "Error: unknown release option: $1" >&2
        exit 1
        ;;
    esac
    shift
  done

  gh workflow run release_5_publish.yml --ref "$REF" -f dry-run-semantic-release="$dry_run" -f with-docker-images="$with_docker_images"
}

main() {
  require_gh

  case "${1:-}" in
    prepare-pr)
      run_prepare_pr
      ;;
    sync-back)
      shift
      run_sync_back "$@"
      ;;
    release)
      shift
      run_release "$@"
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      usage >&2
      echo "Error: unknown command: $1" >&2
      exit 1
      ;;
  esac
}

main "$@"
