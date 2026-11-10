import type { Moment } from "moment";
import {
  ItemView,
  Menu,
  Modal,
  Notice,
  TFile,
  WorkspaceLeaf,
  normalizePath
} from "obsidian";

import type OxillCalendarPlugin from "./main";
import { moment } from "./moment";
import { getInterfaceLocale, t } from "./i18n";
import { getConnectedDailyNotes, getNotePath, openPeriodicNote } from "./notes";
import {
  applyScheduleOverrideRange,
  dayScheduleTooltip,
  getDaySchedule,
  getSchedulesForDate
} from "./schedule";
import type { CalendarSchedule, NoteKind } from "./types";
import { startOfWeek, weekNumber } from "./week";

export const CALENDAR_VIEW_TYPE = "oxill-calendar-view";
const MONDAY_FIRST_WEEKDAYS_RU = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
const SUNDAY_FIRST_WEEKDAYS_RU = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MONDAY_FIRST_WEEKDAYS_EN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const SUNDAY_FIRST_WEEKDAYS_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function shortMonth(date: Moment): string {
  return new Intl.DateTimeFormat(getInterfaceLocale(), { month: "short" })
    .format(date.toDate())
    .replace(".", "")
    .toUpperCase();
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.substring(0, index);
}

class ScheduleRangeModal extends Modal {
  private startDate: string;
  private endDate: string;
  private periodId: string | null | undefined;

  constructor(
    private readonly plugin: OxillCalendarPlugin,
    private readonly schedule: CalendarSchedule,
    dateKey: string,
    private readonly mode: "change" | "disable"
  ) {
    super(plugin.app);
    this.startDate = dateKey;
    this.endDate = dateKey;
    this.periodId = mode === "disable" ? null : schedule.periods[0]?.id;
  }

  onOpen(): void {
    this.modalEl.addClass("oxill-calendar-range-modal");
    this.titleEl.setText(this.mode === "disable"
      ? t("Отключить график на диапазон", "Disable schedule over a range")
      : t("Изменить график на диапазоне", "Change schedule over a range"));
    const summary = this.contentEl.createDiv({ cls: "oxill-calendar-range-summary" });
    summary.createDiv({
      cls: "oxill-calendar-range-schedule",
      text: this.schedule.name
    });
    summary.createDiv({
      cls: "oxill-calendar-range-description",
      text: this.mode === "disable"
        ? t(
          "График не будет отображаться в выбранные даты.",
          "The schedule will not appear on the selected dates."
        )
        : t(
          "Выходные выбранного периода останутся выходными.",
          "Days off in the selected period will remain days off."
        )
    });

    const form = this.contentEl.createDiv({ cls: "oxill-calendar-range-form" });
    if (this.mode === "change") {
      const periodField = form.createDiv({ cls: "oxill-calendar-range-field is-period" });
      periodField.createEl("label", { text: t("Период", "Period") });
      const select = periodField.createEl("select", { cls: "dropdown" });
      select.createEl("option", {
        text: t("По исходному графику", "Original schedule"),
        attr: { value: "automatic" }
      });
      this.schedule.periods.forEach((period) => {
        select.createEl("option", {
          text: period.name,
          attr: { value: period.id }
        });
      });
      select.value = typeof this.periodId === "string" ? this.periodId : "automatic";
      select.addEventListener("change", () => {
        this.periodId = select.value === "automatic" ? undefined : select.value;
      });
    }

    const dates = form.createDiv({ cls: "oxill-calendar-range-dates" });
    this.addDateField(dates, t("С даты", "From"), this.startDate, (value) => {
      this.startDate = value;
    });
    this.addDateField(dates, t("По дату", "To"), this.endDate, (value) => {
      this.endDate = value;
    });

    const footer = this.modalEl.createDiv({ cls: "oxill-calendar-modal-buttons oxill-calendar-range-actions" });
    footer.createEl("button", { text: t("Отмена", "Cancel") })
      .addEventListener("click", () => this.close());
    const applyButton = footer.createEl("button", {
      cls: this.mode === "disable" ? "mod-warning" : "mod-cta",
      text: this.mode === "disable" ? t("Отключить", "Disable") : t("Применить", "Apply")
    });
    applyButton.addEventListener("click", () => void this.apply());
  }

  private addDateField(
    parent: HTMLElement,
    name: string,
    value: string,
    onChange: (value: string) => void
  ): void {
    const field = parent.createDiv({ cls: "oxill-calendar-range-field" });
    field.createEl("label", { text: name });
    const input = field.createEl("input", { type: "date", value });
    input.addEventListener("change", () => onChange(input.value));
  }

