import {
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
  setIcon
} from "obsidian";
import type { Moment } from "moment";

import type OxillCalendarPlugin from "./main";
import authorAvatar from "../assets/ava.jpg";
import { moment } from "./moment";
import { FolderSuggest, MarkdownFileSuggest } from "./suggest";
import {
  createPeriod,
  createSchedule,
  createStatus,
  type CalendarSchedule,
  type NoteKind,
  type PeriodicNoteSettings,
  type SchedulePeriod
} from "./types";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function numberValue(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function parseDateRange(startValue: string, endValue: string): [Moment, Moment] | null {
  const start = moment(startValue, "YYYY-MM-DD", true).startOf("day");
  const end = moment(endValue, "YYYY-MM-DD", true).startOf("day");
  return start.isValid() && end.isValid() && !end.isBefore(start, "day") ? [start, end] : null;
}

class StatusPeriodModal extends Modal {
  private statusId: string;
  private startDate = moment().format("YYYY-MM-DD");
  private endDate = moment().format("YYYY-MM-DD");
  private interval = 1;

  constructor(private readonly plugin: OxillCalendarPlugin) {
    super(plugin.app);
    this.statusId = plugin.settings.statuses[0]?.id ?? "";
  }

  onOpen(): void {
    this.titleEl.setText("Назначить статус на период");
    this.contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Статус будет назначен от начальной до конечной даты включительно."
    });
    new Setting(this.contentEl).setName("Статус").addDropdown((dropdown) => {
      this.plugin.settings.statuses.forEach((status) => dropdown.addOption(status.id, status.name));
      dropdown.setValue(this.statusId).onChange((value) => { this.statusId = value; });
    });
    this.addDateSetting("С даты", this.startDate, (value) => { this.startDate = value; });
    this.addDateSetting("По дату", this.endDate, (value) => { this.endDate = value; });
    new Setting(this.contentEl)
      .setName("Интервал")
      .setDesc("Через сколько дней повторять статус. 1 — каждый день.")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.step = "1";
        text.setValue(String(this.interval)).onChange((value) => {
          this.interval = numberValue(value, 1, 1, 3650);
        });
      });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
      .addButton((button) => button.setCta().setButtonText("Назначить").onClick(() => {
        void this.apply();
      }));
  }

  private addDateSetting(name: string, value: string, onChange: (value: string) => void): void {
    new Setting(this.contentEl).setName(name).addText((text) => {
      text.inputEl.type = "date";
      text.setValue(value).onChange(onChange);
    });
  }

  private async apply(): Promise<void> {
    const range = parseDateRange(this.startDate, this.endDate);
    const status = this.plugin.settings.statuses.find((item) => item.id === this.statusId);
    if (!range || !status) {
      new Notice("Выберите статус и корректный диапазон дат");
      return;
    }
    const [start, end] = range;
    const interval = Math.max(1, Math.floor(this.interval));
    const occurrences = Math.floor(end.diff(start, "days") / interval) + 1;
    if (occurrences > 10_000) {
      new Notice("Диапазон слишком большой: максимум 10 000 назначений");
      return;
    }

    let added = 0;
    let skipped = 0;
    for (const date = start.clone(); !date.isAfter(end, "day"); date.add(interval, "days")) {
      const key = date.format("YYYY-MM-DD");
      const current = this.plugin.settings.dayStatuses[key] ?? [];
      if (current.includes(status.id)) continue;
      if (current.length >= 3) {
        skipped += 1;
        continue;
      }
      this.plugin.settings.dayStatuses[key] = [...current, status.id];
      added += 1;
    }
    await this.plugin.saveSettings();
    this.close();
    new Notice(skipped > 0
      ? `Статус назначен: ${added}. Пропущено заполненных дней: ${skipped}`
      : `Статус назначен: ${added}`);
  }
}

