import * as vscode from "vscode";
import * as path from "path";
import {
  Project,
  SyntaxKind,
  IndentationText,
  ManipulationSettings,
  SourceFile,
  ObjectLiteralExpression,
} from "ts-morph";

export const KEY_INSERT_PATTERN = "translately.keyInsertPattern";

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

      const transformedKey = transformKeyForInsertion(translationKey);
      const inserted = await insertTranslationKeyIntoFile(transformedKey);
      !inserted && (await copyKeyToClipboard(transformedKey));
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

    const indexOfNewProp = findIndexForNewKey(initializer, key);
    initializer.insertPropertyAssignment(indexOfNewProp, {
      name: `'${key}'`,
      initializer: `'${entry.value}'`,
    });

    files.push(file);
  }

  files.forEach((file) => file.saveSync());
}

function findIndexForNewKey(obj: ObjectLiteralExpression, key: string) {
  // We need to include the comments
  // because when calling insertPropertyAssignment(index) the  comments
  // are part of the list and affect the position
  const props = obj.getPropertiesWithComments();
  const propNames = props
    .map((prop) =>
      prop.isKind(SyntaxKind.PropertyAssignment) ? prop.getName() : ""
    )
    .map((name) => name.replace(/(^["'])|(["']$)/g, ""));

  const sortedList = [...propNames, key].sort();
  const newKeyIndex = sortedList.indexOf(key);

  const prev = sortedList[newKeyIndex - 1] ?? "";
  const prevMatch = getMatch(key, prev);
  const next = sortedList[newKeyIndex + 1] ?? "";
  const nextMatch = getMatch(key, next);

  const relativeToPrev = prevMatch > nextMatch;
  const relatedKeyIndex = relativeToPrev ? newKeyIndex - 1 : newKeyIndex + 1;

  const relatedKey = sortedList[relatedKeyIndex];
  const actualRelatedKeyIndex = propNames.indexOf(relatedKey);
  const actualNewKeyIndex = relativeToPrev
    ? actualRelatedKeyIndex + 1
    : actualRelatedKeyIndex;

  return actualNewKeyIndex;
}

function getMatch(a: string, b: string) {
  const max = Math.max(a.length, b.length);

  for (let i = 1; i <= max; i++) {
    if (!b.startsWith(a.slice(0, i))) {
      return i - 1;
    }
  }

  return max;
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

function transformKeyForInsertion(key: string) {
  const config = vscode.workspace.getConfiguration();
  const pattern = config.get<string>(KEY_INSERT_PATTERN) || "%KEY%";
  return pattern.replace(/%KEY%/gi, key);
}
