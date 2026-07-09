#!/usr/bin/env python3
"""Workflow Store — standalone HTTP CRUD API for workflow definitions."""

import json
import os
import sys
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

DATA_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "data",
    "workflows-index.json",
)
HOST = "0.0.0.0"
PORT = 9200


def load_workflows():
    with open(DATA_PATH) as f:
        return json.load(f)


def save_workflows(data):
    with open(DATA_PATH, "w") as f:
        json.dump(data, f, indent=2)


def find_workflow(data, agent_id):
    for wf in data.get("workflows", []):
        if wf.get("agent_id") == agent_id:
            return wf
    return None


def update_workflow(data, agent_id, agent_name, description, version):
    wf = find_workflow(data, agent_id)
    if wf is None:
        return None
    if agent_name is not None:
        wf["agent_name"] = agent_name
    if description is not None:
        wf["description"] = description
    if version is not None:
        wf["version"] = version
    wf["last_modified"] = datetime.now(timezone.utc).isoformat()
    save_workflows(data)
    return wf


class WorkflowHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write(
            f"[{datetime.now().isoformat()}] {self.command} {self.path} -> {args[0]}\n"
        )

    # ---- CORS helpers ----

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_json(self, status_code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            self.send_json(400, {"status": "error", "message": "Empty body"})
            return None
        try:
            return json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            self.send_json(400, {"status": "error", "message": "Invalid JSON"})
            return None

    # ---- OPTIONS ----

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    # ---- GET ----

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/api/workflows":
            try:
                data = load_workflows()
            except (IOError, OSError, json.JSONDecodeError) as e:
                self.send_json(
                    500,
                    {"status": "error", "message": f"Failed to read data: {e}"},
                )
                return
            self.send_json(200, {"workflows": data.get("workflows", [])})
        else:
            self.send_json(404, {"status": "error", "message": "Not found"})

    # ---- PUT ----

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        # Match /api/workflows/{agent_id}
        parts = path.split("/")
        if len(parts) == 4 and parts[1] == "api" and parts[2] == "workflows":
            agent_id = parts[3]
            if not agent_id:
                self.send_json(
                    400,
                    {"status": "error", "message": "agent_id is required"},
                )
                return

            body = self._read_body()
            if body is None:
                return

            agent_name = body.get("agent_name")
            description = body.get("description")
            version = body.get("version")

            try:
                data = load_workflows()
            except (IOError, OSError, json.JSONDecodeError) as e:
                self.send_json(
                    500,
                    {"status": "error", "message": f"Failed to read data: {e}"},
                )
                return

            wf = update_workflow(data, agent_id, agent_name, description, version)
            if wf is None:
                self.send_json(
                    404,
                    {
                        "status": "error",
                        "message": f"Workflow {agent_id} not found",
                    },
                )
                return

            self.send_json(
                200,
                {
                    "status": "ok",
                    "agent_id": agent_id,
                    "agent_name": wf.get("agent_name", agent_name),
                },
            )
        else:
            self.send_json(404, {"status": "error", "message": "Not found"})


def main():
    print(f"Workflow store starting on {HOST}:{PORT}", flush=True)
    print(f"Data file: {DATA_PATH}", flush=True)
    server = HTTPServer((HOST, PORT), WorkflowHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.", flush=True)
        server.server_close()


if __name__ == "__main__":
    main()
