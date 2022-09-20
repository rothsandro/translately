import { ConfigService } from "../services/config.service";
import { EditorService } from "../services/editor.service";
import { ToastService } from "../services/toast.service";
import { FileService } from "../services/file.service";
import { WorkspaceService } from "../services/workspace.service";
import { TranslationService } from "../services/translation.service";
import { TranslationEntry } from "../types/translation";
import { TranslationKeyService } from "../services/translation-key.service";
import { window } from "vscode";
import * as path from "path";

const configService = new ConfigService();
const toastService = new ToastService();
const editorService = new EditorService();
const workspaceService = new WorkspaceService();
const translationService = new TranslationService(configService);
const translationKeyService = new TranslationKeyService(
  configService,
  editorService,
  toastService
);
const fileService = new FileService(
  configService,
  workspaceService,
  editorService
);

export const createTranslationCommand = {
  key: "extension.createTranslation",
  handler: async function () {
    const files = await fileService.findNearestTranslationFiles();
    if (files.length === 0) {
      toastService.showWarning("No translation files found");
      return;
    }

    const selectedText = editorService.getSelectedText();
    const translationKey = selectedText || (await requestTranslationKey());
    if (!translationKey) return toastService.showCancelledMessage();

    const translations = await requestTranslations(files);
    if (!translations) return toastService.showCancelledMessage();

    const result = translationService.addTranslationsToFiles(
      translationKey,
      translations
    );
    if (result instanceof Error) {
      toastService.showWarning(result.message);
      return;
    }

    if (!selectedText) {
      await translationKeyService.insertOrCopyTranslationKey(translationKey);
    }
  },
};

async function requestTranslationKey(): Promise<string | undefined> {
  const value = await window.showInputBox({
    prompt: "Translation Key",
    placeHolder: "component.segment-1.segment-2",
  });

  return value;
}

async function requestTranslations(
  files: string[]
): Promise<TranslationEntry[] | undefined> {
  const entries: TranslationEntry[] = [];

  for (const file of files) {
    const lang = path.parse(file).name;
    const value = await window.showInputBox({
      placeHolder: `Translation for ${lang}`,
      prompt: `File: ${workspaceService.getRelativePathOf(file)}`,
    });

    if (typeof value !== "string") return undefined;
    entries.push({ file, lang, value: value ?? "" });
  }

  return entries;
}
