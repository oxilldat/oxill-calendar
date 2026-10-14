import type { Moment } from "moment";
import { moment } from "./moment";

import type {
  CalendarSchedule,
  DayScheduleInfo,
  OxillCalendarSettings,
  ScheduleOccurrence
} from "./types";

function containsDate(schedule: CalendarSchedule, date: Moment): boolean {
  const start = moment(schedule.startDate, "YYYY-MM-DD", true).startOf("day");
  if (!start.isValid() || date.isBefore(start, "day")) return false;
  if (!schedule.archivedAt) return true;
  const archivedAt = moment(schedule.archivedAt, "YYYY-MM-DD", true);
  return archivedAt.isValid() && !date.isAfter(archivedAt, "day");
}

function getOccurrence(
  schedule: CalendarSchedule,
  date: Moment
): ScheduleOccurrence | null {
  const cycleStart = moment(schedule.startDate, "YYYY-MM-DD", true).startOf("isoWeek");
  const elapsedWeeks = date.clone().startOf("isoWeek").diff(cycleStart, "weeks");
  const period = schedule.periods[elapsedWeeks % schedule.periods.length];
  const weekday = date.isoWeekday();

  const hours = Math.max(0, Number(period.dayHours[String(weekday)]) || 0);
  return hours > 0 ? { schedule, period, hours } : null;
}

export function getDaySchedule(
  settings: OxillCalendarSettings,
  date: Moment
): DayScheduleInfo | null {
  const occurrences = settings.schedules
    .filter((schedule) => schedule.periods.length > 0 && containsDate(schedule, date))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
    .map((schedule) => getOccurrence(schedule, date))
    .filter((item): item is ScheduleOccurrence => item !== null)
    .slice(0, 4);
  return occurrences.length > 0 ? { occurrences } : null;
}

export function dayScheduleTooltip(info: DayScheduleInfo): string {
  const parts: string[] = [];
  info.occurrences.forEach((occurrence) => {
    parts.push(`${occurrence.period.name}, ${occurrence.hours} ч`);
  });
  return parts.join("\n");
}
