import type { Moment } from "moment";

import type { WeekStart } from "./types";

export function startOfWeek(date: Moment, weekStartsOn: WeekStart): Moment {
  const firstDay = weekStartsOn === "sunday" ? 0 : 1;
  const daysSinceStart = (date.day() - firstDay + 7) % 7;
  return date.clone().startOf("day").subtract(daysSinceStart, "days");
}

export function weekNumber(date: Moment, weekStartsOn: WeekStart): number {
  const start = startOfWeek(date, weekStartsOn);
  return (weekStartsOn === "sunday" ? start.add(1, "day") : start).isoWeek();
}

export function dateForIsoWeekday(
  date: Moment,
  isoWeekday: number,
  weekStartsOn: WeekStart
): Moment {
  const start = startOfWeek(date, weekStartsOn);
  const offset = weekStartsOn === "sunday" ? isoWeekday % 7 : isoWeekday - 1;
  return start.add(offset, "days");
}
