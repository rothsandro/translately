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

  async replaceSelection(key: string): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    await editor.edit((editBuilder) => {
      editBuilder.replace(editor.selection, key);
    });

    return true;
  }
}
