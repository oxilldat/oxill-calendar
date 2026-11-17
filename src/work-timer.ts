import { Notice, TFile, normalizePath } from "obsidian";

import type OxillCalendarPlugin from "./main";
import { moment } from "./moment";
import { t } from "./i18n";
import { getOrCreatePeriodicNote } from "./notes";
import { createId, type WorkPeriod } from "./types";

const LOG_START = "<!-- oxill-calendar:work-periods:start -->";
const LOG_END = "<!-- oxill-calendar:work-periods:end -->";

export function workPeriodDuration(period: WorkPeriod, now = Date.now()): number {
  const runningMs = period.runningSince
    ? Math.max(0, now - moment(period.runningSince).valueOf())
    : 0;
  return Math.max(0, period.elapsedMs + runningMs);
}

export function workPeriodPausedDuration(period: WorkPeriod, now = Date.now()): number {
  const currentPause = period.pausedSince
    ? Math.max(0, now - moment(period.pausedSince).valueOf())
    : 0;
  return Math.max(0, period.pausedMs + currentPause);
}

export function workPeriodTotalDuration(period: WorkPeriod, now = Date.now()): number {
  return workPeriodDuration(period, now) + workPeriodPausedDuration(period, now);
}

export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} ${t("мин", "min")}`;
  if (minutes === 0) return `${hours} ${t("ч", "h")}`;
  return `${hours} ${t("ч", "h")} ${minutes} ${t("мин", "min")}`;
}

export function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function renderReport(template: string, period: WorkPeriod): string {
  const start = moment(period.startedAt);
  const end = moment(period.endedAt ?? period.startedAt);
  return template
    .replace(/{{start(?::([^}]+))?}}/g, (_match, format?: string) =>
      start.format(format || "HH:mm"))
    .replace(/{{end(?::([^}]+))?}}/g, (_match, format?: string) =>
      end.format(format || "HH:mm"))
    .replace(/{{date(?::([^}]+))?}}/g, (_match, format?: string) =>
      start.format(format || "YYYY-MM-DD"))
    .replaceAll("{{duration}}", formatDuration(period.elapsedMs + period.pausedMs))
    .replaceAll("{{workDuration}}", formatDuration(period.elapsedMs))
    .replaceAll("{{pauseDuration}}", formatDuration(period.pausedMs))
    .replaceAll("{{description}}", period.description.trim());
}

export class WorkTimerManager {
  constructor(private readonly plugin: OxillCalendarPlugin) {
  }

  async restorePaused(): Promise<void> {
    let changed = false;
    this.plugin.settings.activeWorkPeriods.forEach((active) => {
      if (!active.runningSince) return;
      active.elapsedMs = workPeriodDuration(active);
      active.runningSince = null;
      active.pausedSince = moment().toISOString();
      changed = true;
    });
    if (!changed) return;
    await this.plugin.saveSettings();
    this.refresh();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.plugin.settings.workTimerEnabled = enabled;
    if (!enabled) await Promise.all(this.plugin.settings.activeWorkPeriods.map((period) => this.pause(period.id)));
    await this.plugin.saveSettings();
    this.refresh();
  }

  async start(): Promise<void> {
    if (!this.plugin.settings.workTimerEnabled) {
      new Notice(t("Включите учёт рабочих периодов в настройках", "Enable work-period tracking in settings"));
      return;
    }
    if (this.plugin.settings.activeWorkPeriods.length >= 2) {
      new Notice(t("Одновременно можно запустить не больше двух таймеров", "You can run no more than two timers at once"));
      return;
    }
    const now = moment().toISOString();
    this.plugin.settings.activeWorkPeriods.push({
      id: createId("work-period"),
      startedAt: now,
      endedAt: null,
      runningSince: now,
      elapsedMs: 0,
      pausedMs: 0,
      pausedSince: null,
      untimed: false,
      description: ""
    });
    await this.plugin.saveSettings();
    this.refresh();
  }

  async pause(id: string): Promise<void> {
    const active = this.plugin.settings.activeWorkPeriods.find((period) => period.id === id);
    if (!active?.runningSince) return;
    active.elapsedMs = workPeriodDuration(active);
    active.runningSince = null;
    active.pausedSince = moment().toISOString();
    await this.plugin.saveSettings();
    this.refresh();
  }

  async resume(id: string): Promise<void> {
    const active = this.plugin.settings.activeWorkPeriods.find((period) => period.id === id);
    if (!active || active.runningSince || !this.plugin.settings.workTimerEnabled) return;
    active.pausedMs = workPeriodPausedDuration(active);
    active.pausedSince = null;
    active.runningSince = moment().toISOString();
    await this.plugin.saveSettings();
    this.refresh();
  }

  async togglePause(id: string): Promise<void> {
    const active = this.plugin.settings.activeWorkPeriods.find((period) => period.id === id);
    if (!active) return;
    if (active.runningSince) await this.pause(id);
    else await this.resume(id);
  }

  async stop(id: string): Promise<void> {
    const active = this.plugin.settings.activeWorkPeriods.find((period) => period.id === id);
    if (!active) return;
    active.elapsedMs = workPeriodDuration(active);
    active.pausedMs = workPeriodPausedDuration(active);
    active.runningSince = null;
    active.pausedSince = null;
    active.endedAt = moment().toISOString();
    this.plugin.settings.pendingWorkPeriods.push(active);
    this.plugin.settings.activeWorkPeriods = this.plugin.settings.activeWorkPeriods
      .filter((period) => period.id !== id);
    await this.plugin.saveSettings();
    this.refresh();
    await this.plugin.openWorkPeriodsView();
  }

  async createWithoutTimer(): Promise<string | null> {
    if (!this.plugin.settings.workTimerEnabled) {
      new Notice(t("Включите учёт рабочих периодов в настройках", "Enable work-period tracking in settings"));
      return null;
    }
    const now = moment().toISOString();
    const id = createId("work-period");
    this.plugin.settings.pendingWorkPeriods.push({
      id, startedAt: now, endedAt: now, runningSince: null,
      elapsedMs: 0, pausedMs: 0, pausedSince: null, untimed: true, description: ""
    });
    await this.plugin.saveSettings();
    this.refresh();
    return id;
  }

  async updateDescription(id: string, description: string): Promise<void> {
    const active = this.plugin.settings.activeWorkPeriods.find((period) => period.id === id);
    if (active) active.description = description;
    const pending = this.plugin.settings.pendingWorkPeriods.find((period) => period.id === id);
    if (pending) pending.description = description;
    await this.plugin.saveSettings();
  }

  async deletePeriod(id: string): Promise<void> {
    this.plugin.settings.activeWorkPeriods = this.plugin.settings.activeWorkPeriods
      .filter((period) => period.id !== id);
    this.plugin.settings.pendingWorkPeriods = this.plugin.settings.pendingWorkPeriods
      .filter((period) => period.id !== id);
    await this.plugin.saveSettings();
    this.refresh();
  }

  async savePeriod(id: string): Promise<void> {
    const period = this.plugin.settings.pendingWorkPeriods.find((item) => item.id === id);
    if (!period) return;
    if (!period.description.trim()) {
      new Notice(t("Опишите, чем вы занимались", "Describe what you worked on"));
      return;
    }
    try {
      const date = moment(period.startedAt);
      const template = await this.loadReportTemplate(period);
      const report = renderReport(template, period).trim();
      const file = await getOrCreatePeriodicNote(this.plugin.app, this.plugin.settings, "daily", date);
      await this.plugin.app.vault.process(file, (content) => {
        if (content.includes(LOG_START) && content.includes(LOG_END)) {
          return content.replace(LOG_END, `${report}\n${LOG_END}`);
        }
        const prefix = content.trimEnd();
        const section = `${LOG_START}\n## ${t("Рабочие периоды", "Work periods")}\n\n${report}\n${LOG_END}`;
        return prefix ? `${prefix}\n\n${section}\n` : `${section}\n`;
      });
      this.plugin.settings.pendingWorkPeriods = this.plugin.settings.pendingWorkPeriods
        .filter((item) => item.id !== id);
      await this.plugin.saveSettings();
      this.refresh();
      new Notice(t("Рабочий период записан в дневную заметку", "Work period saved to the daily note"));
    } catch (error) {
      new Notice(error instanceof Error ? error.message : t("Не удалось записать рабочий период", "Could not save the work period"));
    }
  }

  private async loadReportTemplate(period: WorkPeriod): Promise<string> {
    const templatePath = (period.untimed
      ? this.plugin.settings.untimedWorkPeriodReportTemplateFile
      : this.plugin.settings.workPeriodReportTemplateFile).trim();
    if (!templatePath) {
      return period.untimed ? "- {{description}}" : this.plugin.settings.workPeriodReportTemplate;
    }

    const templateFile = this.plugin.app.vault.getAbstractFileByPath(normalizePath(templatePath));
    if (!(templateFile instanceof TFile)) {
      throw new Error(t(
        `Шаблон отчёта «${templatePath}» не найден`,
        `Report template “${templatePath}” was not found`
      ));
    }

    const content = await this.plugin.app.vault.cachedRead(templateFile);
    if (!content.trim()) {
      throw new Error(t("Файл шаблона отчёта пуст", "The report template file is empty"));
    }
    return content;
  }

  refresh(): void {
    this.plugin.refreshWorkPeriodViews();
  }
}
