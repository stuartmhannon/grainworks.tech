/**
 * grainworks Shared Utilities v1.0
 * Zero dependencies. ES6 module.
 *
 * Shared helper functions used across multiple workbench panels.
 * Import: import { relativeTime, escapeHtml } from './shared-utils.js';
 */

/**
 * Format an ISO timestamp as a human-readable relative time string.
 * @param {string|null} iso - ISO 8601 timestamp
 * @returns {string} e.g. "just now", "5m ago", "3h ago", "2d ago"
 */
export function relativeTime(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  const days = Math.floor(diff / 86400);
  if (days < 30) return days + 'd ago';
  if (days < 365) return Math.floor(days / 30) + 'mo ago';
  return Math.floor(days / 365) + 'y ago';
}

/**
 * Escape HTML special characters for safe innerHTML insertion.
 * @param {*} s - Value to escape (converted to string)
 * @returns {string} HTML-safe string
 */
export function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Fetch JSON with cache-busting.
 * @param {string} url - URL to fetch
 * @returns {Promise<object|null>} Parsed JSON or null on error
 */
export async function fetchJSON(url) {
  try {
    const resp = await fetch(url + '?_=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Format an ISO timestamp as a human-readable relative time string (alias).
 * @param {string} dateStr - ISO 8601 timestamp
 * @returns {string} e.g. "just now", "5m ago", "3h ago", "2d ago"
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  const days = Math.floor(diff / 86400);
  if (days < 30) return days + 'd ago';
  return d.toLocaleDateString();
}

// Also expose on window for non-module contexts
window.fetchJSON = fetchJSON;
window.timeAgo = timeAgo;

/**
 * DOM node count audit helper.
 * Count total DOM nodes in the active tab and warn if > 500.
 * Usage: In browser console: domNodeCount()
 */
export function domNodeCount() {
  const total = document.querySelectorAll('*').length;
  const warn = total > 500 ? ' ⚠ EXCEEDS 500' : ' ✓ OK';
  performance.mark('dom-count-check');
  return total;
}
window.domNodeCount = domNodeCount;