class ClearStatusesModal extends Modal {
  private deletionScope: "all" | "range" = "range";
  private startDate = moment().startOf("month").format("YYYY-MM-DD");
  private endDate = moment().endOf("month").format("YYYY-MM-DD");

  constructor(private readonly plugin: OxillCalendarPlugin) {
    super(plugin.app);
  }

  onOpen(): void {
    this.titleEl.setText("Удалить назначения статусов");
    let startInput: HTMLInputElement;
    let endInput: HTMLInputElement;
    new Setting(this.contentEl).setName("Область удаления").addDropdown((dropdown) => dropdown
      .addOption("range", "Диапазон дат")
      .addOption("all", "Все даты")
      .setValue(this.deletionScope)
      .onChange((value) => {
        this.deletionScope = value === "all" ? "all" : "range";
        startInput.disabled = this.deletionScope === "all";
        endInput.disabled = this.deletionScope === "all";
      }));
    new Setting(this.contentEl).setName("С даты").addText((text) => {
      startInput = text.inputEl;
      startInput.type = "date";
      text.setValue(this.startDate).onChange((value) => { this.startDate = value; });
    });
    new Setting(this.contentEl).setName("По дату").addText((text) => {
      endInput = text.inputEl;
      endInput.type = "date";
      text.setValue(this.endDate).onChange((value) => { this.endDate = value; });
    });
    new Setting(this.contentEl)
      .setDesc("Удаляются назначения в календаре. Сами статусы и их цвета останутся в настройках.")
      .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
      .addButton((button) => button.setDestructive().setButtonText("Удалить").onClick(() => {
        void this.clear();
      }));
  }

  private async clear(): Promise<void> {
    if (this.deletionScope === "all") {
      const removed = Object.values(this.plugin.settings.dayStatuses)
        .reduce((total, ids) => total + ids.length, 0);
      this.plugin.settings.dayStatuses = {};
      await this.plugin.saveSettings();
      this.close();
      new Notice(`Удалено назначений: ${removed}`);
      return;
    }

    const range = parseDateRange(this.startDate, this.endDate);
    if (!range) {
      new Notice("Укажите корректный диапазон дат");
      return;
    }
    const [start, end] = range;
    let removed = 0;
    Object.keys(this.plugin.settings.dayStatuses).forEach((key) => {
      const date = moment(key, "YYYY-MM-DD", true);
      if (!date.isValid() || date.isBefore(start, "day") || date.isAfter(end, "day")) return;
      removed += this.plugin.settings.dayStatuses[key].length;
      delete this.plugin.settings.dayStatuses[key];
    });
    await this.plugin.saveSettings();
    this.close();
    new Notice(`Удалено назначений: ${removed}`);
  }
}

function renderDayHours(
  parent: HTMLElement,
  period: SchedulePeriod,
  onChange: () => void
): void {
  const block = parent.createDiv({ cls: "oxill-calendar-project-hours" });
  block.createDiv({ cls: "setting-item-name", text: "Часы по дням" });
  block.createDiv({
    cls: "setting-item-description",
    text: "0 — график не действует в этот день. Допустимо от 0 до 24 часов."
  });
  const grid = block.createDiv({ cls: "oxill-calendar-hours-grid" });
  WEEKDAYS.forEach((label, index) => {
    const weekday = String(index + 1);
    const item = grid.createDiv();
    item.createEl("label", { text: label });
    const input = item.createEl("input", {
      type: "number",
      value: String(period.dayHours[weekday] || 0),
      attr: { min: "0", max: "24", step: "1" }
    });
    input.addEventListener("change", () => {
      const hours = numberValue(input.value, 0, 0, 24);
      if (hours === 0) delete period.dayHours[weekday];
      else period.dayHours[weekday] = hours;
      input.value = String(hours);
      onChange();
    });
  });
}

class ScheduleEditorModal extends Modal {
  private readonly draft: CalendarSchedule;
  private readonly expandedPeriodIds = new Set<string>();
  private footerEl!: HTMLElement;

