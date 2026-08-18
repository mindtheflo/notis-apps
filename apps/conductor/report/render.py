#!/usr/bin/env python3
"""Render the live build report for the Conductor app.

The report is a single self-contained HTML file so it can be opened straight
from disk with no server and no build step. Its content lives in
``state.json``: everything here is presentation, so an update during a long
build is a small JSON edit rather than a hand-edited page that drifts out of
sync with what actually happened.

    python3 apps/conductor/report/render.py
"""

from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / "state.json"
OUTPUT_FILE = HERE / "index.html"

STATUS_LABELS = {
    "pending": "Pending",
    "in_progress": "In progress",
    "passing": "Passing",
    "blocked": "Blocked",
    "open": "Open",
    "fixed": "Fixed",
    "wont_fix": "Not fixing",
    "platform": "Platform gap",
}


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""))


def chip(status: str) -> str:
    label = STATUS_LABELS.get(status, status.replace("_", " ").title())
    return f'<span class="chip chip-{esc(status)}">{esc(label)}</span>'


def render_acceptance(items: list[dict]) -> str:
    if not items:
        return '<p class="empty">Nothing recorded yet.</p>'
    rows = []
    for item in items:
        evidence = item.get("evidence")
        evidence_html = (
            f'<div class="evidence">{esc(evidence)}</div>' if evidence else ""
        )
        rows.append(
            f"""<tr>
              <td class="cell-status">{chip(item.get("status", "pending"))}</td>
              <td>
                <div class="row-title">{esc(item.get("title"))}</div>
                <div class="row-detail">{esc(item.get("detail"))}</div>
                {evidence_html}
              </td>
            </tr>"""
        )
    return f'<table class="grid">{"".join(rows)}</table>'


def render_findings(items: list[dict]) -> str:
    if not items:
        return '<p class="empty">Nothing broken yet.</p>'
    cards = []
    for item in items:
        fix = item.get("fix")
        fix_html = (
            f'<div class="fix"><span class="fix-label">Fix</span>{esc(fix)}</div>'
            if fix
            else ""
        )
        area = item.get("area")
        area_html = f'<span class="area">{esc(area)}</span>' if area else ""
        cards.append(
            f"""<article class="card">
              <header>
                {chip(item.get("status", "open"))}
                {area_html}
                <h3>{esc(item.get("title"))}</h3>
              </header>
              <p>{esc(item.get("detail"))}</p>
              {fix_html}
            </article>"""
        )
    return f'<div class="cards">{"".join(cards)}</div>'


def render_wishes(items: list[dict]) -> str:
    if not items:
        return '<p class="empty">Nothing recorded yet.</p>'
    cards = []
    for item in items:
        shape = item.get("shape")
        shape_html = f"<pre><code>{esc(shape)}</code></pre>" if shape else ""
        cards.append(
            f"""<article class="card wish">
              <header>
                <span class="area">{esc(item.get("area", "SDK"))}</span>
                <h3>{esc(item.get("title"))}</h3>
              </header>
              <p><span class="label">What it cost</span>{esc(item.get("cost"))}</p>
              <p><span class="label">What would fix it</span>{esc(item.get("want"))}</p>
              {shape_html}
            </article>"""
        )
    return f'<div class="cards">{"".join(cards)}</div>'


def render_timeline(items: list[dict]) -> str:
    if not items:
        return '<p class="empty">Nothing recorded yet.</p>'
    rows = []
    for item in reversed(items):
        rows.append(
            f"""<li>
              <span class="stamp">{esc(item.get("at"))}</span>
              <span class="event">{esc(item.get("event"))}</span>
            </li>"""
        )
    return f'<ol class="timeline">{"".join(rows)}</ol>'


def render_identifiers(values: dict) -> str:
    rows = "".join(
        f"<tr><th>{esc(key)}</th><td><code>{esc(value)}</code></td></tr>"
        for key, value in values.items()
    )
    return f'<table class="ids">{rows}</table>'


def counts(items: list[dict], key: str = "status") -> dict[str, int]:
    tally: dict[str, int] = {}
    for item in items:
        tally[item.get(key, "pending")] = tally.get(item.get(key, "pending"), 0) + 1
    return tally


