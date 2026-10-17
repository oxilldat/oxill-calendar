import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";

import { openPeriodicNote } from "./notes";
import { moment } from "./moment";
import { OxillCalendarSettingTab } from "./settings";
import {
  createId,
  DEFAULT_SETTINGS,
  type CalendarSchedule,
  type OxillCalendarSettings,
  type PeriodicNoteSettings
} from "./types";
import { CALENDAR_VIEW_TYPE, CalendarView } from "./view";

type LegacySettings = Omit<Partial<OxillCalendarSettings>, "schedules"> & {
  schedules?: LegacySchedule[];
  shouldConfirmBeforeCreate?: boolean;
  weeklyNoteFormat?: string;
  weeklyNoteFolder?: string;
  weeklyNoteTemplate?: string;
};

function mergeNoteSettings(
  defaults: PeriodicNoteSettings,
  value?: Partial<PeriodicNoteSettings>
): PeriodicNoteSettings {
  return { ...defaults, ...(value || {}) };
}

type LegacyPeriod = {
  id: string;
  name: string;
  dayHours?: Record<string, number>;
  color?: string;
  workDays?: number[];
  workHours?: number;
  workColor?: string;
  projectHours?: Record<string, number>;
  projectColor?: string;
};

type LegacySchedule = Omit<CalendarSchedule, "periods"> & {
  kind?: "work" | "project";
  periods: LegacyPeriod[];
};

function migrateDefaultColor(color: string): string {
  if (color.toLowerCase() === "#4f7cff") return "#A8C7FA";
  if (color.toLowerCase() === "#f28c45") return "#F6C7A9";
  return color;
}

function convertPeriods(
  schedule: LegacySchedule,
  source: "work" | "project",
  preserveId = Boolean(schedule.kind)
): CalendarSchedule {
  return {
    id: preserveId ? schedule.id : createId(`schedule-${source}`),
    name: schedule.name,
    startDate: schedule.startDate,
    archivedAt: schedule.archivedAt,
    periods: schedule.periods.map((period) => {
      if (period.dayHours && period.color) {
        return {
          id: period.id,
          name: period.name,
          dayHours: period.dayHours,
          color: migrateDefaultColor(period.color)
        };
      }
      if (source === "project") {
        return {
          id: period.id,
          name: period.name,
          dayHours: period.projectHours ?? {},
          color: period.projectColor ?? "#F6C7A9"
        };
      }
      const hours = Math.max(0, Number(period.workHours) || 0);
      return {
        id: period.id,
        name: period.name,
        dayHours: Object.fromEntries((period.workDays ?? []).map((day) => [String(day), hours])),
        color: period.workColor ?? "#A8C7FA"
      };
    })
  };
}

function migrateSchedules(schedules: LegacySchedule[]): CalendarSchedule[] {
  return schedules.flatMap((schedule) => {
    if (schedule.periods.every((period) => period.dayHours && period.color)) {
      return [convertPeriods(schedule, "work", true)];
    }
    if (schedule.kind) return [convertPeriods(schedule, schedule.kind)];
    return [convertPeriods(schedule, "work"), convertPeriods(schedule, "project")];
  });
}

export default class OxillCalendarPlugin extends Plugin {
  settings: OxillCalendarSettings = structuredClone(DEFAULT_SETTINGS);
  settingTab!: OxillCalendarSettingTab;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      CALENDAR_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new CalendarView(leaf, this)
    );

    this.addRibbonIcon("calendar-days", "Открыть Oxill Calendar", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-calendar-view",
      name: "Открыть календарь",
      callback: () => void this.activateView()
    });
    this.addCommand({
      id: "open-daily-note",
      name: "Открыть дневную заметку",
      callback: () => void openPeriodicNote(this.app, this.settings, "daily", moment(), false)
    });
    this.addCommand({
      id: "open-weekly-note",
      name: "Открыть недельную заметку",
      callback: () => void openPeriodicNote(this.app, this.settings, "weekly", moment(), false)
    });
    this.addCommand({
      id: "open-monthly-note",
      name: "Открыть месячную заметку",
      callback: () => void openPeriodicNote(this.app, this.settings, "monthly", moment(), false)
    });
    this.addCommand({
      id: "reveal-active-note",
      name: "Показать активную заметку в календаре",
      callback: () => {
        const view = this.getCalendarView();
        if (!view) {
          new Notice("Сначала откройте Oxill Calendar");
          return;
        }
        view.revealActiveNote();
      }
    });

    this.settingTab = new OxillCalendarSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.app.workspace.onLayoutReady(() => void this.activateView());
  }

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as LegacySettings | null;
    const legacyWeekly: Partial<PeriodicNoteSettings> = {
      format: raw?.weeklyNoteFormat,
      folder: raw?.weeklyNoteFolder,
      template: raw?.weeklyNoteTemplate
    };
    Object.keys(legacyWeekly).forEach((key) => {
      if (legacyWeekly[key as keyof PeriodicNoteSettings] === undefined) {
        delete legacyWeekly[key as keyof PeriodicNoteSettings];
      }
    });

    this.settings = {
      confirmBeforeCreate:
        raw?.confirmBeforeCreate ?? raw?.shouldConfirmBeforeCreate ?? DEFAULT_SETTINGS.confirmBeforeCreate,
      noteIndicatorColor: typeof raw?.noteIndicatorColor === "string"
        ? raw.noteIndicatorColor
        : DEFAULT_SETTINGS.noteIndicatorColor,
      noteIndicatorBorderWidth: typeof raw?.noteIndicatorBorderWidth === "number"
        ? Math.min(1.5, Math.max(0.5, raw.noteIndicatorBorderWidth))
        : DEFAULT_SETTINGS.noteIndicatorBorderWidth,
      daily: mergeNoteSettings(DEFAULT_SETTINGS.daily, raw?.daily),
      weekly: mergeNoteSettings(DEFAULT_SETTINGS.weekly, raw?.weekly || legacyWeekly),
      monthly: mergeNoteSettings(DEFAULT_SETTINGS.monthly, raw?.monthly),
      schedules: Array.isArray(raw?.schedules)
        ? migrateSchedules(raw.schedules)
        : [],
      statuses: Array.isArray(raw?.statuses)
        ? raw.statuses.map((status) => ({
          ...status,
          color: status.color === "#7c5cff" ? "#C8B6FF" : status.color
        }))
        : [],
      dayStatuses: raw?.dayStatuses && typeof raw.dayStatuses === "object"
        ? Object.fromEntries(Object.entries(raw.dayStatuses).map(([date, ids]) => [
          date,
          Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(0, 3) : []
        ]))
        : {}
    };
    await this.saveData(this.settings);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof CalendarView) leaf.view.refresh();
    });
  }

  private getCalendarView(): CalendarView | null {
    for (const leaf of this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)) {
      if (leaf.view instanceof CalendarView) return leaf.view;
    }
    return null;
  }

  private async activateView(): Promise<void> {
    let leaf: WorkspaceLeaf | null =
      this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
}
