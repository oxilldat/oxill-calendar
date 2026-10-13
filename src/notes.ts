import moment, { type Moment } from "moment";
import "moment/locale/ru";
import {
  App,
  Modal,
  Notice,
  TFile,
  TFolder,
  normalizePath
} from "obsidian";

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

export function noteDate(kind: NoteKind, date: Moment): Moment {
  if (kind === "weekly") return date.clone().startOf("isoWeek");
  if (kind === "monthly") return date.clone().startOf("month");
  return date.clone();
}

export function getNotePath(
  settings: OxillCalendarSettings,
  kind: NoteKind,
  date: Moment
): string {
  const config = noteSettingsFor(settings, kind);
  const title = noteDate(kind, date).locale("ru").format(config.format);
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
    if (existing) throw new Error(`Путь «${current}» уже занят файлом`);
    await app.vault.createFolder(current);
  }
}

function applyTemplate(template: string, title: string, date: Moment): string {
  let result = template.replaceAll("{{title}}", title);
  result = result.replace(/{{date(?::([^}]+))?}}/g, (_match, format?: string) =>
    date.format(format || "YYYY-MM-DD")
  );
  result = result.replace(/{{time(?::([^}]+))?}}/g, (_match, format?: string) =>
    moment().format(format || "HH:mm")
  );

  ENGLISH_WEEKDAYS.forEach((weekday, index) => {
    const day = date.clone().startOf("isoWeek").add(index, "days");
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
  const normalizedDate = noteDate(kind, date).locale("ru");
  const title = normalizedDate.format(config.format);
  const path = getNotePath(settings, kind, date);
  const parent = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "";
  await ensureFolder(app, parent);

  let content = "";
  if (config.template) {
    const templateFile = app.vault.getAbstractFileByPath(normalizePath(config.template));
    if (!(templateFile instanceof TFile)) {
      throw new Error(`Шаблон «${config.template}» не найден`);
    }
    content = applyTemplate(await app.vault.cachedRead(templateFile), title, normalizedDate);
  }
  return app.vault.create(path, content);
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
    this.titleEl.setText("Создать заметку?");
    this.contentEl.createEl("p", { text: `Заметка «${this.label}» ещё не существует.` });
    const buttons = this.contentEl.createDiv({ cls: "oxill-calendar-modal-buttons" });
    buttons.createEl("button", { text: "Отмена" }).addEventListener("click", () => this.close());
    const createButton = buttons.createEl("button", { cls: "mod-cta", text: "Создать" });
    createButton.addEventListener("click", async () => {
      createButton.disabled = true;
      try {
        await this.onCreate();
        this.close();
      } catch (error) {
        createButton.disabled = false;
        new Notice(error instanceof Error ? error.message : "Не удалось создать заметку");
      }
    });
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
      new Notice(error instanceof Error ? error.message : "Не удалось создать заметку");
    }
    return;
  }

  new CreateNoteModal(app, path, createAndOpen).open();
}
