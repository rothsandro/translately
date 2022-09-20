import * as vscode from "vscode";
import { commands } from "./commands";

export function activate(ctx: vscode.ExtensionContext) {
  commands.forEach((cmd) => {
    const disposable = vscode.commands.registerCommand(cmd.key, cmd.handler);
    ctx.subscriptions.push(disposable);
  });
}
