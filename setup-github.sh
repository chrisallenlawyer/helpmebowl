#!/bin/bash

# Script to set up GitHub remote and push
# Usage: ./setup-github.sh YOUR_GITHUB_USERNAME

if [ -z "$1" ]; then
  echo "Usage: ./setup-github.sh YOUR_GITHUB_USERNAME"
  echo "Example: ./setup-github.sh chrisallen"
  exit 1
fi

GITHUB_USERNAME=$1

echo "Setting up GitHub remote for: $GITHUB_USERNAME"
git remote set-url origin "https://github.com/${GITHUB_USERNAME}/helpmebowl.git"

echo "Remote updated. Current remotes:"
git remote -v

echo ""
echo "Ready to push! Run:"
echo "  git push -u origin main"
echo ""
echo "If you get authentication errors, you may need to:"
echo "  1. Use a Personal Access Token (not your password)"
echo "  2. Create one at: https://github.com/settings/tokens"
echo "  3. Use the token as your password when pushing"