  constructor(
    private readonly plugin: OxillCalendarPlugin,
    schedule: CalendarSchedule,
    private readonly isNew: boolean
  ) {
    super(plugin.app);
    this.draft = structuredClone(schedule);
    const firstPeriod = this.draft.periods[0];
    if (firstPeriod) this.expandedPeriodIds.add(firstPeriod.id);
  }

  onOpen(): void {
    this.modalEl.addClass("oxill-calendar-schedule-modal");
    this.footerEl = this.modalEl.createDiv({ cls: "oxill-calendar-modal-buttons" });
    this.render();
  }

  private render(): void {
    const scrollTop = this.contentEl.scrollTop;
    this.contentEl.empty();
    this.titleEl.setText(this.isNew ? "Создание графика" : "Редактирование графика");

    this.contentEl.createDiv({
      cls: "oxill-calendar-modal-intro",
      text: "Периоды идут по порядку и сменяют друг друга каждую неделю от даты отсчёта."
    });

    const generalCard = this.contentEl.createDiv({
      cls: "oxill-calendar-settings-group oxill-calendar-modal-general"
    });
    this.addInputField(
      generalCard,
      "Название",
      "Название всего циклического графика.",
      "text",
      this.draft.name,
      (value) => { this.draft.name = value; }
    );
    this.addInputField(
      generalCard,
      "Дата начала",
      "До этой даты график не действует. Периоды сменяются по понедельникам.",
      "date",
      this.draft.startDate,
      (value) => { this.draft.startDate = value; }
    );

    const periodsHeading = this.contentEl.createDiv({ cls: "oxill-calendar-modal-section-heading" });
    periodsHeading.createDiv({ cls: "oxill-calendar-modal-section-title", text: "Периоды" });
    periodsHeading.createDiv({
      cls: "oxill-calendar-modal-section-description",
      text: `${this.draft.periods.length} ${this.periodWord(this.draft.periods.length)} в цикле`
    });

    this.draft.periods.forEach((period, index) => {
      const expanded = this.expandedPeriodIds.has(period.id);
      const card = this.contentEl.createDiv({ cls: "oxill-calendar-period-card" });
      card.toggleClass("is-expanded", expanded);
      const header = card.createDiv({
        cls: "oxill-calendar-period-header",
        attr: { role: "button", tabindex: "0", "aria-expanded": String(expanded) }
      });
      const chevron = header.createSpan({ cls: "oxill-calendar-period-chevron" });
      setIcon(chevron, "chevron-right");
      const headerText = header.createDiv({ cls: "oxill-calendar-period-header-text" });
      headerText.createDiv({
        cls: "oxill-calendar-period-header-name",
        text: `${index + 1}. ${period.name}`
      });
      const headerMeta = headerText.createDiv({
        cls: "oxill-calendar-period-header-meta",
        text: this.periodSummary(period)
      });
      const swatches = header.createDiv({ cls: "oxill-calendar-period-swatches" });
      const swatch = swatches.createSpan({ cls: "oxill-calendar-swatch" });
      swatch.style.backgroundColor = period.color;

      const headerActions = header.createDiv({ cls: "oxill-calendar-period-header-actions" });
      this.addHeaderButton(headerActions, "arrow-up", "Переместить выше", index === 0, () => {
        [this.draft.periods[index - 1], this.draft.periods[index]] = [
          this.draft.periods[index],
          this.draft.periods[index - 1]
        ];
        this.render();
      });
      this.addHeaderButton(
        headerActions,
        "arrow-down",
        "Переместить ниже",
        index === this.draft.periods.length - 1,
        () => {
          [this.draft.periods[index], this.draft.periods[index + 1]] = [
            this.draft.periods[index + 1],
            this.draft.periods[index]
          ];
          this.render();
        }
      );
      this.addHeaderButton(headerActions, "trash-2", "Удалить период", false, () => {
        if (this.draft.periods.length === 1) {
          new Notice("В графике должен остаться хотя бы один период");
          return;
        }
        this.draft.periods.splice(index, 1);
        this.expandedPeriodIds.delete(period.id);
        this.render();
      }, true);

      const toggle = () => {
        if (this.expandedPeriodIds.has(period.id)) {
          this.expandedPeriodIds.delete(period.id);
        } else {
          this.expandedPeriodIds.clear();
          this.expandedPeriodIds.add(period.id);
        }
        this.render();
      };
      header.addEventListener("click", (event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        toggle();
      });
      header.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });

      if (!expanded) return;
      const body = card.createDiv({ cls: "oxill-calendar-period-body" });

      this.addInputField(
        body,
        "Название периода",
        "Отображается в календаре и краткой сводке.",
        "text",
        period.name,
        (value) => { period.name = value; }
      );

      this.addColorField(body, "Цвет", "Цвет графика в календаре.", period.color, (value) => {
        period.color = value;
        swatch.style.backgroundColor = value;
      });
      renderDayHours(body, period, () => headerMeta.setText(this.periodSummary(period)));
    });

    const addPeriod = this.contentEl.createEl("button", {
      cls: "oxill-calendar-add-period",
      text: "+ Добавить период"
    });
    addPeriod.addEventListener("click", () => {
        const period = createPeriod(`Период ${this.draft.periods.length + 1}`);
        this.draft.periods.push(period);
        this.expandedPeriodIds.clear();
        this.expandedPeriodIds.add(period.id);
        this.render();
    });

    this.footerEl.empty();
    this.footerEl.createEl("button", { text: "Отмена" }).addEventListener("click", () => this.close());
    this.footerEl.createEl("button", { cls: "mod-cta", text: "Сохранить" }).addEventListener("click", () => {
      void this.saveDraft();
    });

    window.requestAnimationFrame(() => {
      this.contentEl.scrollTop = scrollTop;
    });
  }

  private async saveDraft(): Promise<void> {
      if (!this.draft.name.trim() || !moment(this.draft.startDate, "YYYY-MM-DD", true).isValid()) {
        new Notice("Укажите название и корректную дату отсчёта");
        return;
      }
      if (this.isNew) this.plugin.settings.schedules.push(this.draft);
      else {
        const index = this.plugin.settings.schedules.findIndex((item) => item.id === this.draft.id);
        if (index >= 0) this.plugin.settings.schedules[index] = this.draft;
      }
      await this.plugin.saveSettings();
      this.close();
      this.plugin.settingTab.refreshPreservingScroll();
  }

  private addHeaderButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    disabled: boolean,
    onClick: () => void,
    warning = false
  ): void {
    const button = parent.createEl("button", {
      cls: `clickable-icon${warning ? " is-warning" : ""}`,
      attr: { type: "button", "aria-label": label, title: label }
    });
    button.disabled = disabled;
    setIcon(button, icon);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
  }

  private createField(parent: HTMLElement, label: string, description: string): HTMLElement {
    const row = parent.createDiv({ cls: "oxill-calendar-form-row" });
    const info = row.createDiv({ cls: "oxill-calendar-form-info" });
    info.createDiv({ cls: "oxill-calendar-form-label", text: label });
    if (description) info.createDiv({ cls: "oxill-calendar-form-description", text: description });
    return row.createDiv({ cls: "oxill-calendar-form-control" });
  }

  private addInputField(
    parent: HTMLElement,
    label: string,
    description: string,
    type: string,
    value: string,
    onChange: (value: string) => void,
    attributes: Record<string, string> = {}
  ): void {
    const control = this.createField(parent, label, description);
    const input = control.createEl("input", {
      cls: "oxill-calendar-form-input",
      type,
      value,
      attr: attributes
    });
    input.addEventListener("input", () => onChange(input.value));
  }

  private addColorField(
    parent: HTMLElement,
    label: string,
    description: string,
    value: string,
    onChange: (value: string) => void
  ): void {
    const control = this.createField(parent, label, description);
    const wrapper = control.createDiv({ cls: "oxill-calendar-color-control" });
    const color = wrapper.createEl("input", {
      cls: "oxill-calendar-color-input",
      type: "color",
      value
    });
    const code = wrapper.createEl("code", { text: value.toUpperCase() });
    color.addEventListener("input", () => {
      code.setText(color.value.toUpperCase());
      onChange(color.value);
    });
  }

  private periodSummary(period: SchedulePeriod): string {
    const values = Object.values(period.dayHours).filter((hours) => Number(hours) > 0);
    const total = values.reduce((sum, hours) => sum + Number(hours), 0);
    return `${values.length} дн. · ${total} ч в неделю`;
  }

  private periodWord(count: number): string {
    if (count % 10 === 1 && count % 100 !== 11) return "период";
    if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "периода";
    return "периодов";
  }
}

