import { toastService } from "../services/toast.service";
import { fileService } from "../services/file.service";
import { translationService } from "../services/translation.service";
import { TranslationKey } from "../types/translation";
import { QuickPickItem, window } from "vscode";
import { translationKeyService } from "../services/translation-key.service";

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
