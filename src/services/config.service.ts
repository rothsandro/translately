import * as vscode from "vscode";
import { ConfigEntry } from "../configs";

export class ConfigService {
  getValue<T>(configEntry: ConfigEntry<T>): T {
    const config = vscode.workspace.getConfiguration();
    return config.get<T>(configEntry.key) || configEntry.defaultValue;
  }
}