export class OxillCalendarSettingTab extends PluginSettingTab {
  private readonly openSections = new Set<string>();
  private rootEl!: HTMLElement;

  constructor(app: OxillCalendarPlugin["app"], private readonly plugin: OxillCalendarPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [{
      name: "Oxill Calendar",
      aliases: ["календарь", "заметки", "графики", "статусы", "шаблоны"],
      render: (setting) => {
        setting.settingEl.empty();
        setting.settingEl.addClass("oxill-calendar-settings-host");
        this.renderSettings(setting.settingEl);
      }
    }];
  }

  private renderSettings(containerEl: HTMLElement): void {
    this.rootEl = containerEl;
    containerEl.empty();
    containerEl.addClass("oxill-calendar-settings");

    const generalGroup = this.createGroup("Основное");
    new Setting(generalGroup)
      .setName("Подтверждать создание заметки")
      .setDesc("Показывать запрос перед созданием отсутствующей периодической заметки.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.confirmBeforeCreate)
        .onChange((value) => {
          this.plugin.settings.confirmBeforeCreate = value;
          void this.plugin.saveSettings();
        }));
    new Setting(generalGroup)
      .setName("Цвет индикатора созданной заметки")
      .setDesc("Цвет загнутого уголка у дня с существующей заметкой.")
      .addColorPicker((picker) => picker
        .setValue(this.plugin.settings.noteIndicatorColor)
        .onChange((value) => {
          this.plugin.settings.noteIndicatorColor = value;
          void this.plugin.saveSettings();
        }));
    new Setting(generalGroup)
      .setName("Обводка индикатора")
      .setDesc("Толщина внутренней чёрной обводки от 0,5 до 1,5 px.")
      .addSlider((slider) => slider
        .setLimits(0.5, 1.5, 0.1)
        .setValue(this.plugin.settings.noteIndicatorBorderWidth)
        .setDynamicTooltip()
        .onChange((value) => {
          this.plugin.settings.noteIndicatorBorderWidth = value;
          void this.plugin.saveSettings();
        }));

    const notesSection = this.createSection(
      "notes",
      "Периодические заметки",
      "Папки, форматы имён и шаблоны.",
      "3 типа"
    );
    this.renderNoteSettings(notesSection, "daily", "Дневная заметка");
    this.renderNoteSettings(notesSection, "weekly", "Недельная заметка");
    this.renderNoteSettings(notesSection, "monthly", "Месячная заметка");

    const statusesSection = this.createSection(
      "statuses",
      "Статусы",
      "На один день можно назначить до трёх статусов.",
      String(this.plugin.settings.statuses.length)
    );
    const statusesGroup = statusesSection.createDiv({
      cls: "oxill-calendar-settings-group oxill-calendar-statuses-group"
    });
    if (this.plugin.settings.statuses.length === 0) {
      statusesGroup.createDiv({
        cls: "oxill-calendar-empty-state",
        text: "Статусы пока не созданы."
      });
    }
    this.plugin.settings.statuses.forEach((status) => {
      const row = new Setting(statusesGroup)
        .setName(status.name)
        .addText((text) => text
          .setPlaceholder("Например, тренировка")
          .setValue(status.name)
          .onChange((value) => {
            status.name = value.trim() || "Без названия";
            void this.plugin.saveSettings();
          }))
        .addColorPicker((picker) => picker
          .setValue(status.color)
          .onChange((value) => {
            status.color = value;
            marker.style.backgroundColor = value;
            void this.plugin.saveSettings();
          }))
        .addButton((button) => button
          .setIcon("trash-2")
          .setTooltip("Удалить статус")
          .setDestructive()
          .onClick(() => {
            this.plugin.settings.statuses = this.plugin.settings.statuses.filter(
              (item) => item.id !== status.id
            );
            Object.keys(this.plugin.settings.dayStatuses).forEach((date) => {
              this.plugin.settings.dayStatuses[date] = this.plugin.settings.dayStatuses[date]
                .filter((id) => id !== status.id);
              if (this.plugin.settings.dayStatuses[date].length === 0) {
                delete this.plugin.settings.dayStatuses[date];
              }
            });
            void this.saveAndRefresh();
          }));
      const marker = row.nameEl.createSpan({ cls: "oxill-calendar-status-marker" });
      marker.style.backgroundColor = status.color;
    });
    new Setting(statusesGroup)
      .setName("Новый статус")
      .addButton((button) => button
        .setCta()
        .setButtonText("Добавить")
        .onClick(() => {
          this.plugin.settings.statuses.push(createStatus());
          void this.saveAndRefresh();
        }));
    new Setting(statusesGroup)
      .setName("Массовые действия")
      .setDesc("Назначить статус по датам или очистить назначения.")
      .addButton((button) => button
        .setButtonText("Назначить период")
        .setDisabled(this.plugin.settings.statuses.length === 0)
        .onClick(() => new StatusPeriodModal(this.plugin).open()))
      .addButton((button) => button
        .setButtonText("Удалить назначения")
        .setDestructive()
        .onClick(() => new ClearStatusesModal(this.plugin).open()));

    this.renderScheduleSection();

    const archived = this.plugin.settings.schedules.filter((item) => item.archivedAt);
    if (archived.length > 0) {
      const archiveSection = this.createSection(
        "archive",
        "Архив",
        "Завершённые графики и их история.",
        String(archived.length)
      );
      const archiveGroup = archiveSection.createDiv({
        cls: "oxill-calendar-settings-group oxill-calendar-archive-group"
      });
      archived.forEach((schedule) => {
        new Setting(archiveGroup)
          .setName(schedule.name)
          .setDesc(`${schedule.startDate} — ${schedule.archivedAt}`)
          .addButton((button) => button.setButtonText("Изменить").onClick(() => {
            new ScheduleEditorModal(this.plugin, schedule, false).open();
          }))
          .addButton((button) => button.setButtonText("Восстановить").onClick(() => {
            if (this.plugin.settings.schedules.filter((item) => !item.archivedAt).length >= 4) {
              new Notice("Можно использовать не более четырёх активных графиков");
              return;
            }
            schedule.archivedAt = null;
            void this.saveAndRefresh();
          }))
          .addButton((button) => button.setDestructive().setButtonText("Удалить").onClick(() => {
            this.plugin.settings.schedules = this.plugin.settings.schedules.filter(
              (item) => item.id !== schedule.id
            );
            void this.saveAndRefresh();
          }));
      });
    }

    this.renderAuthorCard();
  }

