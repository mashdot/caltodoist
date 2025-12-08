# CalTodoist

Automatically create Todoist tasks from Cal.com bookings. When someone books a meeting with you, a task is created in Todoist with the meeting details, time, and duration.

## Features

- **Auto-create tasks** - New bookings automatically create Todoist tasks
- **Sync updates** - Rescheduled bookings update the task due date
- **Auto-cleanup** - Cancelled/rejected bookings delete the task
- **Meeting tracking** - Tasks auto-complete when meetings end
- **Duration support** - Task duration matches meeting length
- **Payment tracking** - Payment status updates added to task description

## Supported Cal.com Events

| Event | Action |
|-------|--------|
| `BOOKING_CREATED` | Creates a new task |
| `BOOKING_RESCHEDULED` | Updates task due date |
| `BOOKING_CANCELLED` | Deletes the task |
| `BOOKING_REJECTED` | Deletes the task |
| `BOOKING_REQUESTED` | Creates a pending task |
| `BOOKING_PAYMENT_INITIATED` | Adds payment status to description |
| `BOOKING_PAID` | Adds payment confirmation to description |
| `MEETING_STARTED` | Adds comment to task |
| `MEETING_ENDED` | Completes the task |
| `BOOKING_NO_SHOW_UPDATED` | Adds no-show comment |

## Setup

### Prerequisites

- [Netlify](https://netlify.com) account
- [Todoist](https://todoist.com) account
- [Cal.com](https://cal.com) account

### Deploy to Netlify

1. Fork this repository
2. Connect to Netlify and deploy
3. Add environment variables (see below)
4. Enable Netlify Blobs in your site settings

### Environment Variables

Set these in Netlify (Site settings > Environment variables):

| Variable | Required | Description |
|----------|----------|-------------|
| `TODOIST_API_TOKEN` | Yes | Get from [Todoist Settings > Integrations > Developer](https://todoist.com/app/settings/integrations/developer) |
| `TODOIST_PROJECT_ID` | No | Project ID for tasks (defaults to Inbox). Find in project URL: `todoist.com/app/project/PROJECT_ID` |
| `CALCOM_WEBHOOK_SECRET` | Yes | Secret for verifying webhooks from Cal.com |

### Configure Cal.com Webhook

1. Go to Cal.com Settings > Developer > Webhooks
2. Create a new webhook:
   - **Subscriber URL**: `https://your-site.netlify.app/api/cal/webhook`
   - **Secret**: Generate a secret and save it as `CALCOM_WEBHOOK_SECRET`
   - **Event triggers**: Select the events you want to sync

## Development

```bash
# Install dependencies
npm install

# Run locally with Netlify CLI
npm run dev

# Type check
npm run typecheck

# Build
npm run build
```

## Architecture

```
├── netlify/functions/
│   └── api.ts              # Netlify Function (API routes)
├── src/
│   ├── handlers/
│   │   └── webhook.ts      # Webhook event handlers
│   ├── services/
│   │   ├── todoist.ts      # Todoist API integration
│   │   └── storage.ts      # Netlify Blobs for booking→task mapping
│   ├── types/
│   │   └── calcom.ts       # Cal.com webhook type definitions
│   └── utils/
│       └── verify.ts       # Webhook signature verification
└── public/
    └── index.html          # Landing page
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/cal/webhook` | Cal.com webhook receiver |

## License

MIT
