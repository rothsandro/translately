import { ConfigService } from "../services/config.service";
import { EditorService } from "../services/editor.service";
import { ToastService } from "../services/toast.service";
import { FileService } from "../services/file.service";
import { TranslationKeyService } from "../services/translation-key.service";
import { WorkspaceService } from "../services/workspace.service";

const configService = new ConfigService();
const toastService = new ToastService();
const editorService = new EditorService();
const workspaceService = new WorkspaceService();
const translationFileService = new FileService(
  configService,
  workspaceService,
  editorService
);

const translationKeyService = new TranslationKeyService(
  configService,
  editorService,
  toastService
);

const key = "extension.insertExistingTranslationKey";

async function handler() {
  const files = await translationFileService.findNearestTranslationFiles();
  if (files.length === 0) {
    toastService.showWarning("No translation files found");
    return;
  }

  const keys = await extractTranslationKeysOfFile(files[0]);
  if (keys.length === 0) {
    toastService.showWarning("No translation keys found");
    return;
  }

  const selectedKey = await requestTranslationKeyFromList(keys);
  if (selectedKey === undefined) return toastService.showCancelledMessage();

  await translationKeyService.insertOrCopyTranslationKey(selectedKey.name);
}

export const insertExistingTranslationKeyCommand = { key, handler };