  private async apply(): Promise<void> {
    const start = moment(this.startDate, "YYYY-MM-DD", true).startOf("day");
    const end = moment(this.endDate, "YYYY-MM-DD", true).startOf("day");
    if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) {
      new Notice(t("Укажите корректный диапазон дат", "Enter a valid date range"));
      return;
    }
    if (end.diff(start, "days") >= 10_000) {
      new Notice(t("Диапазон слишком большой: максимум 10 000 дней", "The range is too large: 10,000 days maximum"));
      return;
    }

    const changed = applyScheduleOverrideRange(
      this.plugin.settings,
      this.schedule,
      start,
      end,
      this.periodId
    );
    await this.plugin.saveSettings();
    this.close();
    new Notice(changed > 0
      ? t(`Изменено дней: ${changed}`, `Days changed: ${changed}`)
      : t("В выбранном диапазоне график не действует", "The schedule is not active in the selected range"));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class CalendarView extends ItemView {
  private displayedMonth = moment().startOf("month");

  constructor(leaf: WorkspaceLeaf, private readonly plugin: OxillCalendarPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Oxill Calendar";
  }

  getIcon(): string {
    return "calendar-days";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.vault.on("create", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.render()));
    this.registerInterval(window.setInterval(() => this.render(), 60_000));
    this.render();
  }

  refresh(): void {
    this.render();
  }

  revealActiveNote(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;

    for (const [date, files] of getConnectedDailyNotes(this.app, this.plugin.settings)) {
      if (!files.some((item) => item.path === file.path)) continue;
      this.displayedMonth = moment(date, "YYYY-MM-DD", true).startOf("month");
      this.render();
      return;
    }

    const candidates: NoteKind[] = ["daily", "weekly", "monthly"];
    for (const kind of candidates) {
      const config = this.plugin.settings[kind];
      if (normalizePath(config.folder) !== normalizePath(parentPath(file.path))) continue;
      const parsed = moment(file.basename, "YYYY-MM-DD", true);
      if (!parsed.isValid()) continue;
      this.displayedMonth = parsed.startOf("month");
      this.render();
      return;
    }
  }

  private async openNote(kind: NoteKind, date: Moment, event: MouseEvent): Promise<void> {
    await openPeriodicNote(
      this.app,
      this.plugin.settings,
      kind,
      date,
      event.ctrlKey || event.metaKey
    );
  }

