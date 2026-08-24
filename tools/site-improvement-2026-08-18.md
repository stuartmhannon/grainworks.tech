# Weekly site improvement — 2026-08-18

Commit: 1f4be5c (rebased onto origin/main 61feb60, pushed, deploy triggered)

## 1. Purged AppleDouble junk (huge hygiene win)

**Found:** 1079 `. _*` AppleDouble metadata files scattered across the repo
(static/, themes/, content/). None were tracked in git — all pure filesystem
noise leaked in via macOS sync/copy. Also 2 tracked `.DS_Store` files
(content/, static/) and 1 tracked `__pycache__/*.pyc` build artifact.

**Impact:** On every build Hugo copies static/ verbatim, so 100+ of these junk
files shipped into `public/` → deployed. A clean rebuild before the fix had
107 `. _*` files in public/. After: 0. Hugo static-file count: 211 → 101.

**Fix:** Deleted all junk from disk, `git rm --cached` the 2 .DS_Store + .pyc,
added `._*`, `__pycache__/`, `*.pyc` to .gitignore so they never return.

Bonus: the git "non-monotonic index" warnings every command was printing came
from `. _pack-*.idx` AppleDouble files *inside* `.git/objects/pack/` — deleted,
warnings gone. Root cause was the same junk-files-infesting-everything issue.

## 2. Added a favicon (site had none)

**Found:** no `<link rel="icon">`, no favicon file — browsers showed the default.

**Fix:** inline SVG data-URI favicon in `partials/head.html`: dark rounded square
with a terminal-green chevron (echoes the → motif). Zero extra HTTP request,
zero JS, zero dependency — fits the grain aesthetic exactly. Verified present in
built index.html (minifier strips quotes but the link renders correctly).

## 3. Broken brain-link — already fixed upstream

My broken-link scan flagged hermes-layer-02.html → hermes-layer-03.html (404).
I proposed a fix, then found Stuart's commit 61feb60 (Aug 10) had ALREADY fixed
the same link upstream → pointing it to /projects/hermes-brain.html (the real
existing "The Brain — Interactive" page). I rebased, dropped my redundant change,
and adopted the upstream fix. Net: no dead link in the layer-02 → brain path.

## Push / deploy
- Pushed main → origin (61feb60..1f4be5c). GitHub Actions auto-deploys.
- Published to grainworks.tech.

## Security flag (not acted on — belongs with Dad)
`.git/config` remote URL embeds a plaintext GitHub PAT (`ghp_...`). It is
exposed on this host's git config and will ride along if config is shared.
Recommend rotating the token and moving push auth to a credential helper or
SSH key. Not changed here (credential/irreversible action → Dad's call).