  refreshPreservingScroll(): void {
    const scrollableElements: Array<{ element: HTMLElement; scrollTop: number }> = [];
    let element: HTMLElement | null = this.rootEl;
    while (element) {
      if (element.scrollHeight > element.clientHeight) {
        scrollableElements.push({ element, scrollTop: element.scrollTop });
      }
      element = element.parentElement;
    }

    this.update();
    window.requestAnimationFrame(() => {
      scrollableElements.forEach(({ element: scrollable, scrollTop }) => {
        scrollable.scrollTop = scrollTop;
      });
    });
  }

  private async saveAndRefresh(): Promise<void> {
    await this.plugin.saveSettings();
    this.refreshPreservingScroll();
  }

  private renderScheduleSection(): void {
    const active = this.plugin.settings.schedules.filter((item) => !item.archivedAt);
    const section = this.createSection(
      "schedules",
      "Графики",
      "До четырёх независимых циклических графиков.",
      `${active.length} из 4`
    );
    const group = section.createDiv({
      cls: "oxill-calendar-settings-group oxill-calendar-schedules-group"
    });

    if (active.length === 0) {
      group.createDiv({ cls: "oxill-calendar-empty-state", text: "Активного графика пока нет." });
    }
    active.forEach((schedule) => {
      const periodNames = schedule.periods.map((period) => period.name).join(" → ");
      const row = new Setting(group)
        .setName(schedule.name)
        .setDesc(`С ${schedule.startDate} · ${periodNames}`)
        .addButton((button) => button.setButtonText("Изменить").onClick(() => {
          new ScheduleEditorModal(this.plugin, schedule, false).open();
        }))
        .addButton((button) => button.setDestructive().setButtonText("Архивировать").onClick(() => {
          schedule.archivedAt = moment().format("YYYY-MM-DD");
          void this.saveAndRefresh();
        }));
      const swatches = row.nameEl.createSpan({ cls: "oxill-calendar-schedule-swatches" });
      schedule.periods.forEach((period) => {
        const swatch = swatches.createSpan({ cls: "oxill-calendar-swatch" });
        swatch.style.backgroundColor = period.color;
      });
    });

    new Setting(group)
      .setName("Добавить график")
      .setDesc(active.length >= 4 ? "Достигнут лимит активных графиков." : "Создать новый независимый цикл.")
      .addButton((button) => button
        .setCta()
        .setButtonText("Создать")
        .setDisabled(active.length >= 4)
        .onClick(() => {
          if (active.length >= 4) return;
          new ScheduleEditorModal(
            this.plugin,
            createSchedule(moment().format("YYYY-MM-DD")),
            true
          ).open();
        }));
  }

