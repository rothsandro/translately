# Translately

An extension to work with translations, managed in TypeScript files.

## Features

- Use the _Create translation_ command to create a new translation.
- Use the _Insert translation key_ command to insert an existing translation key into the current open file.

## Requirements

- All translations must be stored in TypeScript files (JSON is not supported).
- Path and name of the translation files can be configured
- Each language must have its own file
- Translation object must be stored in a variable (name of the variable can be configured)
- Translaton object must be flat, nested objects are not supported

### Example

```ts
// my-project/any/folder/en-us.ts
const translations = {
  "login.form.title": "Login",
  "login.form.submit-button.label": "Submit",
};

export default translations;
```
