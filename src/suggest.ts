import { AbstractInputSuggest, TFile, TFolder, type App } from "obsidian";

class VaultPathSuggest<T extends TFile | TFolder> extends AbstractInputSuggest<T> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private readonly items: () => T[],
    private readonly onChoose: (path: string) => void
  ) {
    super(app, inputEl);
    this.onSelect((item) => {
      this.setValue(item.path);
      this.onChoose(item.path);
      this.close();
    });
  }

  protected getSuggestions(query: string): T[] {
    const search = query.trim().toLocaleLowerCase("ru");
    return this.items()
      .filter((item) => search.length === 0 || item.path.toLocaleLowerCase("ru").includes(search))
      .sort((a, b) => a.path.localeCompare(b.path, "ru"))
      .slice(0, 50);
  }

  renderSuggestion(item: T, el: HTMLElement): void {
    el.setText(item.path);
  }
}

export class FolderSuggest extends VaultPathSuggest<TFolder> {
  constructor(app: App, inputEl: HTMLInputElement, onChoose: (path: string) => void) {
    super(
      app,
      inputEl,
      () => app.vault.getAllLoadedFiles().filter((item): item is TFolder => item instanceof TFolder),
      onChoose
    );
  }
}

export class MarkdownFileSuggest extends VaultPathSuggest<TFile> {
  constructor(app: App, inputEl: HTMLInputElement, onChoose: (path: string) => void) {
    super(app, inputEl, () => app.vault.getMarkdownFiles(), onChoose);
  }
}
