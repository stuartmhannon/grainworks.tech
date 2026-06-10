---
title: "FlipOff"
date: 2026-06-10T16:28:00-04:00
draft: false
description: "An open-source web app that turns any TV into a retro split-flap airport display. Pure vanilla HTML/CSS/JS — no frameworks, no tracking, no accounts."
tags:
  - shipped
---

**Turn any TV into a retro split-flap display.** The classic flip-board look, without the $3,500 hardware. Free, open-source, and runs entirely offline.

[GitHub →](https://github.com/stuartmhannon/flipoff)

## What is FlipOff?

FlipOff is a web app that emulates a mechanical split-flap (flip-board) airport terminal display — the kind you'd see at train stations announcing departures. It runs full-screen in any browser, turning a TV or large monitor into a beautiful retro display.

No accounts. No subscriptions. No $199 fee. Just open `index.html` and go.

## Features

- Realistic split-flap animation with colorful scramble transitions
- Authentic mechanical clacking sound (recorded from a real split-flap display)
- Auto-rotating inspirational quotes
- Fullscreen TV mode (press `F`)
- Keyboard controls for manual navigation
- Works offline — zero external dependencies
- Responsive from mobile to 4K displays
- Pure vanilla HTML/CSS/JS — no frameworks, no build tools, no npm

## Architecture

```
flipoff/
  index.html           — Single-page app
  css/
    reset.css          — CSS reset
    layout.css         — Page layout (header, hero, board)
    board.css          — Board container and accent bars
    tile.css           — Tile styling and 3D flip animation
    responsive.css     — Media queries
  js/
    main.js            — Entry point and UI wiring
    Board.js           — Grid manager and transition orchestration
    Tile.js            — Individual tile animation logic
    SoundEngine.js     — Audio playback with Web Audio API
    MessageRotator.js  — Quote rotation timer
    KeyboardController.js — Keyboard shortcuts
    constants.js       — Configuration (grid size, colors, quotes)
    flapAudio.js       — Embedded audio data (base64)
```

## How It Works

Each tile on the board is an independent element that animates through a scramble sequence (rapid random characters with colored backgrounds) before settling on the final character. Only tiles whose content changes between messages animate — just like a real mechanical board.

The sound is a single recorded audio clip of a real split-flap transition, played once per message change.

## Files

- `/Volumes/Mini_1Tb/Projects/flipoff/` — Complete project source
- `index.html` — The app
- `js/constants.js` — Configure messages, grid size, colors

## Status → ✅ **Shipped**

Open-source and live. Customization via `constants.js`.
