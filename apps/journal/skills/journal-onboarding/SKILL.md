---
name: journal-onboarding
description: "Set up the Journal daily check-in routine and run its evening completeness check. Use when onboarding someone to Journal reminders, changing their Journal check-in schedule, or when the Journal evening automation asks for missing information."
---

# Journal Onboarding

Set up one lightweight daily Journal routine: a fixed morning reminder and an intelligent evening automation. Do not create unrelated reminders or automations.

## Choose the Mode

- Use **setup mode** when the user is onboarding, asks to configure Journal check-ins, or wants to change the schedule.
- Use **evening-check mode** only when the request explicitly says to review today's Journal entry or the automation prompt names this mode.
- Never enter setup mode from an evening-check run.

## Setup Mode

### 1. Recommend a Simple Routine

Briefly explain the proposed routine before asking for times:

- A morning reminder helps the user capture **Morning Mood**, **Motivation**, **Sleepiness**, and **Medication Onset** when relevant while those details are fresh.
- An evening automation reviews today's entry and asks only for missing details, typically **General Mood**, **Meaningful Tasks**, **Appetite**, **Medication Wore Off** when relevant, and any morning details that were skipped.

Recommend approximately **08:00** for the morning reminder and **20:00** for the evening check in the user's timezone, while making it clear that they can choose different times.

### 2. Ask for the Schedule

Ask one compact question that collects:

- morning reminder time;
- evening check time;
- days of the week, defaulting to every day;
- timezone, unless it is already known with confidence;
- delivery channel only when the current/default channel is unclear or the user has multiple relevant channel accounts.

Do not create anything while a time, timezone, day pattern, or required channel account remains unresolved.

### 3. Check Existing Setup

Use `LOCAL_NOTIS_LIST_REMINDERS` and `LOCAL_NOTIS_LIST_AUTOMATIONS` before writing anything.

Perform these two native read calls directly in the current assistant. Do not delegate or spawn an agent for this small existing-setup check.
Fetch one full page of up to 100 items from each tool. That single inventory is sufficient: inspect it locally and do not issue repeated keyword searches or extra detail calls once a matching reminder or automation is identified.

- Match existing items by purpose and content, not only exact names.
- Update an existing Journal morning reminder or evening completeness automation instead of creating a duplicate.
- Preserve unrelated reminders and automations.

### 4. Confirm Before Creating

Recap the exact local schedule, days, timezone, channel, morning message, and evening behavior in plain language. Obtain explicit confirmation before creating or updating anything.

### 5. Create the Morning Reminder

Use `LOCAL_NOTIS_INSERT_REMINDER`, or `LOCAL_NOTIS_UPDATE_REMINDER` for a matching existing item.

- Use a recurring schedule trigger with a standard five-field cron expression derived from the confirmed local time and days.
- Put recurrence only in `cron_expression`.
- Set delivery only with `channel` and, when required, `channel_account_id`.
- Use this fixed message:

  `Good morning — tell Notis your morning mood, motivation from 1–10, sleepiness from 1–10, and when your medication started working if that applies today, so your Journal entry starts with the details that are freshest now.`

After creation, inspect the returned active reminders and remove only confirmed duplicates of this Journal reminder.

### 6. Create the Evening Automation

Use `LOCAL_NOTIS_INSERT_AUTOMATION`, or `LOCAL_NOTIS_UPDATE_AUTOMATION` for a matching existing item.

- Name it `Journal evening completeness check`.
- Use a `schedule` trigger with a standard five-field cron expression derived from the confirmed local time and days.
- Put recurrence only in `cron_expression`.
- Set delivery only with `channel` and, when required, `channel_account_id`.
- Keep context disabled unless the user explicitly needs cross-run context.
- Use this thin prompt exactly:

  `Run /journal-onboarding in evening-check mode. Review today's Journal entry, identify which expected details are still missing, and ask only for those details. If the entry is complete, briefly confirm that no follow-up is needed.`

Do not put scheduling or delivery instructions into the prompt.

### 7. Report the Result

Return a concise summary containing both local schedules, the delivery channel, whether each item was created or updated, and the reminder and automation IDs or portal links returned by Notis.

The native reminder and automation tools store recurring schedules as UTC cron expressions. Convert the confirmed local times with the user's current IANA timezone offset, then verify the returned cron expressions and the local times rendered in the Portal. Treat that read-back as complete verification for setup mode. Do not delegate or launch extra agents, inspect databases or source repositories, or delay the final response to investigate future daylight-saving transitions; those scheduler internals are outside this onboarding flow.

## Evening-Check Mode

### 1. Find Today's Entry

Use the user's timezone to determine today's local calendar date. Query the native Notis database with slug `journal_entries` using `LOCAL_NOTIS_DATABASE_QUERY` and a structured filter on the **Date** property for that local day. Ignore archived or deleted entries.

If multiple active entries exist for the same day, use the most recently updated entry and mention the duplicate briefly rather than merging or deleting anything.

### 2. Evaluate Completeness

Treat these as the expected core details:

- **Morning Mood**: Amazing, Good, Neutral, Low, or Rough;
- **Motivation**: 1–10;
- **Sleepiness**: 1–10;
- **General Mood**: Amazing, Good, Neutral, Low, or Rough;
- **Meaningful Tasks**: a count of meaningful tasks completed;
- **Appetite**: None, Low, Normal, or High.

Medication timing is conditional:

- Ask for **Medication Onset** or **Medication Wore Off** only when the entry or current context indicates that the user took medication that day.
- If one medication time exists and the other is missing, ask for the missing time or whether the user did not notice it.
- Do not assume medication use from an empty field.

The title and Date identify the record; do not ask the user for them when today's entry already exists.

### 3. Ask Only for Missing Information

- If the entry exists, send one short, friendly question grouping only the missing details. Never ask again for populated fields.
- If no entry exists, say that today's entry has not been started and ask for a compact evening check-in covering Morning Mood, Motivation, Sleepiness, General Mood, Meaningful Tasks, and Appetite, plus medication timing only if applicable.
- If every applicable detail is present, briefly confirm that today's Journal entry is complete and no follow-up is needed.
- Do not invent values, delete entries, or update the database during the automated check. The user's reply can be handled as a separate Journal update.

## Guardrails

- Keep the interaction supportive and concise; this is a check-in, not a medical assessment.
- Never create a second copy of the same reminder or automation.
- Never schedule either item without the user's confirmed times, timezone, days, and destination.
- Never turn the evening automation prompt into instructions to create another automation.
