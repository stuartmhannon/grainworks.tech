/**
 * manifesto-tui.js — Teletype-style manifesto display.
 * Shows the grainworks manifesto 4 lines at a time with
 * character-by-character reveal in a terminal-styled frame.
 */
(function() {
  'use strict';

  const CONFIG = {
    charDelay: 50,       // ms between characters
    lineHold: 1800,      // ms to hold a completed line
    blankHold: 600,      // ms to hold a blank line
    viewportLines: 4,
    prompt: '> '
  };

  class ManifestoTUI {
    constructor(container) {
      this.container = container;
      this.lines = [];
      this.startLine = 0;
      this.currentRow = 0;
      this.running = false;
      this.frameWidth = 0;
    }

    init(rawText) {
      this.lines = rawText.split('\n').map(l => CONFIG.prompt + l);
      this.startLine = 0;
      this.currentRow = 0;
      this.frameWidth = Math.min(this.container.clientWidth || 640, 640);
      this.container.innerHTML = this._buildFrame();
      this.running = true;
      this._animate();
    }

    _buildFrame() {
      const w = this.frameWidth;
      const innerW = w - 48; // pixels for text area accounting for borders/padding
      return `
        <div class="tui-frame" style="
          font-family: 'Courier New', 'Courier', monospace;
          font-size: 14px;
          line-height: 1.6;
          background: #0a0a0a;
          color: #c8c8c8;
          border: 1px solid #333;
          border-radius: 6px;
          padding: 16px 20px;
          max-width: 640px;
          margin: 2rem auto;
          overflow: hidden;
        ">
          <div class="tui-top" style="color: #555; font-size: 12px; margin-bottom: 8px; user-select: none;">
            ┌─ grainworks.manifesto ─────────────────────────────────┐
          </div>
          <div class="tui-viewport" style="min-height: ${CONFIG.viewportLines * 1.6}em;">
            ${Array(CONFIG.viewportLines).fill(
              '<div class="tui-line" style="min-height: 1.6em; white-space: pre-wrap; word-break: break-word;">&nbsp;</div>'
            ).join('')}
          </div>
          <div class="tui-bottom" style="color: #555; font-size: 12px; margin-top: 8px; user-select: none;">
            <span class="tui-progress">└─ [                    ]   0% ── press Space to pause ─┘</span>
          </div>
        </div>
      `;
    }

    _getLineEls() {
      return this.container.querySelectorAll('.tui-line');
    }

    _getProgressEl() {
      return this.container.querySelector('.tui-progress');
    }

    _animate() {
      if (!this.running) return;
      const lines = this.lines;
      const total = lines.length;
      const V = CONFIG.viewportLines;
      let start = this.startLine;
      let row = this.currentRow;

      const typeLine = (idx, rowEl, resolve) => {
        const text = lines[idx];
        const chars = text.split('');
        let pos = 0;
        rowEl.innerHTML = '';
        const timer = setInterval(() => {
          if (!this.running) { clearInterval(timer); return; }
          if (pos < chars.length) {
            rowEl.textContent = chars.slice(0, pos + 1).join('');
            pos++;
          } else {
            clearInterval(timer);
            resolve();
          }
        }, CONFIG.charDelay);
      };

      const advance = () => {
        if (!this.running) return;
        const lineEls = this._getLineEls();
        const idx = start + row;

        if (idx >= total) {
          this._finish();
          return;
        }

        const line = lines[idx];
        const isBlank = line.trim() === CONFIG.prompt.trim();

        // Update progress
        const pct = Math.min(100, Math.round((idx + 1) / total * 100));
        const barW = 20;
        const filled = Math.round(barW * pct / 100);
        const bar = '█'.repeat(filled) + ' '.repeat(barW - filled);
        const progressEl = this._getProgressEl();
        if (progressEl) {
          progressEl.textContent = `└─ [${bar}] ${String(pct).padStart(3)}% ── press Space to pause ─┘`;
        }

        // Type out this line
        const rowEl = lineEls[row];
        rowEl.innerHTML = '';

        return new Promise(resolve => {
          typeLine(idx, rowEl, () => {
            // Hold
            const holdTime = isBlank ? CONFIG.blankHold : CONFIG.lineHold;
            setTimeout(() => {
              row++;
              if (row >= V) {
                // Viewport full — scroll
                start++;
                row = V - 1;
                this._scrollViewport(start);
              }
              this.startLine = start;
              this.currentRow = row;
              advance();
              resolve();
            }, holdTime);
          });
        });
      };

      advance();
    }

    _scrollViewport(newStart) {
      const lineEls = this._getLineEls();
      const lines = this.lines;
      const V = CONFIG.viewportLines;

      // Shift lines up: line 0 gets line 1's content, etc.
      for (let i = 0; i < V - 1; i++) {
        const srcIdx = newStart + i;
        if (srcIdx < lines.length) {
          lineEls[i].textContent = lines[srcIdx];
        } else {
          lineEls[i].innerHTML = '&nbsp;';
        }
      }
      // Clear the last line (about to be typed)
      lineEls[V - 1].innerHTML = '&nbsp;';
    }

    _finish() {
      this.running = false;
      const progressEl = this._getProgressEl();
      if (progressEl) {
        progressEl.textContent = '└─ [████████████████████] 100% ── complete ─┘';
      }
    }

    togglePause() {
      this.running = !this.running;
      if (this.running) this._animate();
    }
  }

  // Expose globally for shortcode to use
  window.ManifestoTUI = ManifestoTUI;
})();
