import { ConfigService } from "../services/config.service";
import { EditorService } from "../services/editor.service";
import { ToastService } from "../services/toast.service";
import { FileService } from "../services/file.service";
import { WorkspaceService } from "../services/workspace.service";
import { TranslationService } from "../services/translation.service";
import { TranslationKey } from "../types/translation";
import { QuickPickItem, window } from "vscode";
import { TranslationKeyService } from "../services/translation-key.service";

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

export const insertExistingTranslationKeyCommand = {
  key: "extension.insertExistingTranslationKey",
  handler: async function () {
    const [file] = await fileService.findNearestTranslationFiles();
    if (!file) {
      toastService.showWarning("No translation files found");
      return;
    }

    const keys = await translationService.extractTranslationKeysOfFile(file);
    if (keys.length === 0) {
      toastService.showWarning("No translation keys found");
      return;
    }

    const selectedKey = await requestTranslationKeyFromList(keys);
    if (selectedKey === undefined) return toastService.showCancelledMessage();

    await translationKeyService.insertOrCopyTranslationKey(selectedKey.name);
  },
};

async function requestTranslationKeyFromList(keys: TranslationKey[]) {
  const items = keys.map(
    (key): QuickPickItem => ({
      label: key.name,
      detail: key.value,
    })
  );

  const config = { matchOnDetail: true };
  const selection = await window.showQuickPick(items, config);
  return selection ? keys[items.indexOf(selection)] : undefined;
}
