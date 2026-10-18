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
import { getNotePath, openPeriodicNote } from "./notes";
import { dayScheduleTooltip, getDaySchedule } from "./schedule";
import type { NoteKind } from "./types";

export const CALENDAR_VIEW_TYPE = "oxill-calendar-view";
const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

function shortRussianMonth(date: Moment): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "short" })
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
      item.setTitle("Открыть").setIcon("file-text").onClick(() => {
        void openPeriodicNote(this.app, this.plugin.settings, kind, date, false);
      })
    );
    menu.addItem((item) =>
      item.setTitle("Удалить").setIcon("trash-2").onClick(() => {
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
        .setTitle("Статусы не настроены")
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
                new Notice("На один день можно назначить не более трёх статусов");
                return;
              }
              this.plugin.settings.dayStatuses[dateKey] = [...current, status.id];
            }
            void this.plugin.saveSettings();
          }));
      });
    }

    menu.addSeparator();
    const path = getNotePath(this.plugin.settings, "daily", date);
    const file = this.app.vault.getAbstractFileByPath(path);
    menu.addItem((item) => item
      .setTitle(file instanceof TFile ? "Открыть заметку" : "Создать заметку")
      .setIcon("file-text")
      .onClick(() => void openPeriodicNote(this.app, this.plugin.settings, "daily", date, false)));
    if (file instanceof TFile) {
      menu.addItem((item) => item
        .setTitle("Удалить заметку")
        .setIcon("trash-2")
        .onClick(() => void this.app.fileManager.trashFile(file)));
    }
    menu.showAtMouseEvent(event);
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

    const navigation = container.createDiv({ cls: "oxill-calendar-nav" });
    const monthButton = navigation.createEl("button", {
      cls: "oxill-calendar-month",
      text: `${shortRussianMonth(this.displayedMonth)} ${this.displayedMonth.format("YYYY")}`,
      attr: { "aria-label": "Открыть месячную заметку" }
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
      attr: { "aria-label": "Предыдущий месяц" },
      text: "‹"
    }).addEventListener("click", () => {
      this.displayedMonth.subtract(1, "month");
      this.render();
    });

    controls.createEl("button", {
      cls: "oxill-calendar-today",
      text: "Сегодня"
    }).addEventListener("click", () => {
      this.displayedMonth = moment().startOf("month");
      this.render();
    });

    controls.createEl("button", {
      cls: "oxill-calendar-nav-button",
      attr: { "aria-label": "Следующий месяц" },
      text: "›"
    }).addEventListener("click", () => {
      this.displayedMonth.add(1, "month");
      this.render();
    });

    const table = container.createEl("table", { cls: "oxill-calendar-grid" });
    const head = table.createEl("thead").createEl("tr");
    head.createEl("th", { text: "НЕД" });
    WEEKDAYS.forEach((day) => head.createEl("th", { text: day }));

    const body = table.createEl("tbody");
    const cursor = this.displayedMonth.clone().startOf("month").startOf("isoWeek");
    const activePath = this.app.workspace.getActiveFile()?.path;
    const today = moment();

    for (let week = 0; week < 6; week += 1) {
      const row = body.createEl("tr");
      const weekDate = cursor.clone();
      const weekCell = row.createEl("td", { cls: "oxill-calendar-week-cell" });
      const weekButton = weekCell.createEl("button", {
        text: String(weekDate.isoWeek()),
        attr: { "aria-label": `Открыть заметку недели ${weekDate.isoWeek()}` }
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

        if (!date.isSame(this.displayedMonth, "month")) button.addClass("is-adjacent");
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
          if (colors.length === 1) {
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
          const statusTooltip = `Статусы: ${statusNames.join(", ")}`;
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
