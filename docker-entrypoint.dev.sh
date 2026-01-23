#!/bin/bash
set -e

echo "=== Installing dependencies ==="
# Copy package files to a temp location and install there to avoid Windows mount issues
cp package.json package-lock.json /tmp/
cd /tmp
npm ci --loglevel verbose
# Copy node_modules back to app directory
cp -r node_modules /app/
cd /app

echo "=== Starting development server ==="
exec npm run dev
