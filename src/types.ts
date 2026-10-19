export type NoteKind = "daily" | "weekly" | "monthly";
export type WeekStart = "monday" | "sunday";

export interface PeriodicNoteSettings {
  folder: string;
  format: string;
  template: string;
}

export interface SchedulePeriod {
  id: string;
  name: string;
  dayHours: Record<string, number>;
  color: string;
}

export interface CalendarSchedule {
  id: string;
  name: string;
  startDate: string;
  archivedAt: string | null;
  periods: SchedulePeriod[];
}

export interface CalendarStatus {
  id: string;
  name: string;
  color: string;
}

export interface OxillCalendarSettings {
  confirmBeforeCreate: boolean;
  calendarNumberColorLight: string;
  calendarNumberColorDark: string;
  weekStartsOn: WeekStart;
  dailyWeekdayTemplatesEnabled: boolean;
  dailyWeekdayTemplates: Record<string, string>;
  noteIndicatorColor: string;
  noteIndicatorBorderWidth: number;
  daily: PeriodicNoteSettings;
  weekly: PeriodicNoteSettings;
  monthly: PeriodicNoteSettings;
  schedules: CalendarSchedule[];
  statuses: CalendarStatus[];
  dayStatuses: Record<string, string[]>;
}

export interface ScheduleOccurrence {
  schedule: CalendarSchedule;
  period: SchedulePeriod;
  hours: number;
}

export interface DayScheduleInfo {
  occurrences: ScheduleOccurrence[];
}

export const DEFAULT_SETTINGS: OxillCalendarSettings = {
  confirmBeforeCreate: true,
  calendarNumberColorLight: "#000000",
  calendarNumberColorDark: "#FFFFFF",
  weekStartsOn: "monday",
  dailyWeekdayTemplatesEnabled: false,
  dailyWeekdayTemplates: {},
  noteIndicatorColor: "#A8C7FA",
  noteIndicatorBorderWidth: 1,
  daily: {
    folder: "Ежедневные заметки",
    format: "YYYY-MM-DD",
    template: ""
  },
  weekly: {
    folder: "Недельные заметки",
    format: "GGGG-[W]WW",
    template: ""
  },
  monthly: {
    folder: "Месячные заметки",
    format: "YYYY-MM",
    template: ""
  },
  schedules: [],
  statuses: [],
  dayStatuses: {}
};

const PASTEL_COLORS = [
  "#A8C7FA",
  "#C8B6FF",
  "#F6C7A9",
  "#A9DCC9",
  "#F4B8C4",
  "#F3DEA2",
  "#B9D7EA",
  "#D4B8E8"
];

function randomPastelColor(): string {
  return PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createStatus(): CalendarStatus {
  return {
    id: createId("status"),
    name: "Новый статус",
    color: randomPastelColor()
  };
}

export function createPeriod(name = "Новый период"): SchedulePeriod {
  return {
    id: createId("period"),
    name,
    dayHours: { "1": 8, "2": 8, "3": 8, "4": 8, "5": 8 },
    color: randomPastelColor()
  };
}

export function createSchedule(startDate: string): CalendarSchedule {
  return {
    id: createId("schedule"),
    name: "Новый график",
    startDate,
    archivedAt: null,
    periods: [createPeriod()]
  };
}
