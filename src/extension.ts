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
import { TranslationFileService } from "./services/translation-file.service";
import { matchStrings, removeQuotes } from "./utils/text.utils";

interface TranslationKey {
  name: string;
  value: string;
}

interface TranslationEntry {
  file: string;
  lang: string;
  value: string;
}

const configService = new ConfigService();
const toastService = new ToastService();
const editorService = new EditorService();
const workspaceService = new WorkspaceService();
const translationFileService = new TranslationFileService(
  configService,
  workspaceService,
  editorService
);

export function activate(ctx: vscode.ExtensionContext) {
  registerCommand(ctx, "extension.insertExistingTranslationKey", async () => {
    const files = await translationFileService.findNearestTranslationFiles();
    if (files.length === 0) {
      toastService.showWarning("No translation files found");
      return;
    }

    const keys = await extractTranslationKeysOfFile(files[0]);
    if (keys.length === 0) {
      toastService.showWarning("No translation keys found");
      return;
    }

    const selectedKey = await requestTranslationKeyFromList(keys);
    if (selectedKey === undefined) return showCancelledMessage();

    await insertOrCopyTranslationKey(selectedKey.name);
  });

  registerCommand(ctx, "extension.createTranslation", async () => {
    const files = await translationFileService.findNearestTranslationFiles();
    if (files.length === 0) {
      toastService.showWarning("No translation files found");
      return;
    }

    const selectedText = editorService.getSelectedText();
    const translationKey = selectedText || (await requestTranslationKey());
    if (!translationKey) return showCancelledMessage();

    const translations = await requestTranslations(files);
    if (!translations) return showCancelledMessage();

    const result = addTranslationsToFiles(translationKey, translations);
    if (result instanceof Error) {
      toastService.showWarning(result.message);
      return;
    }

    if (!selectedText) {
      await insertOrCopyTranslationKey(translationKey);
    }
  });
}

async function requestTranslationKeyFromList(keys: TranslationKey[]) {
  const items = keys.map(
    (key): vscode.QuickPickItem => ({
      label: key.name,
      detail: key.value,
    })
  );

  const config = { matchOnDetail: true };
  const selection = await vscode.window.showQuickPick(items, config);
  return selection ? keys[items.indexOf(selection)] : undefined;
}

async function insertOrCopyTranslationKey(key: string) {
  const transformedKey = transformKeyForInsertion(key);
  const inserted = await editorService.replaceSelection(transformedKey);
  !inserted && (await copyKeyToClipboard(transformedKey));
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

async function extractTranslationKeysOfFile(
  filePath: string
): Promise<TranslationKey[]> {
  const project = createProject();

  const file = project.addSourceFileAtPath(filePath);
  const initializer = getTranslationObjectOfFile(file);
  if (!initializer) return [];

  const propNames = initializer
    .getProperties()
    .filter((prop): prop is PropertyAssignment =>
      prop.isKind(SyntaxKind.PropertyAssignment)
    )
    .map((prop) => {
      const value = prop
        .getChildAtIndexIfKind(2, SyntaxKind.StringLiteral)
        ?.getText();
      return { name: removeQuotes(prop.getName()), value: removeQuotes(value) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

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
  const prevMatch = matchStrings(key, prev);
  const next = sortedList[newKeyIndex + 1] ?? "";
  const nextMatch = matchStrings(key, next);

  const relativeToPrev = prevMatch > nextMatch;
  const relatedKeyIndex = relativeToPrev ? newKeyIndex - 1 : newKeyIndex + 1;

  const relatedKey = sortedList[relatedKeyIndex];
  const actualRelatedKeyIndex = propNames.indexOf(relatedKey);
  const actualNewKeyIndex = relativeToPrev
    ? actualRelatedKeyIndex + 1
    : actualRelatedKeyIndex;

  return actualNewKeyIndex;
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