  private showNoteMenu(kind: NoteKind, date: Moment, event: MouseEvent): void {
    const path = getNotePath(this.plugin.settings, kind, date);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;

    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle(t("Открыть", "Open")).setIcon("file-text").onClick(() => {
        void openPeriodicNote(this.app, this.plugin.settings, kind, date, false);
      })
    );
    menu.addItem((item) =>
      item.setTitle(t("Удалить", "Delete")).setIcon("trash-2").onClick(() => {
        void this.app.fileManager.trashFile(file);
      })
    );
    menu.showAtMouseEvent(event);
  }

  private showDayMenu(date: Moment, event: MouseEvent): void {
    const menu = new Menu();
    const dateKey = date.format("YYYY-MM-DD");
    const selected = this.plugin.settings.dayStatuses[dateKey] ?? [];

    if (this.plugin.settings.statuses.length === 0) {
      menu.addItem((item) => item
        .setTitle(t("Статусы не настроены", "No statuses configured"))
        .setIcon("circle-dot")
        .setDisabled(true));
    } else {
      this.plugin.settings.statuses.forEach((status) => {
        const isSelected = selected.includes(status.id);
        menu.addItem((item) => item
          .setTitle(status.name)
          .setIcon("circle")
          .setChecked(isSelected)
          .onClick(() => {
            const current = this.plugin.settings.dayStatuses[dateKey] ?? [];
            if (current.includes(status.id)) {
              const next = current.filter((id) => id !== status.id);
              if (next.length > 0) this.plugin.settings.dayStatuses[dateKey] = next;
              else delete this.plugin.settings.dayStatuses[dateKey];
            } else {
              if (current.length >= 3) {
                new Notice(t("На один день можно назначить не более трёх статусов", "You can assign no more than three statuses per day"));
                return;
              }
              this.plugin.settings.dayStatuses[dateKey] = [...current, status.id];
            }
            void this.plugin.saveSettings();
          }));
      });
    }

    const schedules = getSchedulesForDate(this.plugin.settings, date);
    if (schedules.length > 0) {
      menu.addSeparator();
      const overrides = this.plugin.settings.dayScheduleOverrides[dateKey] ?? {};
      menu.addItem((item) => item
        .setTitle(t("Отключить графики на этот день", "Disable schedules for this day"))
        .setIcon("circle-off")
        .setChecked(schedules.every((schedule) => overrides[schedule.id] === null))
        .onClick(() => {
          this.plugin.settings.dayScheduleOverrides[dateKey] = Object.fromEntries(
            schedules.map((schedule) => [schedule.id, null])
          );
          void this.plugin.saveSettings();
        }));
      schedules.forEach((schedule) => {
        menu.addItem((item) => {
          item.setTitle(schedule.name).setIcon("calendar-range");
          // Obsidian supports native submenus at runtime, but the method is not
          // included in the public typings yet. Keep a second-menu fallback.
          const submenu = (item as unknown as { setSubmenu?: () => Menu }).setSubmenu?.();
          if (submenu) this.populatePeriodMenu(submenu, schedule, dateKey);
          else item.onClick(() => this.showPeriodMenu(schedule, dateKey, event));
        });
      });
    }

    menu.addSeparator();
    const path = getNotePath(this.plugin.settings, "daily", date);
    const ownFile = this.app.vault.getAbstractFileByPath(path);
    const connectedFiles = getConnectedDailyNotes(this.app, this.plugin.settings).get(dateKey) ?? [];
    if (ownFile instanceof TFile) {
      menu.addItem((item) => item
        .setTitle(t("Открыть заметку календаря", "Open calendar note"))
        .setIcon("file-text")
        .onClick(() => void openPeriodicNote(this.app, this.plugin.settings, "daily", date, false)));
      menu.addItem((item) => item
        .setTitle(t("Удалить заметку календаря", "Delete calendar note"))
        .setIcon("trash-2")
        .onClick(() => void this.app.fileManager.trashFile(ownFile)));
    } else if (connectedFiles.length === 0) {
      menu.addItem((item) => item
        .setTitle(t("Создать заметку календаря", "Create calendar note"))
        .setIcon("file-plus-2")
        .onClick(() => void openPeriodicNote(this.app, this.plugin.settings, "daily", date, false)));
    }
    connectedFiles
      .filter((file) => !(ownFile instanceof TFile) || file.path !== ownFile.path)
      .forEach((file) => {
        menu.addItem((item) => item
          .setTitle(t(`Открыть: ${file.basename}`, `Open: ${file.basename}`))
          .setIcon("notebook-tabs")
          .onClick(() => {
            const leaf = this.app.workspace.getLeaf(false);
            void leaf.openFile(file, { active: true });
          }));
      });
    menu.showAtMouseEvent(event);
  }

  private showPeriodMenu(schedule: CalendarSchedule, dateKey: string, event: MouseEvent): void {
    const menu = new Menu();
    this.populatePeriodMenu(menu, schedule, dateKey);
    menu.showAtMouseEvent(event);
  }

  private populatePeriodMenu(menu: Menu, schedule: CalendarSchedule, dateKey: string): void {
    const overrides = this.plugin.settings.dayScheduleOverrides[dateKey];
    const hasOverride = Boolean(overrides)
      && Object.prototype.hasOwnProperty.call(overrides, schedule.id);
    const selectedPeriodId = hasOverride ? overrides[schedule.id] : undefined;

    menu.addItem((item) => item
      .setTitle(t("По исходному графику", "Original schedule"))
      .setIcon("rotate-ccw")
      .setChecked(!hasOverride)
      .onClick(() => this.setScheduleOverride(dateKey, schedule.id, undefined)));
    menu.addItem((item) => item
      .setTitle(t("Отключить", "Disable"))
      .setIcon("circle-off")
      .setChecked(selectedPeriodId === null)
      .onClick(() => this.setScheduleOverride(dateKey, schedule.id, null)));
    menu.addSeparator();
    schedule.periods.forEach((period) => {
      menu.addItem((item) => item
        .setTitle(period.name)
        .setIcon("repeat-2")
        .setChecked(selectedPeriodId === period.id)
        .onClick(() => this.setScheduleOverride(dateKey, schedule.id, period.id)));
    });
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle(t("Изменить диапазон…", "Change range…"))
      .setIcon("calendar-range")
      .onClick(() => new ScheduleRangeModal(this.plugin, schedule, dateKey, "change").open()));
    menu.addItem((item) => item
      .setTitle(t("Отключить диапазон…", "Disable range…"))
      .setIcon("calendar-off")
      .onClick(() => new ScheduleRangeModal(this.plugin, schedule, dateKey, "disable").open()));
  }

  private setScheduleOverride(
    dateKey: string,
    scheduleId: string,
    periodId: string | null | undefined
  ): void {
    const overrides = { ...(this.plugin.settings.dayScheduleOverrides[dateKey] ?? {}) };
    if (periodId === undefined) delete overrides[scheduleId];
    else overrides[scheduleId] = periodId;
    if (Object.keys(overrides).length > 0) {
      this.plugin.settings.dayScheduleOverrides[dateKey] = overrides;
    } else {
      delete this.plugin.settings.dayScheduleOverrides[dateKey];
    }
    void this.plugin.saveSettings();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("oxill-calendar-view");
    container.style.setProperty(
      "--oxill-calendar-number-color-light",
      this.plugin.settings.calendarNumberColorLight
    );
    container.style.setProperty(
      "--oxill-calendar-number-color-dark",
      this.plugin.settings.calendarNumberColorDark
    );
    container.style.setProperty(
      "--oxill-note-indicator-color",
      this.plugin.settings.noteIndicatorColor
    );
    container.style.setProperty(
      "--oxill-note-indicator-border-width",
      `${this.plugin.settings.noteIndicatorBorderWidth}px`
    );
    container.style.setProperty(
      "--oxill-status-border-width",
      this.plugin.settings.statusOutlineEnabled ? "1px" : "0px"
    );

    const navigation = container.createDiv({ cls: "oxill-calendar-nav" });
    const monthButton = navigation.createEl("button", {
      cls: "oxill-calendar-month",
      text: `${shortMonth(this.displayedMonth)} ${this.displayedMonth.format("YYYY")}`,
      attr: { "aria-label": t("Открыть месячную заметку", "Open monthly note") }
    });
    monthButton.addEventListener("click", (event) => {
      void this.openNote("monthly", this.displayedMonth, event);
    });
    monthButton.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.showNoteMenu("monthly", this.displayedMonth, event);
    });

    const controls = navigation.createDiv({ cls: "oxill-calendar-nav-controls" });
    controls.createEl("button", {
      cls: "oxill-calendar-nav-button",
      attr: { "aria-label": t("Предыдущий месяц", "Previous month") },
      text: "‹"
    }).addEventListener("click", () => {
      this.displayedMonth.subtract(1, "month");
      this.render();
    });

    controls.createEl("button", {
      cls: "oxill-calendar-today",
      text: t("Сегодня", "Today")
    }).addEventListener("click", () => {
      this.displayedMonth = moment().startOf("month");
      this.render();
    });

    controls.createEl("button", {
      cls: "oxill-calendar-nav-button",
      attr: { "aria-label": t("Следующий месяц", "Next month") },
      text: "›"
    }).addEventListener("click", () => {
      this.displayedMonth.add(1, "month");
      this.render();
    });

    const table = container.createEl("table", { cls: "oxill-calendar-grid" });
    const head = table.createEl("thead").createEl("tr");
    head.createEl("th", { text: t("НЕД", "WK") });
    const weekdays = this.plugin.settings.weekStartsOn === "sunday"
      ? (this.plugin.settings.language === "en" ? SUNDAY_FIRST_WEEKDAYS_EN : SUNDAY_FIRST_WEEKDAYS_RU)
      : (this.plugin.settings.language === "en" ? MONDAY_FIRST_WEEKDAYS_EN : MONDAY_FIRST_WEEKDAYS_RU);
    weekdays.forEach((day) => head.createEl("th", { text: day }));

    const body = table.createEl("tbody");
    const cursor = startOfWeek(
      this.displayedMonth.clone().startOf("month"),
      this.plugin.settings.weekStartsOn
    );
    const activePath = this.app.workspace.getActiveFile()?.path;
    const today = moment();
    const connectedDailyNotes = getConnectedDailyNotes(this.app, this.plugin.settings);

    for (let week = 0; week < 6; week += 1) {
      const row = body.createEl("tr");
      const weekDate = cursor.clone();
      const number = weekNumber(weekDate, this.plugin.settings.weekStartsOn);
      const weekCell = row.createEl("td", { cls: "oxill-calendar-week-cell" });
      const weekButton = weekCell.createEl("button", {
        text: String(number),
        attr: { "aria-label": t(`Открыть заметку недели ${number}`, `Open note for week ${number}`) }
      });
      if (getNotePath(this.plugin.settings, "weekly", weekDate) === activePath) {
        weekButton.addClass("is-active");
      }
      weekButton.addEventListener("click", (event) => void this.openNote("weekly", weekDate, event));
      weekButton.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.showNoteMenu("weekly", weekDate, event);
      });

      for (let day = 0; day < 7; day += 1) {
        const date = cursor.clone();
        cursor.add(1, "day");
        const cell = row.createEl("td");
        const button = cell.createEl("button", {
          cls: "oxill-calendar-day",
          text: date.format("D"),
          attr: { "aria-label": date.format("DD.MM.YYYY") }
        });

        const isAdjacent = !date.isSame(this.displayedMonth, "month");
        if (isAdjacent) button.addClass("is-adjacent");
        if (isAdjacent && this.plugin.settings.showOnlyCurrentMonth) {
          button.addClass("is-hidden-adjacent");
          continue;
        }
        if (date.isSame(today, "day")) button.addClass("is-today");

        const notePath = getNotePath(this.plugin.settings, "daily", date);
        const noteFile = this.app.vault.getAbstractFileByPath(notePath);
        const connectedFiles = connectedDailyNotes.get(date.format("YYYY-MM-DD")) ?? [];
        if (noteFile instanceof TFile || connectedFiles.length > 0) {
          button.addClass("has-note");
          if (this.plugin.settings.noteIndicatorStyle === "line") {
            button.createSpan({ cls: "oxill-calendar-note-indicator-line" });
          } else if (this.plugin.settings.noteIndicatorStyle === "underline") {
            button.createSpan({ cls: "oxill-calendar-note-indicator-underline" });
          } else {
            const indicator = button.createSpan({ cls: "oxill-calendar-note-indicator" });
            const svg = createSvg("svg", {
              attr: { viewBox: "0 0 14 14", "aria-hidden": "true" }
            });
            svg.appendChild(createSvg("polygon", {
              attr: { points: "1 1 13 1 13 13" }
            }));
            indicator.appendChild(svg);
          }
        }
        if (notePath === activePath || connectedFiles.some((file) => file.path === activePath)) {
          button.addClass("is-active");
        }

        const schedule = getDaySchedule(this.plugin.settings, date);
        if (schedule) {
          const colors = schedule.occurrences.map((occurrence) =>
            occurrence.period.color
          );
          if (this.plugin.settings.scheduleDisplayMode === "outline") {
            const borderColors = colors.length === 1
              ? [colors[0], colors[0], colors[0], colors[0]]
              : colors.length === 2
                ? [colors[0], colors[1], colors[1], colors[0]]
                : colors.length === 3
                  ? [colors[0], colors[1], colors[2], colors[0]]
                  : colors.slice(0, 4);
            button.setCssProps({
              "--oxill-schedule-border-colors": borderColors.join(" ")
            });
            button.addClass("has-schedule-outline");
          } else if (colors.length === 1) {
            button.style.background = colors[0];
            button.addClass("has-work-schedule");
          } else if (colors.length === 2) {
            button.style.background = `linear-gradient(to bottom right, ${colors[0]} 0 49%, ${colors[1]} 51% 100%)`;
            button.addClass("has-split-schedule");
          } else {
            const step = 100 / colors.length;
            const stops = colors.map((color, index) =>
              `${color} ${(index * step).toFixed(2)}% ${((index + 1) * step).toFixed(2)}%`
            ).join(", ");
            button.style.background = `conic-gradient(from -45deg, ${stops})`;
            button.addClass("has-split-schedule");
          }
          button.title = dayScheduleTooltip(schedule);
        }

        const statusNames: string[] = [];
        const statusDots = button.createSpan({ cls: "oxill-calendar-status-dots" });
        const statusIds = this.plugin.settings.dayStatuses[date.format("YYYY-MM-DD")] ?? [];
        statusIds.slice(0, 3).forEach((statusId) => {
          const status = this.plugin.settings.statuses.find((item) => item.id === statusId);
          if (!status) return;
          statusNames.push(status.name);
          const dot = statusDots.createSpan({ cls: "oxill-calendar-status-dot" });
          dot.style.backgroundColor = status.color;
        });
        if (statusNames.length > 0) {
          const statusTooltip = `${t("Статусы", "Statuses")}: ${statusNames.join(", ")}`;
          button.title = button.title ? `${button.title}\n${statusTooltip}` : statusTooltip;
        }

        button.addEventListener("click", (event) => void this.openNote("daily", date, event));
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          this.showDayMenu(date, event);
        });
      }
    }
  }
}
