# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CalTodoist is a Cal.com to Todoist webhook integration that automatically creates and manages Todoist tasks from Cal.com booking events. It's deployed as a Netlify serverless function.

## Commands

```bash
npm run dev            # Run locally with Netlify CLI
npm run typecheck      # Type check without emitting
npm run build          # Build for production (tsc + copy public assets)
npm test               # Run tests (vitest); test:watch, test:coverage also available
npm run lint           # Biome check; lint:fix applies safe fixes
npm run format         # Biome format
```

## Architecture

**Event Flow**: Cal.com webhook → `api.ts` → `webhook.ts` handler → `todoist.ts` service

```
netlify/functions/api.ts     # HTTP entry point, routes requests
src/handlers/webhook.ts      # Event dispatcher, handles all Cal.com trigger events
src/services/todoist.ts      # Todoist API operations (create/update/delete tasks)
src/services/storage.ts      # Netlify Blobs KV store (booking UID → task ID mapping)
src/types/calcom.ts          # Cal.com webhook payload types with type guards
src/utils/verify.ts          # HMAC-SHA256 webhook signature verification
src/utils/retry.ts           # Retry with backoff; only transient errors are retried
```

**Key Patterns**:
- Webhook handler uses a switch on `TriggerEvent` enum to dispatch to appropriate handler functions
- Storage layer abstracts Netlify Blobs with `store/get/remove` for booking-to-task mapping
- Type guards (`isBookingPayload`, `isNoShowPayload`) validate payload shapes at runtime; a guard failure returns 400 so Cal.com surfaces schema drift instead of silently dropping the event
- Handlers are ordered for Cal.com's at-least-once delivery: create rolls back the Todoist task if the mapping save fails, reschedule saves the new mapping before deleting the old, and `deleteTask` treats 404 as success
- Replay protection: events whose signed `createdAt` is missing or older than 10 minutes are rejected with 400
- Booker-supplied text (names, emails, notes, titles, location) is Markdown-escaped before going into Todoist content/descriptions (`escapeMarkdown` in `todoist.ts`)

## Environment Variables

- `TODOIST_API_TOKEN` - Todoist developer API token (required)
- `TODOIST_PROJECT_ID` - Target project ID, defaults to Inbox (optional)
- `CALCOM_WEBHOOK_SECRET` - Webhook verification secret (required; without it requests are rejected)
- `ALLOW_UNVERIFIED_WEBHOOKS` - Set to `true` to skip verification when no secret is set (local dev only)

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/cal/webhook` - Cal.com webhook receiver