CSS = """
:root {
  --bg: #ffffff;
  --panel: #fbfbfa;
  --border: #e6e5e1;
  --text: #1f1e1c;
  --muted: #76736d;
  --accent: #2f6f4f;
  --warn: #9a5b1c;
  --stop: #9c3129;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 48px 32px 96px;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.55 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { max-width: 960px; margin: 0 auto; }
h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 6px; }
h2 {
  font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted); margin: 48px 0 14px; font-weight: 600;
}
h3 { font-size: 15px; margin: 0; font-weight: 600; letter-spacing: -0.01em; }
p { margin: 0 0 10px; }
.subtitle { color: var(--muted); margin: 0 0 20px; max-width: 60ch; }
.generated { color: var(--muted); font-size: 13px; }
.summary { display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0 8px; }
.stat {
  border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px;
  background: var(--panel); min-width: 132px;
}
.stat .n { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
.stat .k { font-size: 12px; color: var(--muted); }
table { width: 100%; border-collapse: collapse; }
.grid td {
  border-top: 1px solid var(--border); padding: 14px 12px 14px 0; vertical-align: top;
}
.grid tr:first-child td { border-top: none; }
.cell-status { width: 118px; padding-right: 16px; }
.row-title { font-weight: 600; }
.row-detail { color: var(--muted); font-size: 14px; margin-top: 2px; }
.evidence {
  margin-top: 8px; font-family: var(--mono); font-size: 12.5px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
  padding: 8px 10px; white-space: pre-wrap; color: var(--text);
}
.ids th {
  text-align: left; font-weight: 500; color: var(--muted); padding: 5px 16px 5px 0;
  white-space: nowrap; font-size: 14px;
}
.ids td { padding: 5px 0; }
code { font-family: var(--mono); font-size: 12.5px; }
pre {
  background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px; overflow-x: auto; margin: 10px 0 0;
}
pre code { font-size: 12.5px; line-height: 1.5; }
.cards { display: grid; gap: 12px; }
.card {
  border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px;
  background: var(--panel);
}
.card header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.card header h3 { flex: 1 1 100%; }
.card p { color: var(--muted); font-size: 14px; }
.card .label {
  display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--text); font-weight: 600; margin-bottom: 2px;
}
.fix {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
  font-size: 14px;
}
.fix-label {
  display: inline-block; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.07em; font-weight: 600; margin-right: 8px; color: var(--accent);
}
.area {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--muted); font-weight: 600;
}
.chip {
  display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; padding: 3px 8px; border-radius: 999px;
  border: 1px solid var(--border); background: #fff; color: var(--muted);
  white-space: nowrap;
}
.chip-passing, .chip-fixed { color: var(--accent); border-color: #c2ddcd; background: #f1f8f4; }
.chip-in_progress { color: var(--warn); border-color: #e8d3b4; background: #fdf6ec; }
.chip-blocked, .chip-open { color: var(--stop); border-color: #edc9c5; background: #fdf1f0; }
.chip-platform { color: #4a4f8c; border-color: #cdd0ea; background: #f2f3fb; }
.timeline { list-style: none; margin: 0; padding: 0; }
.timeline li {
  display: flex; gap: 16px; padding: 7px 0; border-top: 1px solid var(--border);
  font-size: 14px;
}
.timeline li:first-child { border-top: none; }
.stamp { color: var(--muted); font-family: var(--mono); font-size: 12.5px; white-space: nowrap; min-width: 118px; }
.empty { color: var(--muted); font-style: italic; }
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16161a; --panel: #1d1e23; --border: #2e2f36; --text: #e9e8e4;
    --muted: #96958f; --accent: #7fc39a; --warn: #dda765; --stop: #e0847b;
  }
  .chip { background: #23242a; }
  .chip-passing, .chip-fixed { background: #1b2a21; border-color: #2f4c3a; }
  .chip-in_progress { background: #2b2419; border-color: #4d3f28; }
  .chip-blocked, .chip-open { background: #2c1e1d; border-color: #4d302d; }
  .chip-platform { background: #1f2030; border-color: #363a55; }
}
"""


def main() -> int:
    state = json.loads(STATE_FILE.read_text())
    acceptance = state.get("acceptance", [])
    findings = state.get("findings", [])
    wishes = state.get("wishes", [])

    acceptance_counts = counts(acceptance)
    finding_counts = counts(findings)
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    stats = [
        (acceptance_counts.get("passing", 0), f"of {len(acceptance)} acceptance checks passing"),
        (finding_counts.get("open", 0), "findings open"),
        (finding_counts.get("fixed", 0), "findings fixed"),
        (len(wishes), "SDK gaps recorded"),
    ]
    stats_html = "".join(
        f'<div class="stat"><div class="n">{n}</div><div class="k">{esc(k)}</div></div>'
        for n, k in stats
    )

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(state.get("title"))}</title>
<style>{CSS}</style>
</head>
<body>
<main>
  <h1>{esc(state.get("title"))}</h1>
  <p class="subtitle">{esc(state.get("subtitle"))}</p>
  <p class="generated">Generated {esc(generated)} &middot; target user <code>{esc(state.get("target_user"))}</code></p>

  <div class="summary">{stats_html}</div>

  <h2>Acceptance</h2>
  {render_acceptance(acceptance)}

  <h2>What broke, what is fixed</h2>
  {render_findings(findings)}

  <h2>What the apps SDK should have given me</h2>
  {render_wishes(wishes)}

  <h2>Identifiers</h2>
  {render_identifiers(state.get("identifiers", {}))}

  <h2>Timeline</h2>
  {render_timeline(state.get("timeline", []))}
</main>
</body>
</html>
"""
    OUTPUT_FILE.write_text(page)
    print(f"wrote {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
