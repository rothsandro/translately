import { IndentationText } from "ts-morph";

export interface ConfigEntry<T = string> {
  readonly key: string;
  readonly defaultValue: T;
}

export const keyInsertPatternConfig: ConfigEntry<string> = {
  key: "translately.keyInsertPattern",
  defaultValue: "%KEY%",
};

export const translationFilesIncludePatternConfig: ConfigEntry<string> = {
  key: "translately.translationFilesIncludePattern",
  defaultValue: "**/i18n/*.ts",
};

export const translationFilesExcludePatternConfig: ConfigEntry<string> = {
  key: "translately.translationFilesExcludePattern",
  defaultValue: "{**/dist/**,**/node_modules/**}",
};

export const translationVariablePattern: ConfigEntry<string> = {
  key: "translately.translationVariablePattern",
  defaultValue: "[a-z]{2}[A-Z]{2}",
};

export const identationTypeConfig: ConfigEntry<
  keyof typeof indentationMapping
> = {
  key: "translately.indentationType",
  defaultValue: "2 spaces",
};

export const indentationMapping = {
  "2 spaces": IndentationText.TwoSpaces,
  "4 spaces": IndentationText.FourSpaces,
  "8 spaces": IndentationText.EightSpaces,
  Tab: IndentationText.Tab,
} as const;
