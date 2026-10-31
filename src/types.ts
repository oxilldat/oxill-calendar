export type NoteKind = "daily" | "weekly" | "monthly";
export type WeekStart = "monday" | "sunday";
export type InterfaceLanguage = "ru" | "en";

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

export interface WorkPeriod {
  id: string;
  startedAt: string;
  endedAt: string | null;
  runningSince: string | null;
  elapsedMs: number;
  description: string;
}

export interface OxillCalendarSettings {
  language: InterfaceLanguage;
  confirmBeforeCreate: boolean;
  calendarNumberColorLight: string;
  calendarNumberColorDark: string;
  weekStartsOn: WeekStart;
  dailyWeekdayTemplatesEnabled: boolean;
  dailyWeekdayTemplates: Record<string, string>;
  workTimerEnabled: boolean;
  workPeriodReportTemplateFile: string;
  workPeriodReportTemplate: string;
  activeWorkPeriod: WorkPeriod | null;
  pendingWorkPeriods: WorkPeriod[];
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
  language: "ru",
  confirmBeforeCreate: true,
  calendarNumberColorLight: "#000000",
  calendarNumberColorDark: "#FFFFFF",
  weekStartsOn: "monday",
  dailyWeekdayTemplatesEnabled: false,
  dailyWeekdayTemplates: {},
  workTimerEnabled: false,
  workPeriodReportTemplateFile: "",
  workPeriodReportTemplate: "- {{start}}–{{end}} · {{duration}} — {{description}}",
  activeWorkPeriod: null,
  pendingWorkPeriods: [],
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

export function createStatus(name = "Новый статус"): CalendarStatus {
  return {
    id: createId("status"),
    name,
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

export function createSchedule(
  startDate: string,
  name = "Новый график",
  periodName = "Новый период"
): CalendarSchedule {
  return {
    id: createId("schedule"),
    name,
    startDate,
    archivedAt: null,
    periods: [createPeriod(periodName)]
  };
}
