import { window } from "vscode";
import { configs } from "../configs";
import { matchStrings } from "../utils/text.utils";
import { ConfigService } from "./config.service";
import { EditorService } from "./editor.service";
import { WorkspaceService } from "./workspace.service";

export class FileService {
  constructor(
    private configService: ConfigService,
    private workspaceService: WorkspaceService,
    private editorService: EditorService
  ) {}

  private get includePattern() {
    return this.configService.getValue(configs.translationFilesIncludePattern);
  }

  private get excludePattern() {
    return this.configService.getValue(configs.translationFilesExcludePattern);
  }

  async findTranslationFiles() {
    const include = this.includePattern;
    const exclude = this.excludePattern;
    return this.workspaceService.findFiles({ include, exclude });
  }

  /**
   * Finds all translation files that are near the current open document.
   * Useful if the user opens a monorepo with a lot of projects with their own translations.
   * If no doc is open the user have to select one or more translation files.
   *
   * @returns
   */
  async findNearestTranslationFiles(): Promise<string[]> {
    const files = await this.findTranslationFiles();
    const docPath = this.editorService.getActiveDocument()?.uri.fsPath;

    if (!docPath) {
      const items = files.map((file) =>
        this.workspaceService.getRelativePathOf(file)
      );

      const mulitselect = { canPickMany: true } as const;
      const selection = await window.showQuickPick(items, mulitselect);
      const selectedFiles = selection?.map((file) => {
        return files[items.indexOf(file)];
      });
      return selectedFiles || [];
    }

    const matches = files.map((file) => matchStrings(docPath, file));
    const bestMatch = Math.max(...matches);
    const filesWithBestMatch = files.filter(
      (_, idx) => matches[idx] === bestMatch
    );
    return filesWithBestMatch;
  }
}
