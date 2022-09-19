import * as vscode from "vscode";
import * as path from "path";
import {
  Project,
  SyntaxKind,
  IndentationText,
  ManipulationSettings,
  SourceFile,
} from "ts-morph";

interface TranslationEntry {
  file: string;
  lang: string;
  value: string;
}

const manipulationSettings: Partial<ManipulationSettings> = {
  indentationText: IndentationText.TwoSpaces,
};

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "extension.createTranslation",
    async () => {
      const translationFiles = await findTranslationFiles();
      if (translationFiles.length === 0) {
        vscode.window.showWarningMessage("No translation files found");
        return;
      }

      const translationKey = await requestTranslationKey();
      if (!translationKey) return showCancelledMessage();

      const translations = await requestTranslations(translationFiles);
      if (!translations) return showCancelledMessage();

      const result = addTranslationsToFiles(translationKey, translations);
      if (result instanceof Error) {
        vscode.window.showWarningMessage(result.message);
        return;
      }

      const inserted = await insertTranslationKeyIntoFile(translationKey);
      !inserted && await copyKeyToClipboard(translationKey);
    }
  );

  context.subscriptions.push(disposable);
}

async function copyKeyToClipboard(key: string) {
  await vscode.env.clipboard.writeText(key);
  vscode.window.showInformationMessage("Key copied to clipboard");
}

async function insertTranslationKeyIntoFile(key: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return false;

  await editor.edit((editBuilder) => {
    editBuilder.replace(editor.selection, key);
  });

  return true;
}

async function addTranslationsToFiles(
  key: string,
  entries: TranslationEntry[]
) {
  const project = new Project({ manipulationSettings });
  const files: SourceFile[] = [];

  for (const entry of entries) {
    const file = project.addSourceFileAtPath(entry.file);
    const declaration = file.getVariableDeclaration(entry.lang);
    if (!declaration) return new Error(`Missing declaration for ${entry.lang}`);

    const initializer = declaration.getInitializerIfKind(
      SyntaxKind.ObjectLiteralExpression
    );
    if (!initializer) {
      return new Error(`Missing or invalid initializer for ${entry.lang}`);
    }

    // TODO: Can we use ts.factory for this?
    // ts.factory.createPropertyAssignment and ts.factory.createStringLiteral
    initializer.addPropertyAssignment({
      name: `'${key}'`,
      initializer: `'${entry.value}'`,
    });

    files.push(file);
  }

  files.forEach((file) => file.saveSync());
}

async function requestTranslations(
  files: string[]
): Promise<TranslationEntry[] | undefined> {
  const entries: TranslationEntry[] = [];

  for (const file of files) {
    const lang = path.parse(file).name;
    const value = await vscode.window.showInputBox({
      placeHolder: `Translation for ${lang}`,
      prompt: `File: ${vscode.workspace.asRelativePath(file)}`,
    });

    if (!value) return undefined;
    entries.push({ file, lang, value: value ?? "" });
  }

  return entries;
}

async function findTranslationFiles() {
  const pattern = `**/translation/[a-z][a-z]_[A-Z][A-Z].ts`;
  const exclude = `{dist,node_modules}`;

  const results = await vscode.workspace.findFiles(pattern, exclude);
  const files = results
    .map((result) => result.fsPath.toString())
    .sort((a, b) => a.localeCompare(b));

  return files;
}

async function requestTranslationKey(): Promise<string | undefined> {
  const activeTextEditor = vscode.window.activeTextEditor;
  const selection = activeTextEditor?.selection;
  const selectedText = activeTextEditor?.document.getText(selection);

  if (selectedText) return selectedText;

  const value = await vscode.window.showInputBox({
    prompt: "Translation Key",
    placeHolder: "component.segment-1.segment-2",
  });

  return value;
}

function showCancelledMessage() {
  vscode.window.showInformationMessage("Cancelled translation command");
}
