import {
  ObjectLiteralExpression,
  Project,
  PropertyAssignment,
  QuoteKind,
  SourceFile,
  SyntaxKind,
} from "ts-morph";
import { configs, indentationMapping } from "../configs";
import { TranslationEntry, TranslationKey } from "../types/translation";
import { matchStrings, removeQuotes } from "../utils/text.utils";
import { ConfigService } from "./config.service";

export class TranslationService {
  constructor(private configService: ConfigService) {}

  async extractTranslationKeysOfFile(
    filePath: string
  ): Promise<TranslationKey[]> {
    const project = this.createProject();
    const file = project.addSourceFileAtPath(filePath);
    const initializer = this.getTranslationObjectOfFile(file);
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
        return {
          name: removeQuotes(prop.getName()),
          value: removeQuotes(value),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return propNames;
  }

  async addTranslationsToFiles(key: string, entries: TranslationEntry[]) {
    const project = this.createProject();

    for (const entry of entries) {
      const file = project.addSourceFileAtPath(entry.file);
      const initializer = this.getTranslationObjectOfFile(file);
      if (!initializer) {
        return new Error(`Missing translations for ${entry.lang}`);
      }

      const indexOfNewProp = this.findIndexForNewKey(initializer, key);
      const quoteKind = this.getQuoteKind(initializer);
      const escapedValue = this.escapeTranslation(entry.value, quoteKind);

      initializer.insertPropertyAssignment(indexOfNewProp, {
        name: `${quoteKind}${key}${quoteKind}`,
        initializer: `${quoteKind}${escapedValue}${quoteKind}`,
      });
    }

    await project.save();
  }

  private escapeTranslation(translation: string, quote: QuoteKind) {
    const pattern = new RegExp(`(${quote})`, "g");
    return translation.replace(pattern, "\\$1");
  }

  private getQuoteKind(obj: ObjectLiteralExpression) {
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

  private findIndexForNewKey(obj: ObjectLiteralExpression, key: string) {
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

  private getTranslationObjectOfFile(
    file: SourceFile
  ): ObjectLiteralExpression | undefined {
    const pattern = this.configService.getValue(
      configs.translationVariablePattern
    );
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

  private createProject() {
    const config = this.configService.getValue(configs.identationType);
    const indentation =
      indentationMapping[config] ?? indentationMapping["2 spaces"];

    const project = new Project({
      manipulationSettings: {
        indentationText: indentation,
      },
    });

    return project;
  }
}
