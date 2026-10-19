# Oxill Calendar — Obsidian calendar, schedules and status tracker

English · [Русский](README_RU.md)

**Oxill Calendar** is an Obsidian calendar plugin for daily notes, weekly notes, monthly notes, recurring schedules, shift planning, project planning and day status tracking. It is useful for 5/2 and 2/2 work schedules, rotating shifts, personal projects, workouts, study plans, habits and other recurring routines.

The plugin works locally inside your Obsidian vault. It contains no telemetry and does not send notes or settings to external services.

## Features

- monthly calendar in the Obsidian sidebar;
- daily, weekly and monthly periodic notes;
- optional daily note templates for each weekday;
- configurable Monday or Sunday week start;
- separate folders, filename formats and templates for every note type;
- searchable folder and Markdown template path suggestions;
- customizable folded-corner indicators for days with existing notes;
- separate calendar number colors for light and dark themes;
- up to four independent recurring schedules;
- ordered weekly periods with an individual start date;
- hours for every weekday and a pastel color for every period;
- multiple schedules displayed as colored sectors on the same calendar day;
- schedule archiving that preserves calendar history;
- unlimited custom statuses;
- up to three colored status dots on each day;
- status assignment from the date context menu;
- bulk status assignment across a date range with a configurable interval;
- removal of status assignments from a date range or the entire calendar;
- Russian interface, light and dark themes, desktop and mobile support.

## Use cases

Use Oxill Calendar as an Obsidian shift work calendar, rotating schedule calendar, project calendar, daily status tracker, productivity planner or periodic notes calendar. Separate schedules can represent work, workouts, study and personal projects, while colored statuses can mark cooking, cleaning, training or any completed routine.

## Installation

### Manual installation

1. Download `main.js`, `manifest.json` and `styles.css` from the latest [release](https://github.com/oxilldat/oxill-calendar/releases/latest).
2. Create `<your vault>/.obsidian/plugins/oxill-calendar/`.
3. Copy the three downloaded files into that directory.
4. Restart Obsidian and enable **Oxill Calendar** under **Settings → Community plugins**.

### BRAT installation

Add `oxilldat/oxill-calendar` to BRAT, install the plugin and enable it in Obsidian.

## Quick start

1. Open **Settings → Oxill Calendar**.
2. Configure periodic note folders and templates.
3. Create a schedule, add periods and enter hours for each weekday.
4. Create custom statuses with names and colors.
5. Click a date to open its note or right-click it to assign statuses.

A fresh installation contains no schedules, statuses or user data. Everything is created locally in the settings of the current vault.

## Development

Node.js 24+ and npm are required.

```bash
npm ci
npm run check
npm run build
```

## Credits and license

Oxill Calendar is maintained by [Oxill](https://t.me/oxilldat) and is based on Calendar 1.5.10 by Liam Cain. See [FORK.md](FORK.md) for attribution. The source code is available under the [MIT License](LICENSE).
