# Affiliate Prospects

Local-first Notis app for monitoring the affiliate recruiting pipeline.

The app is intentionally a read-only campaign surface. Notis automations and Codex workers own
discovery, enrichment, outreach preparation, analytics reconciliation, and record updates. This
keeps one source of truth while avoiding business logic in the UI.

## Routes

- Dashboard: KPIs, pipeline, priority queue, and segment coverage.
- Prospects: responsive reference table for every lead and next action.
- Segments: scorecards linked to the source-controlled segment playbooks.

## Data

The deployed app references `affiliate_prospects_1`. Its canonical schema is documented in
`campaign/affiliate-network/data-schema.md`. During local
development the app uses deterministic mock prospects so it can be reviewed before any workspace
installation.
