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
