import * as vscode from "vscode";

export class ToastService {
  showInfo(text: string) {
    vscode.window.showInformationMessage(text);
  }

  showWarning(text: string) {
    vscode.window.showWarningMessage(text);
  }
}
