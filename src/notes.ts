import type { Moment } from "moment";
import {
  App,
  Modal,
  Notice,
  TFile,
  TFolder,
  normalizePath
} from "obsidian";

import { moment } from "./moment";
import { t } from "./i18n";
import { dateForIsoWeekday, startOfWeek } from "./week";

import type {
  NoteKind,
  OxillCalendarSettings,
  PeriodicNoteSettings
} from "./types";

const ENGLISH_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

export function noteSettingsFor(
  settings: OxillCalendarSettings,
  kind: NoteKind
): PeriodicNoteSettings {
  return settings[kind];
}

export function noteDate(
  settings: OxillCalendarSettings,
  kind: NoteKind,
  date: Moment
): Moment {
  if (kind === "weekly") return startOfWeek(date, settings.weekStartsOn);
  if (kind === "monthly") return date.clone().startOf("month");
  return date.clone();
}

export function getNotePath(
  settings: OxillCalendarSettings,
  kind: NoteKind,
  date: Moment
): string {
  const config = noteSettingsFor(settings, kind);
  const normalizedDate = noteDate(settings, kind, date).locale("ru");
  const titleDate = kind === "weekly" && settings.weekStartsOn === "sunday"
    ? normalizedDate.clone().add(1, "day")
    : normalizedDate;
  const title = titleDate.format(config.format);
  return normalizePath(config.folder ? `${config.folder}/${title}.md` : `${title}.md`);
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  if (!normalized || normalized === "/") return;

  const segments = normalized.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing) throw new Error(t(`Путь «${current}» уже занят файлом`, `Path “${current}” is already occupied by a file`));
    await app.vault.createFolder(current);
  }
}

function applyTemplate(
  template: string,
  title: string,
  date: Moment,
  settings: OxillCalendarSettings
): string {
  let result = template.replaceAll("{{title}}", title);
  result = result.replace(/{{date(?::([^}]+))?}}/g, (_match, format?: string) =>
    date.format(format || "YYYY-MM-DD")
  );
  result = result.replace(/{{time(?::([^}]+))?}}/g, (_match, format?: string) =>
    moment().format(format || "HH:mm")
  );

  ENGLISH_WEEKDAYS.forEach((weekday, index) => {
    const day = dateForIsoWeekday(date, index + 1, settings.weekStartsOn);
    const pattern = new RegExp(`{{${weekday}:([^}]+)}}`, "g");
    result = result.replace(pattern, (_match, format: string) => day.format(format));
  });
  return result;
}

async function createNote(
  app: App,
  settings: OxillCalendarSettings,
  kind: NoteKind,
  date: Moment
): Promise<TFile> {
  const config = noteSettingsFor(settings, kind);
  const normalizedDate = noteDate(settings, kind, date).locale("ru");
  const titleDate = kind === "weekly" && settings.weekStartsOn === "sunday"
    ? normalizedDate.clone().add(1, "day")
    : normalizedDate;
  const title = titleDate.format(config.format);
  const path = getNotePath(settings, kind, date);
  const parent = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "";
  await ensureFolder(app, parent);

  let content = "";
  const weekdayTemplate = kind === "daily" && settings.dailyWeekdayTemplatesEnabled
    ? settings.dailyWeekdayTemplates[String(normalizedDate.isoWeekday())]
    : "";
  const templatePath = weekdayTemplate || config.template;
  if (templatePath) {
    const templateFile = app.vault.getAbstractFileByPath(normalizePath(templatePath));
    if (!(templateFile instanceof TFile)) {
      throw new Error(t(`Шаблон «${templatePath}» не найден`, `Template “${templatePath}” was not found`));
    }
    content = applyTemplate(
      await app.vault.cachedRead(templateFile),
      title,
      normalizedDate,
      settings
    );
  }
  return app.vault.create(path, content);
}

export async function getOrCreatePeriodicNote(
  app: App,
  settings: OxillCalendarSettings,
  kind: NoteKind,
  date: Moment
): Promise<TFile> {
  const path = getNotePath(settings, kind, date);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return existing;
  if (existing) throw new Error(t(`Путь «${path}» уже занят папкой`, `Path “${path}” is already occupied by a folder`));
  return createNote(app, settings, kind, date);
}

class CreateNoteModal extends Modal {
  constructor(
    app: App,
    private readonly label: string,
    private readonly onCreate: () => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("Создать заметку?", "Create note?"));
    this.contentEl.createEl("p", { text: t(`Заметка «${this.label}» ещё не существует.`, `Note “${this.label}” does not exist yet.`) });
    const buttons = this.contentEl.createDiv({ cls: "oxill-calendar-modal-buttons" });
    buttons.createEl("button", { text: t("Отмена", "Cancel") }).addEventListener("click", () => this.close());
    const createButton = buttons.createEl("button", { cls: "mod-cta", text: t("Создать", "Create") });
    createButton.addEventListener("click", () => {
      void this.create(createButton);
    });
  }

  private async create(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      await this.onCreate();
      this.close();
    } catch (error) {
      button.disabled = false;
      new Notice(error instanceof Error ? error.message : t("Не удалось создать заметку", "Could not create note"));
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export async function openPeriodicNote(
  app: App,
  settings: OxillCalendarSettings,
  kind: NoteKind,
  date: Moment,
  inNewSplit: boolean
): Promise<void> {
  const path = getNotePath(settings, kind, date);
  const existing = app.vault.getAbstractFileByPath(path);

  const openFile = async (file: TFile) => {
    const leaf = app.workspace.getLeaf(inNewSplit ? "split" : false);
    await leaf.openFile(file, { active: true });
    app.workspace.setActiveLeaf(leaf, { focus: true });
  };

  if (existing instanceof TFile) {
    await openFile(existing);
    return;
  }

  const createAndOpen = async () => openFile(await createNote(app, settings, kind, date));
  if (!settings.confirmBeforeCreate) {
    try {
      await createAndOpen();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : t("Не удалось создать заметку", "Could not create note"));
    }
    return;
  }

  new CreateNoteModal(app, path, createAndOpen).open();
}
