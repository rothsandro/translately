import { env } from "vscode";
import { configs } from "../configs";
import { ConfigService } from "./config.service";
import { EditorService } from "./editor.service";
import { ToastService } from "./toast.service";

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
