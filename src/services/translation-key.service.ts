import { env } from "vscode";
import { configs } from "../configs";
import { configService, ConfigService } from "./config.service";
import { editorService, EditorService } from "./editor.service";
import { toastService, ToastService } from "./toast.service";

export class TranslationKeyService {
  constructor(
    private configService: ConfigService,
    private editorService: EditorService,
    private toastService: ToastService
  ) {}

  async insertOrCopyTranslationKey(key: string) {
    const transformedKey = this.transformKeyForInsertion(key);
    const inserted = await this.editorService.replaceSelection(transformedKey);
    !inserted && (await this.copyKeyToClipboard(transformedKey));
  }

  private transformKeyForInsertion(key: string) {
    const pattern = this.configService.getValue(configs.keyInsertPattern);
    return pattern.replace(/%KEY%/gi, key);
  }

  private async copyKeyToClipboard(key: string) {
    await env.clipboard.writeText(key);
    this.toastService.showInfo("Key copied to clipboard");
  }
}

export const translationKeyService = new TranslationKeyService(
  configService,
  editorService,
  toastService
);
