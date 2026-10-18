# Changelog

## 1.4.0

- Added separate calendar number colors for light and dark themes.
- Calendar numbers default to black in the light theme and white in the dark theme.
- Applied custom number colors consistently to plain and schedule-colored days.

## 1.3.0

- Added type-ahead folder suggestions for periodic note locations.
- Replaced template dropdowns with searchable Markdown file path fields.
- Added folded-corner indicators for days with existing daily notes.
- Added configurable indicator color and a 0.5–1.5 px inner black outline.

## 1.2.0

- Added bulk status assignment across an inclusive date range with a configurable day interval.
- Added removal of all status assignments or assignments within a selected date range.
- Made schedule start dates exact while keeping period changes aligned to Mondays.
- Simplified day tooltips to show period names and hours without schedule names.
- Improved calendar spacing, schedule text contrast and status-dot outlines.

## 1.1.1

- Fixed recurring schedule periods switching on the selected weekday instead of Monday.
- Normalized existing and newly created schedule start dates to calendar weeks.
- Clarified the schedule start date field in settings.

## 1.1.0

- Migrated settings to the searchable Obsidian 1.13 settings API.
- Preserved calendar leaf placement when the plugin is disabled or reloaded.
- Switched to Obsidian's bundled Moment instance.
- Fixed promise handling, deprecated button APIs and manifest validation.
- Removed unnecessary CSS `!important` declarations.
- Added GitHub artifact attestations for release assets.

## 1.0.0

- Added daily, weekly and monthly periodic notes with individual templates.
- Added up to four independent recurring schedules with weekly periods.
- Added multi-schedule color sectors in the calendar.
- Added unlimited custom statuses and up to three status dots per day.
- Added schedule history, archiving and backward-compatible data migration.
- Added Russian interface and redesigned settings.
- Removed word-count and task-count features.
