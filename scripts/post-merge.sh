#!/bin/bash
set -e

# Install JS deps if package-lock or package.json changed.
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

# Note: this project applies Supabase SQL migrations directly via the
# Supabase Management API during agent work; there is no `db:push` step.