  private renderAuthorCard(): void {
    const card = this.rootEl.createDiv({ cls: "oxill-calendar-author-card" });
    const top = card.createDiv({ cls: "oxill-calendar-author-top" });
    top.createEl("img", {
      cls: "oxill-calendar-author-avatar",
      attr: { src: authorAvatar, alt: "oxill" }
    });
    const copy = top.createDiv({ cls: "oxill-calendar-author-copy" });
    copy.createDiv({ cls: "oxill-calendar-author-title", text: "Нравится плагин?" });
    copy.createEl("p", { text: "Поддержите проект или подпишитесь" });

    const links = card.createDiv({ cls: "oxill-calendar-social-links" });
    this.addSocialButton(links, "telegram", "Telegram", "https://t.me/oxilldat",
      "M21.7 3.4 18.5 19c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.1c.4-.4-.1-.6-.6-.2L6.1 12.8 1.3 11.3c-1-.3-1-1 .2-1.5L20.3 2.6c.9-.3 1.7.2 1.4.8Z");
    this.addSocialButton(links, "boosty", "Boosty", "https://boosty.to/oxilldat",
      "m13.1 2-3.8 7.4 2.5.1-3.7 6.7 3.4.1L9.7 22c5.5-1.8 9-5.2 9-9.2 0-2.8-1.8-4.8-4.5-5.5L16.6 2h-3.5Zm-.8 17.1 1.2-4.4-2.6-.1 3.4-6.2c1.6.5 2.6 1.8 2.6 3.7 0 2.7-1.7 5-4.6 7Z");
    this.addSocialButton(links, "youtube", "YouTube", "https://www.youtube.com/@oxilldat",
      "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.8 12l-6.2 3.6Z");
  }

