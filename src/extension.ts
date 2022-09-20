import * as vscode from "vscode";
import * as path from "path";
import {
  Project,
  SyntaxKind,
  SourceFile,
  PropertyAssignment,
  ObjectLiteralExpression,
  QuoteKind,
} from "ts-morph";
import { configs, indentationMapping } from "./configs";
import { ConfigService } from "./services/config.service";
import { ToastService } from "./services/toast.service";
import { EditorService } from "./services/editor.service";
import { WorkspaceService } from "./services/workspace.service";

interface TranslationEntry {
  file: string;
  lang: string;
  value: string;
}

const configService = new ConfigService();
const toastService = new ToastService();
const editorService = new EditorService();
const workspaceService = new WorkspaceService();

export function activate(ctx: vscode.ExtensionContext) {
  registerCommand(ctx, "extension.insertExistingTranslationKey", async () => {
    const files = await findTranslationFiles();
    const translationFiles = filterTranslationFilesByNearestMatch(files);
    if (translationFiles.length === 0) {
      toastService.showWarning("No translation files found");
      return;
    }

    const keys = await extractTranslationKeysOfFile(translationFiles[0]);
    if (keys.length === 0) {
      toastService.showWarning("No translation keys found");
      return;
    }

    const selectedKey = await vscode.window.showQuickPick(keys);
    if (selectedKey === undefined) return showCancelledMessage();

    const transformedKey = transformKeyForInsertion(selectedKey);
    const inserted = await insertTranslationKeyIntoFile(transformedKey);
    !inserted && (await copyKeyToClipboard(transformedKey));
  });

  registerCommand(ctx, "extension.createTranslation", async () => {
    const files = await findTranslationFiles();
    const translationFiles = filterTranslationFilesByNearestMatch(files);
    if (translationFiles.length === 0) {
      toastService.showWarning("No translation files found");
      return;
    }

    const selectedText = editorService.getSelectedText();
    const translationKey = selectedText || (await requestTranslationKey());
    if (!translationKey) return showCancelledMessage();

    const translations = await requestTranslations(translationFiles);
    if (!translations) return showCancelledMessage();

    const result = addTranslationsToFiles(translationKey, translations);
    if (result instanceof Error) {
      toastService.showWarning(result.message);
      return;
    }

    if (!selectedText) {
      const transformedKey = transformKeyForInsertion(translationKey);
      const inserted = await insertTranslationKeyIntoFile(transformedKey);
      !inserted && (await copyKeyToClipboard(transformedKey));
    }
  });
}

function registerCommand(
  context: vscode.ExtensionContext,
  key: string,
  fn: () => Promise<void>
) {
  const disposable = vscode.commands.registerCommand(key, fn);
  context.subscriptions.push(disposable);
}

async function copyKeyToClipboard(key: string) {
  await vscode.env.clipboard.writeText(key);
  toastService.showInfo("Key copied to clipboard");
}

async function insertTranslationKeyIntoFile(key: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return false;

  await editor.edit((editBuilder) => {
    editBuilder.replace(editor.selection, key);
  });

  return true;
}

async function extractTranslationKeysOfFile(filePath: string) {
  const project = createProject();

  const file = project.addSourceFileAtPath(filePath);
  const initializer = getTranslationObjectOfFile(file);
  if (!initializer) return [];

  const propNames = initializer
    .getProperties()
    .filter((prop): prop is PropertyAssignment =>
      prop.isKind(SyntaxKind.PropertyAssignment)
    )
    .map((prop) => prop.getName())
    .map((name) => name.replace(/(^["'])|(["']$)/g, ""))
    .sort();

  return propNames;
}

function createProject() {
  const config = configService.getValue(configs.identationType);
  const indentation =
    indentationMapping[config] ?? indentationMapping["2 spaces"];

  const project = new Project({
    manipulationSettings: {
      indentationText: indentation,
    },
  });

  return project;
}

function getTranslationObjectOfFile(
  file: SourceFile
): ObjectLiteralExpression | undefined {
  const pattern = configService.getValue(configs.translationVariablePattern);
  const regex = new RegExp(pattern);

  for (const declaration of file.getVariableDeclarations()) {
    const name = declaration.getName();
    if (!regex.test(name)) continue;
    const initializer = declaration.getInitializerIfKind(
      SyntaxKind.ObjectLiteralExpression
    );
    if (initializer) return initializer;
  }

  return undefined;
}

async function addTranslationsToFiles(
  key: string,
  entries: TranslationEntry[]
) {
  const project = createProject();

  for (const entry of entries) {
    const file = project.addSourceFileAtPath(entry.file);
    const initializer = getTranslationObjectOfFile(file);
    if (!initializer) {
      return new Error(`Missing translations for ${entry.lang}`);
    }

    const indexOfNewProp = findIndexForNewKey(initializer, key);
    const quoteKind = getQuoteKind(initializer);
    const escapedValue = escapeTranslation(entry.value, quoteKind);

    initializer.insertPropertyAssignment(indexOfNewProp, {
      name: `${quoteKind}${key}${quoteKind}`,
      initializer: `${quoteKind}${escapedValue}${quoteKind}`,
    });
  }

  await project.save();
}

function escapeTranslation(translation: string, quote: QuoteKind) {
  const pattern = new RegExp(`(${quote})`, "g");
  return translation.replace(pattern, "\\$1");
}

function getQuoteKind(obj: ObjectLiteralExpression) {
  const firstProp = obj
    .getProperties()
    .find((prop): prop is PropertyAssignment =>
      prop.isKind(SyntaxKind.PropertyAssignment)
    );
  const kind = firstProp?.getName().startsWith("'")
    ? QuoteKind.Single
    : QuoteKind.Double;
  return kind;
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
      prompt: `File: ${workspaceService.getRelativePathOf(file)}`,
    });

    if (typeof value !== "string") return undefined;
    entries.push({ file, lang, value: value ?? "" });
  }

  return entries;
}

async function findTranslationFiles() {
  const include = configService.getValue(
    configs.translationFilesIncludePattern
  );
  const exclude = configService.getValue(
    configs.translationFilesExcludePattern
  );

  return workspaceService.findFiles({ include, exclude });
}

function filterTranslationFilesByNearestMatch(files: string[]) {
  const current = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!current) return files;

  const filesWithMatches = files.map((file) => ({
    file,
    match: getMatch(current, file),
  }));
  const bestMatch = Math.max(...filesWithMatches.map((entry) => entry.match));

  const filesWithBestMatch = filesWithMatches
    .filter((entry) => entry.match === bestMatch)
    .map((entry) => entry.file);

  return filesWithBestMatch;
}

async function requestTranslationKey(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    prompt: "Translation Key",
    placeHolder: "component.segment-1.segment-2",
  });

  return value;
}

function showCancelledMessage() {
  toastService.showInfo("Cancelled command");
}

function transformKeyForInsertion(key: string) {
  const pattern = configService.getValue(configs.keyInsertPattern);
  return pattern.replace(/%KEY%/gi, key);
}
