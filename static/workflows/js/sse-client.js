/**
 * sse-client.js — SSE consumer for live workbench updates v0.1
 *
 * Subscribes to the SSE push endpoint and calls tab renderers
 * when data files change. Uses exponential backoff on connection loss.
 *
 * Import:
 *   import { subscribeSSE, unsubscribeSSE } from './js/sse-client.js';
 *
 * Usage:
 *   subscribeSSE('http://localhost:27128/events', {
 *     onFileChange(fileName, timestamp) { ... },
 *     onConnectionChange(status) { ... },  // 'connected' | 'reconnecting' | 'disconnected'
 *     onError(err) { ... }
 *   });
 *
 *   unsubscribeSSE(); // cleanup on page unload
 */

let eventSource = null;
let retryTimer = null;
let retryDelay = 1000; // starts at 1s
const MAX_RETRY_DELAY = 30000; // max 30s
let callbacks = {};
let isUnsubscribed = false;

/**
 * Subscribe to the SSE event stream.
 * @param {string} url - SSE endpoint URL (e.g. 'http://localhost:27128/events')
 * @param {object} cb - Callback object { onFileChange, onConnectionChange, onError }
 */
export function subscribeSSE(url, cb) {
  callbacks = cb || {};
  isUnsubscribed = false;
  connect(url);
}

/**
 * Unsubscribe and clean up all SSE state.
 */
export function unsubscribeSSE() {
  isUnsubscribed = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  retryDelay = 1000;
  callbacks = {};
}

function connect(url) {
  if (isUnsubscribed) return;
  if (eventSource) {
    eventSource.close();
  }

  if (callbacks.onConnectionChange) {
    callbacks.onConnectionChange('reconnecting');
  }

  eventSource = new EventSource(url);

  eventSource.addEventListener('connected', (e) => {
    retryDelay = 1000; // reset backoff on successful connection
    if (callbacks.onConnectionChange) {
      callbacks.onConnectionChange('connected');
    }
  });

  eventSource.addEventListener('data_change', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.file && callbacks.onFileChange) {
        callbacks.onFileChange(data.file, data.timestamp || null);
      }
    } catch (err) {
      if (callbacks.onError) {
        callbacks.onError(new Error('Failed to parse SSE data: ' + e.data));
      }
    }
  });

  eventSource.onerror = () => {
    // EventSource auto-reconnects, but we want our own backoff logic
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    if (isUnsubscribed) return;

    if (callbacks.onConnectionChange) {
      callbacks.onConnectionChange('reconnecting');
    }

    // Exponential backoff
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);

    if (callbacks.onError) {
      callbacks.onError(new Error(`SSE connection lost, retrying in ${delay}ms`));
    }

    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect(url);
    }, delay);
  };

  // Default message handler (for non-named events)
  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.file && callbacks.onFileChange) {
        callbacks.onFileChange(data.file, data.timestamp || null);
      }
    } catch {
      // silent — non-JSON messages are keepalives or other noise
    }
  };
}
