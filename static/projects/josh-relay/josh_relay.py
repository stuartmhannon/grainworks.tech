#!/usr/bin/env python3
"""
Josh.ai → Hermes Agent webhook relay (v2).

Josh scenes use httpGet() Custom Commands.  The function supports
GET and POST, custom headers, JSON body, and format=json for
structured responses.  This relay:

  1. Accepts GET or POST requests from Josh (plain HTTP, no auth)
  2. Converts them to properly signed POST calls for the Hermes webhook
  3. Returns structured JSON that Josh can parse with format=json
  4. Fires a Josh response scene via the External Scene API for audible feedback

Usage:
  export JOSH_WEBHOOK_URL="http://localhost:8644/webhooks/josh-trigger"
  export JOSH_WEBHOOK_SECRET="your...secret"
  python3 josh_relay.py

Environment:
  JOSH_WEBHOOK_URL       Hermes webhook endpoint (default: http://localhost:8644/webhooks/josh-trigger)
  JOSH_WEBHOOK_SECRET    HMAC-SHA256 secret (required for signing)
  JOSH_RELAY_PORT        Listen port (default: 8645)
  JOSH_RELAY_HOST        Bind address (default: 0.0.0.0)
  JOSH_CALLBACK_URL      Optional: External Scene API URL for response scene callback
  JOSH_RELAY_PID_FILE    PID file path (default: /tmp/josh_relay.pid)
  JOSH_RELAY_LOG_FILE    Log file path (default: /tmp/josh_relay.log)
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
    """Compute HMAC-SHA256 for webhook auth."""
    if not SECRET:
        log.warning("JOSH_WEBHOOK_SECRET is not set — HMAC will be empty")
        return ""
    return hmac.new(SECRET.encode(), payload, hashlib.sha256).hexdigest()


def build_json_response(status_code: int, body: dict) -> bytes:
    """Build a complete HTTP response with JSON body."""
    data = json.dumps(body).encode()
    reason_map = {
        200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
        404: "Not Found", 405: "Method Not Allowed", 409: "Conflict",
        422: "Unprocessable Entity", 429: "Too Many Requests",
        500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
    }
    reason = reason_map.get(status_code, "Unknown")
    header = (
        f"HTTP/1.1 {status_code} {reason}\r\n"
        f"Content-Type: application/json\r\n"
        f"Content-Length: {len(data)}\r\n"
        f"Connection: close\r\n\r\n"
    )
    return header.encode() + data


async def read_http_request(reader):
    """Read and parse an HTTP request. Returns (method, path, headers_dict, body_bytes)."""
    # Read request line + headers
    raw = b""
    while True:
        chunk = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=30)
        raw += chunk
        break

    lines = raw.split(b"\r\n")
    request_line = lines[0].decode(errors="replace")
    parts = request_line.split()
    if len(parts) < 2:
        return None, None, {}, b""

    method = parts[0].upper()
    path = parts[1]

    # Parse headers
    headers = {}
    for line in lines[1:]:
        line_str = line.decode(errors="replace").strip()
        if ":" in line_str:
            key, val = line_str.split(":", 1)
            headers[key.strip().lower()] = val.strip()

    # Read body if Content-Length is present
    body = b""
    content_length = int(headers.get("content-length", 0))
    if content_length > 0:
        body = await asyncio.wait_for(reader.readexactly(content_length), timeout=10)

    return method, path, headers, body


def relay_to_webhook(payload_body: dict) -> tuple:
    """Forward a payload to the Hermes webhook. Returns (status_code, response_body_bytes)."""
    payload_bytes = json.dumps(payload_body).encode()
    signature = compute_hmac(payload_bytes)

    req_headers = {
        "Content-Type": "application/json",
        "Content-Length": str(len(payload_bytes)),
        "User-Agent": "JoshRelay/2.0",
    }
    if signature:
        req_headers["X-Hub-Signature-256"] = f"sha256={signature}"

    req = urllib.request.Request(
        WEBHOOK_URL,
        data=payload_bytes,
        headers=req_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 502, str(e).encode()


def fire_josh_callback():
    """Fire-and-forget the Josh response scene callback."""
    if not JOSH_CALLBACK_URL:
        return
    try:
        cb = urllib.request.urlopen(JOSH_CALLBACK_URL, timeout=5)
        cb_body = cb.read()
        log.info("Josh callback responded %s: %.100s", cb.status, cb_body.decode().strip())
    except Exception as e:
        log.warning("Josh callback failed: %s", e)


async def handle_connection(reader, writer):
    """Handle a single HTTP request from Josh."""
    try:
        method, path, headers, body = await read_http_request(reader)
    except asyncio.TimeoutError:
        writer.close()
        return

    if method is None:
        writer.close()
        return

    log.info("Received %s %s", method, path)

    # Build the payload to send to Hermes webhook
    webhook_payload = {
        "source": "josh-httpget",
        "method": method,
        "path": path,
    }

    # Parse body if present (Josh can send JSON via POST)
    if body:
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict):
                webhook_payload["scene_data"] = parsed
            else:
                webhook_payload["raw_body"] = body.decode(errors="replace")
        except json.JSONDecodeError:
            webhook_payload["raw_body"] = body.decode(errors="replace")

    # Include any useful headers from Josh's request
    for h in ["x-josh-room", "x-josh-trigger", "x-josh-time", "user-agent"]:
        if h in headers:
            webhook_payload[f"josh_{h.replace('-', '_')}"] = headers[h]

    # Forward to Hermes webhook
    wh_status, wh_body = relay_to_webhook(webhook_payload)

    log.info("Webhook responded %s: %.200s", wh_status, wh_body.decode(errors="replace"))

    # Try to parse the webhook response as JSON for richer return
    wh_json = None
    try:
        wh_json = json.loads(wh_body)
    except (json.JSONDecodeError, ValueError):
        pass

    # Build structured response for Josh
    response_body = {
        "status": "accepted" if wh_status in (200, 201, 202) else "error",
        "code": wh_status,
    }

    if wh_json and isinstance(wh_json, dict):
        # Pass through webhook response details
        response_body["message"] = wh_json.get("status", "relayed")
        if "delivery_id" in wh_json:
            response_body["delivery_id"] = wh_json["delivery_id"]
    else:
        response_body["message"] = wh_body.decode(errors="replace")[:200]

    # Send response to Josh
    response_bytes = build_json_response(wh_status, response_body)
    writer.write(response_bytes)
    await writer.drain()
    writer.close()

    # Fire Josh response scene callback (async, after response sent)
    fire_josh_callback()


async def main():
    server = await asyncio.start_server(handle_connection, LISTEN_HOST, LISTEN_PORT)
    addr = server.sockets[0].getsockname()
    log.info("Josh relay v2 listening on %s:%s -> %s", *addr[:2], WEBHOOK_URL)

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
