#!/bin/bash
set -e

echo "🔨 Building..."
npm run build

echo "🚀 Deploying..."
npx wrangler deploy

echo "✅ Done!"
