# Changelog

## 1.10.5

- Replaced the ISO week-year token with the Obsidian-style `YYYY-[W]WW` weekly filename format.

## 1.10.4

- Unified daily, weekly and monthly note creation around fixed filename formats shared with the settings descriptions.
- Added clear filename examples for every periodic note type in settings.
- Replaced the wide pause and resume action with a compact file-manager-style icon button.

## 1.10.3

- Corrected weekly and monthly filename descriptions in settings.
- Restored `YYYY-MM` filenames for newly created monthly notes without modifying existing files.

## 1.10.2

- Removed automatic renaming of existing notes. Weekly filename correction now applies only when a new note is created.

## 1.10.1

- Fixed weekly note filenames by restoring the ISO week format `GGGG-[W]WW`.

## 1.10.0

- Added up to two independent simultaneous work timers in the Work periods sidebar.
- Added untimed work entries with a separate searchable Markdown report template and basic-template creator.
- Added independent work and pause accounting with state-specific blue and red timer displays.
- Added `{{workDuration}}` and `{{pauseDuration}}` report variables while `{{duration}}` includes the complete session.
- Replaced the status-bar timer with compact file-manager-style controls in the Work periods view.
- Migrated existing active timers and legacy basic templates without overwriting customized template files.

## 1.9.0

- Reorganized settings by feature and added compact segmented controls, live visual previews, conditional groups and an inline schedule archive.
- Added folded-corner, overline and underline styles for the created-note indicator.
- Calendar notes now always use `YYYY-MM-DD` filenames without automatic year subfolders.
- Added an optional daily-note connector that resolves dates from a configurable property or a `YYYY-MM-DD` filename.
- Added context-menu actions to change a schedule period or disable a schedule over a date range while preserving each period's weekday pattern.

## 1.8.3

- Fixed schedule outlines being hidden by the base calendar-day border style.

## 1.8.2

- Fixed the settings page jumping to the top after selecting a suggested folder or template file.

## 1.8.1

- Fixed Obsidian automated-review errors and warnings for styles, async callbacks, deprecated slider APIs and broad CSS selectors.

## 1.8.0

- Reorganized all settings into focused collapsible sections that are closed by default.
- Added optional hiding of adjacent-month dates.
- Added outline and full-fill display modes for schedule periods.
- Added a toggle for black status-dot outlines.
- Added per-day schedule period overrides from the calendar context menu.

## 1.7.1

- Fixed duplicate calendar panes appearing after the plugin is updated or reloaded.

## 1.7.0

- Added a `+` button that creates and selects a basic work-period report template in the vault root.
- Replaced the inline work-period report template with a searchable Markdown template file selector.
- Added an information dialog describing all supported `{{variable}}` constructions and date/time formats.
- Preserved the previous inline report template as a backward-compatible fallback until a file is selected.

## 1.6.1

- Removed the shared background card from the settings page while preserving individual collapsible section cards.
- Simplified the top settings area to native Obsidian rows without an extra heading or background.
- Listed Oxill as the plugin author and moved the original Calendar attribution below the contact card.

## 1.6.0

- Added a Russian/English interface language selector.
- Added an optional persistent work-period timer with start, pause and stop controls.
- Added a sidebar inbox where active and completed periods can be described before saving.
- Added customizable report templates with date, time, duration and description placeholders.
- Added work-period reports to a dedicated footer in the matching daily note.
- Active timers are restored in a paused state after Obsidian restarts.

## 1.5.0

- Added optional daily note templates for each weekday with fallback to the default template.
- Added Monday or Sunday as the configurable first day of the week.
- Applied the selected week start to the calendar, weekly notes and schedule period changes.

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
