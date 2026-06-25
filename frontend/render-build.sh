#!/bin/bash
# Render build script for BudgetWise frontend

set -e

echo "==> Installing dependencies..."
npm install

echo "==> Building React app..."
# CI=false prevents Create React App from treating warnings as errors
CI=false npm run build

echo "==> Build complete!"
