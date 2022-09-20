import * as vscode from "vscode";
import * as path from "path";
import { configs } from "./configs";
import { ConfigService } from "./services/config.service";
import { ToastService } from "./services/toast.service";
import { EditorService } from "./services/editor.service";
import { WorkspaceService } from "./services/workspace.service";
import { FileService } from "./services/file.service";
import { TranslationEntry, TranslationKey } from "./types/translation";
import { TranslationService } from "./services/translation.service";

const configService = new ConfigService();
const toastService = new ToastService();
const editorService = new EditorService();
const workspaceService = new WorkspaceService();
const translationService = new TranslationService(configService);
const fileService = new FileService(
  configService,
  workspaceService,
  editorService
);

export function activate(ctx: vscode.ExtensionContext) {
  registerCommand(ctx, "extension.insertExistingTranslationKey", async () => {
    const files = await fileService.findNearestTranslationFiles();
    if (files.length === 0) {
      toastService.showWarning("No translation files found");
      return;
    }

    const keys = await translationService.extractTranslationKeysOfFile(
      files[0]
    );
    if (keys.length === 0) {
      toastService.showWarning("No translation keys found");
      return;
    }

    const selectedKey = await requestTranslationKeyFromList(keys);
    if (selectedKey === undefined) return showCancelledMessage();

    await insertOrCopyTranslationKey(selectedKey.name);
  });

  registerCommand(ctx, "extension.createTranslation", async () => {
    const files = await fileService.findNearestTranslationFiles();
    if (files.length === 0) {
      toastService.showWarning("No translation files found");
      return;
    }

    const selectedText = editorService.getSelectedText();
    const translationKey = selectedText || (await requestTranslationKey());
    if (!translationKey) return showCancelledMessage();

    const translations = await requestTranslations(files);
    if (!translations) return showCancelledMessage();

    const result = translationService.addTranslationsToFiles(
      translationKey,
      translations
    );
    if (result instanceof Error) {
      toastService.showWarning(result.message);
      return;
    }

    if (!selectedText) {
      await insertOrCopyTranslationKey(translationKey);
    }
  });
}

async function requestTranslationKeyFromList(keys: TranslationKey[]) {
  const items = keys.map(
    (key): vscode.QuickPickItem => ({
      label: key.name,
      detail: key.value,
    })
  );

  const config = { matchOnDetail: true };
  const selection = await vscode.window.showQuickPick(items, config);
  return selection ? keys[items.indexOf(selection)] : undefined;
}

async function insertOrCopyTranslationKey(key: string) {
  const transformedKey = transformKeyForInsertion(key);
  const inserted = await editorService.replaceSelection(transformedKey);
  !inserted && (await copyKeyToClipboard(transformedKey));
}

function registerCommand(
  context: vscode.ExtensionContext,
  key: string,
  fn: () => Promise<void>
) {
  const disposable = vscode.commands.registerCommand(key, fn);
  context.subscriptions.push(disposable);
}

async function copyKeyToClipboard(key: string) {
  await vscode.env.clipboard.writeText(key);
  toastService.showInfo("Key copied to clipboard");
}

async function requestTranslations(
  files: string[]
): Promise<TranslationEntry[] | undefined> {
  const entries: TranslationEntry[] = [];

  for (const file of files) {
    const lang = path.parse(file).name;
    const value = await vscode.window.showInputBox({
      placeHolder: `Translation for ${lang}`,
      prompt: `File: ${workspaceService.getRelativePathOf(file)}`,
    });

    if (typeof value !== "string") return undefined;
    entries.push({ file, lang, value: value ?? "" });
  }

  return entries;
}

async function requestTranslationKey(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    prompt: "Translation Key",
    placeHolder: "component.segment-1.segment-2",
  });

  return value;
}

function showCancelledMessage() {
  toastService.showInfo("Cancelled command");
}

function transformKeyForInsertion(key: string) {
  const pattern = configService.getValue(configs.keyInsertPattern);
  return pattern.replace(/%KEY%/gi, key);
}