  private addSocialButton(
    parent: HTMLElement,
    brand: string,
    label: string,
    url: string,
    pathData: string
  ): void {
    const link = parent.createEl("a", {
      cls: `oxill-calendar-social-button is-${brand}`,
      attr: {
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": label,
        title: label
      }
    });
    const svg = createSvg("svg", { attr: { viewBox: "0 0 24 24", "aria-hidden": "true" } });
    svg.appendChild(createSvg("path", { attr: { d: pathData } }));
    link.appendChild(svg);
  }

  private renderNoteSettings(parent: HTMLElement, kind: NoteKind, label: string): void {
    const config: PeriodicNoteSettings = this.plugin.settings[kind];
    const details = parent.createEl("details", {
      cls: "oxill-calendar-settings-group oxill-calendar-note-settings"
    });
    const summary = details.createEl("summary");
    summary.createSpan({ cls: "oxill-calendar-note-chevron", text: "›" });
    summary.createSpan({ cls: "oxill-calendar-note-title", text: label });
    const summaryMeta = config.template ? config.template.split("/").pop() : "Без шаблона";
    summary.createSpan({ cls: "oxill-calendar-note-meta", text: summaryMeta });
    const body = details.createDiv({ cls: "oxill-calendar-note-settings-body" });

    new Setting(body).setName("Папка").setDesc("Куда сохранять новые заметки.").addText((text) => {
      text.setPlaceholder("Начните вводить путь…").setValue(config.folder).onChange((value) => {
        config.folder = value.trim();
        void this.plugin.saveSettings();
      });
      new FolderSuggest(this.app, text.inputEl, (path) => {
        config.folder = path;
        void this.plugin.saveSettings();
      });
    });
    new Setting(body).setName("Формат имени").setDesc("Формат Moment.js для имени файла.").addText((text) =>
      text.setValue(config.format).onChange((value) => {
        config.format = value || config.format;
        void this.plugin.saveSettings();
      })
    );
    new Setting(body).setName("Шаблон").setDesc("Путь к Markdown-файлу. Оставьте поле пустым, чтобы не применять шаблон.").addText((text) => {
      text.setPlaceholder("Начните вводить имя файла…").setValue(config.template).onChange((value) => {
        config.template = value.trim();
        void this.plugin.saveSettings();
      });
      new MarkdownFileSuggest(this.app, text.inputEl, (path) => {
        config.template = path;
        void this.plugin.saveSettings();
      });
    });
  }

