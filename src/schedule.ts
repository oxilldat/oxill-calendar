import type { Moment } from "moment";
import { moment } from "./moment";
import { t } from "./i18n";

import type {
  CalendarSchedule,
  DayScheduleInfo,
  OxillCalendarSettings,
  ScheduleOccurrence
} from "./types";
import { startOfWeek } from "./week";

function containsDate(schedule: CalendarSchedule, date: Moment): boolean {
  const start = moment(schedule.startDate, "YYYY-MM-DD", true).startOf("day");
  if (!start.isValid() || date.isBefore(start, "day")) return false;
  if (!schedule.archivedAt) return true;
  const archivedAt = moment(schedule.archivedAt, "YYYY-MM-DD", true);
  return archivedAt.isValid() && !date.isAfter(archivedAt, "day");
}

export function getSchedulesForDate(
  settings: OxillCalendarSettings,
  date: Moment
): CalendarSchedule[] {
  return settings.schedules
    .filter((schedule) => schedule.periods.length > 0 && containsDate(schedule, date))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

export function applyScheduleOverrideRange(
  settings: OxillCalendarSettings,
  schedule: CalendarSchedule,
  start: Moment,
  end: Moment,
  periodId: string | null | undefined
): number {
  let changed = 0;
  for (const date = start.clone(); !date.isAfter(end, "day"); date.add(1, "day")) {
    if (!containsDate(schedule, date)) continue;
    const dateKey = date.format("YYYY-MM-DD");
    const overrides = { ...(settings.dayScheduleOverrides[dateKey] ?? {}) };
    if (periodId === undefined) delete overrides[schedule.id];
    else overrides[schedule.id] = periodId;

    if (Object.keys(overrides).length > 0) {
      settings.dayScheduleOverrides[dateKey] = overrides;
    } else {
      delete settings.dayScheduleOverrides[dateKey];
    }
    changed += 1;
  }
  return changed;
}

function getOccurrence(
  schedule: CalendarSchedule,
  date: Moment,
  settings: OxillCalendarSettings
): ScheduleOccurrence | null {
  const cycleStart = startOfWeek(
    moment(schedule.startDate, "YYYY-MM-DD", true),
    settings.weekStartsOn
  );
  const elapsedWeeks = startOfWeek(date, settings.weekStartsOn).diff(cycleStart, "weeks");
  const dateOverrides = settings.dayScheduleOverrides[date.format("YYYY-MM-DD")];
  const hasOverride = Boolean(dateOverrides)
    && Object.prototype.hasOwnProperty.call(dateOverrides, schedule.id);
  const overridePeriodId = hasOverride ? dateOverrides[schedule.id] : undefined;
  if (overridePeriodId === null) return null;
  const automaticPeriod = schedule.periods[elapsedWeeks % schedule.periods.length];
  const period = typeof overridePeriodId === "string"
    ? schedule.periods.find((item) => item.id === overridePeriodId) ?? automaticPeriod
    : automaticPeriod;
  const weekday = date.isoWeekday();

  const hours = Math.max(0, Number(period.dayHours[String(weekday)]) || 0);
  return hours > 0 ? { schedule, period, hours } : null;
}

export function getDaySchedule(
  settings: OxillCalendarSettings,
  date: Moment
): DayScheduleInfo | null {
  const occurrences = getSchedulesForDate(settings, date)
    .map((schedule) => getOccurrence(schedule, date, settings))
    .filter((item): item is ScheduleOccurrence => item !== null)
    .slice(0, 4);
  return occurrences.length > 0 ? { occurrences } : null;
}

export function dayScheduleTooltip(info: DayScheduleInfo): string {
  const parts: string[] = [];
  info.occurrences.forEach((occurrence) => {
    parts.push(`${occurrence.period.name}, ${occurrence.hours} ${t("ч", "h")}`);
  });
  return parts.join("\n");
}
