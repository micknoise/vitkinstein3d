#!/usr/bin/env bash
# Creates the GitHub repo, pushes it, and turns on Pages.
# Needs the gh CLI logged in as you:  gh auth login
#
#   ./push-to-github.sh [repo-name]        (default: vitkinstein3d)

set -euo pipefail

cd "$(dirname "$0")"

# The repo was written from a sandbox that cannot delete files, so git left a
# few locks behind. They are harmless but they block the next write.
rm -f .git/*.lock .git/objects/*.lock 2>/dev/null || true
find .git -name 'tmp_obj_*' -delete 2>/dev/null || true
rm -rf _to_delete ../vitkinstein3d-repo.zip 2>/dev/null || true

REPO=${1:-vitkinstein3d}

if ! command -v gh >/dev/null; then
  echo "gh CLI not found. Either:  brew install gh && gh auth login"
  echo "or do it by hand:"
  echo "  git remote add origin git@github.com:<you>/$REPO.git"
  echo "  git push -u origin main"
  echo "  then Settings -> Pages -> deploy from branch main, folder /"
  exit 1
fi

OWNER=$(gh api user --jq .login)

echo "creating $OWNER/$REPO and pushing..."
gh repo create "$REPO" --public --source=. --remote=origin --push \
  --description "A first-person exploration demo: a generated house with more rooms than it has. Portals, procedural interiors, one self-contained HTML file."

echo "turning on Pages..."
PAGES='{"source":{"branch":"main","path":"/"}}'
echo "$PAGES" | gh api -X POST "repos/$OWNER/$REPO/pages" --input - >/dev/null 2>&1 \
  || echo "$PAGES" | gh api -X PUT "repos/$OWNER/$REPO/pages" --input - >/dev/null 2>&1 \
  || echo "  (couldn't set Pages via the API — do it in Settings -> Pages: branch main, folder /)"

gh api -X PATCH "repos/$OWNER/$REPO" -f homepage="https://$OWNER.github.io/$REPO/" >/dev/null 2>&1 || true

echo
echo "repo:  https://github.com/$OWNER/$REPO"
echo "play:  https://$OWNER.github.io/$REPO/     (a minute or two before it goes live)"
