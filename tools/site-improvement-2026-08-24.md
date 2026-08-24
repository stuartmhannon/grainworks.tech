# Weekly site improvement — 2026-08-24

Commit: b84c876 (pushed to origin/main, GitHub Actions deploy triggered)
Live-verified 2026-08-24.

## 1. Removed redundant hand-maintained projects table (subtraction)

`content/projects/_index.md` held a hardcoded 20-row markdown table (Project | Status |
Category) that duplicated the automatic card grid rendered directly below it by
`themes/grain/layouts/projects/list.html`. Every visitor landed on `/projects/` and
saw the same project list twice.

The table was also a drift liability: its "Category" column (e.g. "Architecture",
"Web", "Hardware + AI") was fabricated from memory, not present as a frontmatter
field on any project page. Statuses could diverge from the real frontmatter.

Fix: deleted the table, kept the intro text, added one line noting the index is
frontmatter-driven. The card grid (title, tags, status, description) plus the
status-counter now carry the full index, sourced directly from each project's
own `Params.status` / `Params.tags` / `Params.description`.

Result: `/projects/` is one clean list instead of two. Build shows exactly 20
project cards, status counter + "Index" heading intact.

## 2. Added excerpts + tags to tag term pages (consistency)

Every listing on the site — home, section lists, `/posts/` — showed a one-line
`Description` excerpt under each post title. Tag term pages (`/tags/*`) were the
outlier: they rendered bare titles with date + reading time only.

Fix: in `themes/grain/layouts/_default/list.html`, the `term` branch now renders
tags and the `Description` excerpt, matching the `post-excerpt` pattern used
everywhere else.

Result: browsing a tag (e.g. `/tags/ai/`) shows a one-line summary for each entry
instead of a naked title list. Verified live: `/tags/ai/` now carries post-excerpts.

## 3. Removed orphaned audio-lighting-sim (v1) static tree (subtraction)

`static/audio-lighting-sim/` (12 files: 4 HTML, CSS, JS, plus acoustic/coverage/
lighting/speaker modules and `.test.js` harnesses + a spec runner) shipped in every
build but nothing referenced it:

- No content or template links to `/audio-lighting-sim/` (grep across content/,
  themes/, layouts/, hugo.toml)
- Absent from sitemap.xml
- Superseded by `audio-lighting-sim-v2`, which is the live, linked, launched version

Fix: `git rm` the tree (recoverable in git history). Static file count dropped
101 -> 89.

Result: live `/audio-lighting-sim/` now correctly 404s; v2 `/audio-lighting-sim-v2/`
returns 200. Fewer dead bytes in every page load.

## Verification

- `hugo --minify` builds clean (182 pages), zero warnings.
- Broken-internal-link scan over built `public/`: 0 broken links.
- Live (post-deploy): `/projects/` table count 0, `/tags/ai/` excerpts present,
  `/audio-lighting-sim/` 404, `/audio-lighting-sim-v2/` 200, home 200.