  private createHeading(name: string, description?: string): void {
    new Setting(this.rootEl).setName(name).setHeading();
    if (description) {
      this.rootEl.createDiv({
        cls: "oxill-calendar-section-description",
        text: description
      });
    }
  }

  private createSection(
    key: string,
    name: string,
    description: string,
    meta: string
  ): HTMLElement {
    const details = this.rootEl.createEl("details", {
      cls: "oxill-calendar-settings-section"
    });
    details.open = this.openSections.has(key);
    const summary = details.createEl("summary", { cls: "oxill-calendar-settings-section-summary" });
    summary.title = description;
    summary.createSpan({ cls: "oxill-calendar-settings-section-chevron", text: "›" });
    const text = summary.createDiv({ cls: "oxill-calendar-settings-section-text" });
    text.createDiv({ cls: "oxill-calendar-settings-section-title", text: name });
    text.createDiv({ cls: "oxill-calendar-settings-section-description", text: description });
    summary.createSpan({ cls: "oxill-calendar-settings-section-meta", text: meta });
    details.addEventListener("toggle", () => {
      if (details.open) this.openSections.add(key);
      else this.openSections.delete(key);
    });
    return details.createDiv({ cls: "oxill-calendar-settings-section-body" });
  }

  private createGroup(name: string, description?: string): HTMLElement {
    this.createHeading(name, description);
    return this.rootEl.createDiv({ cls: "oxill-calendar-settings-group" });
  }
}
