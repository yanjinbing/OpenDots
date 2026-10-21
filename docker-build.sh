#!/usr/bin/env bash
# 构建并推送 aira-opendots 镜像（在本脚本所在目录执行 docker build）
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "用法: $0 <version>" >&2
    exit 2
fi

REGISTRY="registry.sandbox.airacloud.com/default"
IMAGE="${REGISTRY}/aira-opendots"
TAG="$1"

cd "$(dirname "$0")"

# --pull: 每次构建拉取最新 hermes-agent 基础镜像
docker build \
    -f "Dockerfile.single" \
    -t "${IMAGE}:${TAG}" \
    .

docker push "${IMAGE}:${TAG}"

echo "done: ${IMAGE}:${TAG}"
