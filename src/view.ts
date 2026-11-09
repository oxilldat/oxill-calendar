import type { Moment } from "moment";
import {
  ItemView,
  Menu,
  Notice,
  TFile,
  WorkspaceLeaf,
  normalizePath
} from "obsidian";

import type OxillCalendarPlugin from "./main";
import { moment } from "./moment";
import { getInterfaceLocale, t } from "./i18n";
import { getNotePath, openPeriodicNote } from "./notes";
import { dayScheduleTooltip, getDaySchedule, getSchedulesForDate } from "./schedule";
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

    const candidates: NoteKind[] = ["daily", "weekly", "monthly"];
    for (const kind of candidates) {
      const config = this.plugin.settings[kind];
      if (normalizePath(config.folder) !== normalizePath(parentPath(file.path))) continue;
      const parsed = moment(file.basename, config.format, true);
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
    const file = this.app.vault.getAbstractFileByPath(path);
    menu.addItem((item) => item
      .setTitle(file instanceof TFile ? t("Открыть заметку", "Open note") : t("Создать заметку", "Create note"))
      .setIcon("file-text")
      .onClick(() => void openPeriodicNote(this.app, this.plugin.settings, "daily", date, false)));
    if (file instanceof TFile) {
      menu.addItem((item) => item
        .setTitle(t("Удалить заметку", "Delete note"))
        .setIcon("trash-2")
        .onClick(() => void this.app.fileManager.trashFile(file)));
    }
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
      .setTitle(t("Автоматически", "Automatic"))
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
        if (noteFile instanceof TFile) {
          button.addClass("has-note");
          const indicator = button.createSpan({ cls: "oxill-calendar-note-indicator" });
          const svg = createSvg("svg", {
            attr: { viewBox: "0 0 14 14", "aria-hidden": "true" }
          });
          svg.appendChild(createSvg("polygon", {
            attr: { points: "1 1 13 1 13 13" }
          }));
          indicator.appendChild(svg);
        }
        if (notePath === activePath) button.addClass("is-active");

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
