import { createTranslationCommand } from "./create-translation";
import { insertExistingTranslationKeyCommand } from "./insert-existing-translation-key";

export const commands = [insertExistingTranslationKeyCommand, createTranslationCommand];