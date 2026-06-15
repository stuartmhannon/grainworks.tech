#!/usr/bin/env python3
"""
Josh.ai → Hermes Agent webhook relay.

Josh scenes use httpget() Custom Commands which send plain GET requests.
The Hermes Agent webhook platform expects POST with HMAC-SHA256 signature.
This relay bridges the gap and optionally fires a Josh response scene
via the External Scene API after successful delivery.

Usage:
  # Set required environment variables
  export JOSH_WEBHOOK_URL="http://localhost:8644/webhooks/josh-trigger"
  export JOSH_WEBHOOK_SECRET="your-hmac-secret"

  # Optional: configure response scene callback
  export JOSH_CALLBACK_URL="https://www.josh.ai/external?licensekey=YOUR_KEY&scene=YOUR_SCENE&password=YOUR_PASS"

  # Start
  python3 josh_relay.py

The relay listens on 0.0.0.0:8645 by default. Override with:
  JOSH_RELAY_PORT=8645
  JOSH_RELAY_HOST="0.0.0.0"
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import sys
import urllib.error
import urllib.request

WEBHOOK_URL = os.environ.get(
    "JOSH_WEBHOOK_URL",
    "http://localhost:8644/webhooks/josh-trigger",
)
SECRET = os.environ.get("JOSH_WEBHOOK_SECRET", "")
LISTEN_PORT = int(os.environ.get("JOSH_RELAY_PORT", "8645"))
LISTEN_HOST = os.environ.get("JOSH_RELAY_HOST", "0.0.0.0")

# Optional: Josh External Scene API callback for response confirmation
JOSH_CALLBACK_URL = os.environ.get("JOSH_CALLBACK_URL", "")

PID_FILE = os.environ.get("JOSH_RELAY_PID_FILE", "/tmp/josh_relay.pid")
LOG_FILE = os.environ.get("JOSH_RELAY_LOG_FILE", "/tmp/josh_relay.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler(sys.stderr)],
)
log = logging.getLogger("josh_relay")


def compute_hmac(payload: bytes) -> str:
    if not SECRET:
        log.warning("JOSH_WEBHOOK_SECRET is not set — HMAC will be empty")
        return ""
    return hmac.new(SECRET.encode(), payload, hashlib.sha256).hexdigest()


async def handle_get(reader, writer):
    """Read a GET request, relay to webhook as POST, respond."""
    raw = b""
    try:
        while True:
            chunk = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=30)
            raw += chunk
            break
    except asyncio.TimeoutError:
        writer.close()
        return

    request_line = raw.split(b"\r\n")[0].decode()
    parts = request_line.split()
    if len(parts) < 2:
        writer.close()
        return
    method, path = parts[0], parts[1]

    log.info("Received %s %s", method, path)

    # Build the POST payload for the webhook
    payload = json.dumps({"method": method, "path": path, "source": "josh-httpget"}).encode()
    signature = compute_hmac(payload)

    headers = {
        "Content-Type": "application/json",
        "Content-Length": str(len(payload)),
        "User-Agent": "JoshRelay/1.0",
    }
    if signature:
        headers["X-Hub-Signature-256"] = f"sha256={signature}"

    # Forward to Hermes Agent webhook
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=payload,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read()
            status = resp.status
            log.info("Webhook responded %s: %.200s", status, body.decode())
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read()
        log.warning("Webhook HTTP error %s: %.200s", status, body.decode())
    except Exception as e:
        status = 502
        body = str(e).encode()
        log.error("Webhook relay error: %s", e)

    # Respond to Josh
    reason = {
        200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
        404: "Not Found", 405: "Method Not Allowed", 409: "Conflict",
        422: "Unprocessable Entity", 429: "Too Many Requests",
        500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
    }.get(status, "Unknown")
    response_line = f"HTTP/1.1 {status} {reason}\r\n"
    response_line += f"Content-Type: text/plain\r\n"
    response_line += f"Content-Length: {len(body)}\r\n"
    response_line += "Connection: close\r\n\r\n"
    writer.write(response_line.encode() + body)
    await writer.drain()
    writer.close()

    # Fire-and-forget: trigger Josh response scene (if configured)
    if JOSH_CALLBACK_URL:
        try:
            cb = urllib.request.urlopen(JOSH_CALLBACK_URL, timeout=5)
            cb_body = cb.read()
            log.info("Josh callback responded %s: %.100s", cb.status, cb_body.decode().strip())
        except Exception as e:
            log.warning("Josh callback failed: %s", e)


async def main():
    server = await asyncio.start_server(handle_get, LISTEN_HOST, LISTEN_PORT)

    addr = server.sockets[0].getsockname()
    log.info("Josh relay listening on %s:%s -> %s", *addr[:2], WEBHOOK_URL)

    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Shutting down")
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
