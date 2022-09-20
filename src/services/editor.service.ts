import * as vscode from "vscode";

export class EditorService {
  getActiveDocument() {
    return vscode.window.activeTextEditor?.document;
  }
  
  getSelectedText(): string | undefined {
    const activeTextEditor = vscode.window.activeTextEditor;

    const selection = activeTextEditor?.selection;
    const selectedText = activeTextEditor?.document.getText(selection);
    return selectedText;
  }
}
