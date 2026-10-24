import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";

import { openPeriodicNote } from "./notes";
import { moment } from "./moment";
import { setInterfaceLanguage, t } from "./i18n";
import { OxillCalendarSettingTab } from "./settings";
import {
  createId,
  DEFAULT_SETTINGS,
  type CalendarSchedule,
  type OxillCalendarSettings,
  type PeriodicNoteSettings,
  type WorkPeriod
} from "./types";
import { CALENDAR_VIEW_TYPE, CalendarView } from "./view";
import { WorkTimerManager } from "./work-timer";
import { WORK_PERIOD_VIEW_TYPE, WorkPeriodView } from "./work-period-view";

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

function migrateWorkPeriod(value: unknown): WorkPeriod | null {
  if (!value || typeof value !== "object") return null;
  const period = value as Partial<WorkPeriod>;
  if (typeof period.startedAt !== "string") return null;
  return {
    id: typeof period.id === "string" ? period.id : createId("work-period"),
    startedAt: period.startedAt,
    endedAt: typeof period.endedAt === "string" ? period.endedAt : null,
    runningSince: typeof period.runningSince === "string" ? period.runningSince : null,
    elapsedMs: typeof period.elapsedMs === "number" && Number.isFinite(period.elapsedMs)
      ? Math.max(0, period.elapsedMs)
      : 0,
    description: typeof period.description === "string" ? period.description : ""
  };
}

export default class OxillCalendarPlugin extends Plugin {
  settings: OxillCalendarSettings = structuredClone(DEFAULT_SETTINGS);
  settingTab!: OxillCalendarSettingTab;
  workTimer!: WorkTimerManager;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      CALENDAR_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new CalendarView(leaf, this)
    );
    this.registerView(
      WORK_PERIOD_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new WorkPeriodView(leaf, this)
    );

    this.workTimer = new WorkTimerManager(this);
    await this.workTimer.restorePaused();

    this.addRibbonIcon("calendar-days", t("Открыть Oxill Calendar", "Open Oxill Calendar"), () => {
      void this.activateView();
    });
    this.addRibbonIcon("timer", t("Рабочие периоды", "Work periods"), () => {
      void this.openWorkPeriodsView();
    });

    this.addCommand({
      id: "open-calendar-view",
      name: t("Открыть календарь", "Open calendar"),
      callback: () => void this.activateView()
    });
    this.addCommand({
      id: "open-daily-note",
      name: t("Открыть дневную заметку", "Open daily note"),
      callback: () => void openPeriodicNote(this.app, this.settings, "daily", moment(), false)
    });
    this.addCommand({
      id: "open-weekly-note",
      name: t("Открыть недельную заметку", "Open weekly note"),
      callback: () => void openPeriodicNote(this.app, this.settings, "weekly", moment(), false)
    });
    this.addCommand({
      id: "open-monthly-note",
      name: t("Открыть месячную заметку", "Open monthly note"),
      callback: () => void openPeriodicNote(this.app, this.settings, "monthly", moment(), false)
    });
    this.addCommand({
      id: "reveal-active-note",
      name: t("Показать активную заметку в календаре", "Reveal active note in calendar"),
      callback: () => {
        const view = this.getCalendarView();
        if (!view) {
          new Notice(t("Сначала откройте Oxill Calendar", "Open Oxill Calendar first"));
          return;
        }
        view.revealActiveNote();
      }
    });
    this.addCommand({
      id: "toggle-work-timer",
      name: t("Запустить или остановить рабочий период", "Start or stop work period"),
      callback: () => {
        if (this.settings.activeWorkPeriod) void this.workTimer.stop();
        else void this.workTimer.start();
      }
    });
    this.addCommand({
      id: "pause-work-timer",
      name: t("Поставить рабочий период на паузу или продолжить", "Pause or resume work period"),
      callback: () => void this.workTimer.togglePause()
    });
    this.addCommand({
      id: "open-work-periods",
      name: t("Открыть рабочие периоды", "Open work periods"),
      callback: () => void this.openWorkPeriodsView()
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
      language: raw?.language === "en" ? "en" : "ru",
      confirmBeforeCreate:
        raw?.confirmBeforeCreate ?? raw?.shouldConfirmBeforeCreate ?? DEFAULT_SETTINGS.confirmBeforeCreate,
      calendarNumberColorLight: typeof raw?.calendarNumberColorLight === "string"
        ? raw.calendarNumberColorLight
        : DEFAULT_SETTINGS.calendarNumberColorLight,
      calendarNumberColorDark: typeof raw?.calendarNumberColorDark === "string"
        ? raw.calendarNumberColorDark
        : DEFAULT_SETTINGS.calendarNumberColorDark,
      weekStartsOn: raw?.weekStartsOn === "sunday" ? "sunday" : "monday",
      dailyWeekdayTemplatesEnabled: raw?.dailyWeekdayTemplatesEnabled === true,
      dailyWeekdayTemplates: raw?.dailyWeekdayTemplates && typeof raw.dailyWeekdayTemplates === "object"
        ? Object.fromEntries(Object.entries(raw.dailyWeekdayTemplates)
          .filter(([weekday, path]) => /^[1-7]$/.test(weekday) && typeof path === "string"))
        : {},
      workTimerEnabled: raw?.workTimerEnabled === true,
      workPeriodReportTemplate: typeof raw?.workPeriodReportTemplate === "string"
        ? raw.workPeriodReportTemplate
        : DEFAULT_SETTINGS.workPeriodReportTemplate,
      activeWorkPeriod: migrateWorkPeriod(raw?.activeWorkPeriod),
      pendingWorkPeriods: Array.isArray(raw?.pendingWorkPeriods)
        ? raw.pendingWorkPeriods
          .map((period) => migrateWorkPeriod(period))
          .filter((period): period is WorkPeriod => period !== null)
        : [],
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
    setInterfaceLanguage(this.settings.language);
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

  refreshWorkPeriodViews(): void {
    this.app.workspace.getLeavesOfType(WORK_PERIOD_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof WorkPeriodView) leaf.view.refresh();
    });
  }

  async openWorkPeriodsView(): Promise<void> {
    let leaf: WorkspaceLeaf | null =
      this.app.workspace.getLeavesOfType(WORK_PERIOD_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(true);
      if (!leaf) return;
      await leaf.setViewState({ type: WORK_PERIOD_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
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
