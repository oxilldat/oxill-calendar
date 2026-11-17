import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";

import type OxillCalendarPlugin from "./main";
import { moment } from "./moment";
import { t } from "./i18n";
import type { WorkPeriod } from "./types";
import { formatClock, formatDuration, workPeriodDuration, workPeriodPausedDuration } from "./work-timer";

export const WORK_PERIOD_VIEW_TYPE = "oxill-calendar-work-periods";

export class WorkPeriodView extends ItemView {
  private saveTimeout: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: OxillCalendarPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return WORK_PERIOD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("Рабочие периоды", "Work periods");
  }

  getIcon(): string {
    return "timer";
  }

  async onOpen(): Promise<void> {
    this.render();
    this.registerInterval(window.setInterval(() => this.updateDurations(), 1000));
  }

  async onClose(): Promise<void> {
    if (this.saveTimeout !== null) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
      void this.plugin.saveSettings();
    }
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("oxill-calendar-work-period-view");

    const launcher = container.createDiv({ cls: "oxill-calendar-work-period-launcher" });
    const start = launcher.createEl("button", {
      cls: "clickable-icon",
      attr: { type: "button", "aria-label": t("Старт", "Start"), title: t("Старт", "Start") }
    });
    setIcon(start, "play");
    start.addEventListener("click", () => void this.plugin.workTimer.start());
    const manual = launcher.createEl("button", {
      cls: "clickable-icon",
      attr: {
        type: "button",
        "aria-label": t("Старт без таймера", "Start without timer"),
        title: t("Старт без таймера", "Start without timer")
      }
    });
    setIcon(manual, "square-pen");
    manual.addEventListener("click", async () => {
      const id = await this.plugin.workTimer.createWithoutTimer();
      window.requestAnimationFrame(() => {
        if (!id) return;
        this.contentEl.querySelector<HTMLTextAreaElement>(`[data-period-id="${id}"] .oxill-calendar-work-period-description`)?.focus();
      });
    });

    if (!this.plugin.settings.workTimerEnabled) {
      container.createDiv({
        cls: "oxill-calendar-empty-state",
        text: t("Учёт рабочих периодов выключен в настройках.", "Work-period tracking is disabled in settings.")
      });
    }

    const active = this.plugin.settings.activeWorkPeriods;
    if (active.length > 0) {
      const section = container.createDiv({ cls: "oxill-calendar-work-period-section" });
      section.createDiv({ cls: "oxill-calendar-work-period-section-title", text: t("Текущий период", "Current period") });
      active.forEach((period) => this.renderPeriod(section, period, true));
    }

    const pendingSection = container.createDiv({ cls: "oxill-calendar-work-period-section" });
    const pendingTitle = pendingSection.createDiv({
      cls: "oxill-calendar-work-period-section-title"
    });
    pendingTitle.createSpan({ text: t("Ожидают отчёта", "Awaiting report") });
    pendingTitle.createSpan({
      cls: "oxill-calendar-work-period-count",
      text: String(this.plugin.settings.pendingWorkPeriods.length)
    });
    if (this.plugin.settings.pendingWorkPeriods.length === 0) {
      pendingSection.createDiv({
        cls: "oxill-calendar-empty-state",
        text: t("Незаполненных периодов нет.", "There are no unfinished reports.")
      });
    } else {
      [...this.plugin.settings.pendingWorkPeriods].reverse().forEach((period) => {
        this.renderPeriod(pendingSection, period, false);
      });
    }
  }

  private renderPeriod(parent: HTMLElement, period: WorkPeriod, active: boolean): void {
    const card = parent.createDiv({
      cls: "oxill-calendar-work-period-card",
      attr: { "data-period-id": period.id }
    });
    const header = card.createDiv({ cls: "oxill-calendar-work-period-card-header" });
    const start = moment(period.startedAt);
    const end = period.endedAt ? moment(period.endedAt) : null;
    header.createDiv({
      cls: "oxill-calendar-work-period-time",
      text: end
        ? `${start.format(t("DD.MM.YYYY", "MM/DD/YYYY"))} · ${start.format("HH:mm")}–${end.format("HH:mm")}`
        : `${start.format(t("DD.MM.YYYY", "MM/DD/YYYY"))} · ${t("с", "from")} ${start.format("HH:mm")}`
    });
    if (active) {
      const paused = !period.runningSince;
      header.createDiv({
        cls: `oxill-calendar-work-period-duration ${paused ? "is-pause" : "is-work"}`,
        text: formatClock(paused ? workPeriodPausedDuration(period) : workPeriodDuration(period)),
        attr: {
          title: paused ? t("Время текущей и прошлых пауз", "Current and previous pause time") : t("Чистое время работы", "Net work time"),
          "aria-label": paused ? t("Время пауз", "Pause time") : t("Время работы", "Work time")
        }
      });
    } else {
      header.createDiv({
        cls: "oxill-calendar-work-period-duration",
        text: formatDuration(period.elapsedMs + period.pausedMs)
      });
    }

    const textarea = card.createEl("textarea", {
      cls: "oxill-calendar-work-period-description",
      attr: { placeholder: t("Чем вы занимались?", "What did you work on?"), rows: "3" }
    });
    textarea.value = period.description;
    textarea.addEventListener("input", () => {
      period.description = textarea.value;
      this.scheduleSave();
    });

    const actions = card.createDiv({ cls: "oxill-calendar-work-period-actions" });
    if (active) {
      const pause = actions.createEl("button", {
        attr: { type: "button", "aria-label": period.runningSince ? t("Пауза", "Pause") : t("Продолжить", "Resume") }
      });
      setIcon(pause, period.runningSince ? "pause" : "play");
      pause.createSpan({ text: period.runningSince ? t("Пауза", "Pause") : t("Продолжить", "Resume") });
      pause.addEventListener("click", () => void this.plugin.workTimer.togglePause(period.id));
      actions.createEl("button", { text: t("Стоп", "Stop") }).addEventListener("click", () => {
        void this.plugin.workTimer.stop(period.id);
      });
    } else {
      const save = actions.createEl("button", { cls: "mod-cta oxill-calendar-work-period-save" });
      setIcon(save, "check");
      save.createSpan({ text: t("Сохранить", "Save") });
      save.addEventListener("click", () => {
        void this.plugin.workTimer.savePeriod(period.id);
      });
    }
    const remove = actions.createEl("button", {
      cls: "clickable-icon oxill-calendar-work-period-remove",
      attr: { type: "button", "aria-label": t("Удалить период", "Delete period") }
    });
    setIcon(remove, "trash-2");
    remove.addEventListener("click", () => {
      void this.plugin.workTimer.deletePeriod(period.id);
      new Notice(t("Рабочий период удалён", "Work period deleted"));
    });
  }

  private scheduleSave(): void {
    if (this.saveTimeout !== null) window.clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      this.saveTimeout = null;
      void this.plugin.saveSettings();
    }, 500);
  }

  private updateDurations(): void {
    this.plugin.settings.activeWorkPeriods.forEach((active) => {
      const card = this.contentEl.querySelector<HTMLElement>(`[data-period-id="${active.id}"]`);
      card?.querySelector<HTMLElement>(".oxill-calendar-work-period-duration")?.setText(
        formatClock(active.runningSince ? workPeriodDuration(active) : workPeriodPausedDuration(active))
      );
    });
  }
}
