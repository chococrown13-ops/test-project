#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
python -m pipeline.run_screening \
  --as-of "$(date +%Y-%m-%d)" \
  --out "out/screening_$(date +%Y-%m-%d).csv"
