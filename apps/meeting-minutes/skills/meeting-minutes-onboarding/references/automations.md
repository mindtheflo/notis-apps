# Optional automation templates

Templates are bundled as instructions, not active publisher schedules. Resolve the installer's exact app ID, timezone, trigger and delivery destination. List existing automations with pagination, match purpose and scope, obtain activation consent, then dry-run, create/update and read back. Never reuse publisher channel/account IDs or webhook URLs. Missing integrations do not block manual onboarding.

## Completed meeting capture

Trigger: Webhook/integration.

Prompt template: Run meeting-record-capture and meeting-action-items on the completed meeting payload. Task sync and social drafting are opt-in, separate steps.

## Meeting preparation

Trigger: Calendar event.

Prompt template: Use meeting-preparation for the selected upcoming meeting.
