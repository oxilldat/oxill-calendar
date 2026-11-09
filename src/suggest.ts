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
      const scrollPositions: Array<{ element: HTMLElement; scrollTop: number }> = [];
      let parent = inputEl.parentElement;
      while (parent) {
        if (parent.scrollHeight > parent.clientHeight) {
          scrollPositions.push({ element: parent, scrollTop: parent.scrollTop });
        }
        parent = parent.parentElement;
      }

      inputEl.value = item.path;
      this.onChoose(item.path);
      this.close();
      window.requestAnimationFrame(() => {
        scrollPositions.forEach(({ element, scrollTop }) => {
          element.scrollTop = scrollTop;
        });
      });
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
