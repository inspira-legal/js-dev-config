# @inspira-legal/dev-config

Shared dev config for Inspira Legal projects: oxlint, oxfmt, tsconfig, and i18n oxlint plugin.

## Setup

Configure GitHub Packages auth:

```sh
pnpm config set //npm.pkg.github.com/:_authToken=<YOUR_GITHUB_TOKEN>
```

Install:

```sh
pnpm add -D @inspira-legal/dev-config oxlint oxfmt cspell
```

## Usage

### oxlint

Create `.oxlintrc.json` in your project:

```json
{
  "extends": ["./node_modules/@inspira-legal/dev-config/src/.oxlintrc.json"],
  "jsPlugins": ["./node_modules/@inspira-legal/dev-config/plugins/i18n.mjs"],
  "ignorePatterns": ["src/generated/"],
  "rules": {
    "@inspira-legal/i18n/no-literal-string": "warn",
    "@inspira-legal/i18n/enforce-keys-sync": ["warn", {
      "baseLocale": "pt-BR",
      "localesDir": "src/lib/i18n/locales"
    }],
    "@inspira-legal/i18n/no-unused-keys": ["warn", {
      "baseLocale": "pt-BR",
      "localesDir": "src/lib/i18n/locales",
      "sourceDir": "src"
    }]
  },
  "overrides": [
    {
      "files": ["**/*.{spec,test}.{ts,tsx}", "tests/**/*.{ts,tsx}"],
      "rules": {
        "@inspira-legal/i18n/no-literal-string": "off",
        "react/only-export-components": "off"
      }
    }
  ]
}
```

### oxfmt

oxfmt does not support `extends`. Copy the base settings from `src/.oxfmtrc.json` and add your app-specific options (tailwind, import sorting):

```json
{
  "useTabs": false,
  "tabWidth": 2,
  "semi": false,
  "singleQuote": true,
  "bracketSpacing": true,
  "printWidth": 100,
  "arrowParens": "always",
  "trailingComma": "all",
  "bracketSameLine": false,
  "jsxSingleQuote": true,
  "endOfLine": "lf",
  "sortTailwindcss": {
    "stylesheet": "./src/your-tailwind.css",
    "functions": ["clsx", "cx", "cva"]
  },
  "sortImports": {
    "groups": ["builtin", "external", ["internal", "subpath"], ["parent", "sibling", "index"], "style", "unknown"],
    "newlinesBetween": true,
    "order": "asc",
    "ignoreCase": true,
    "internalPattern": ["@/"]
  }
}
```

### tsconfig

In your `tsconfig.json`:

```json
{
  "extends": "@inspira-legal/dev-config/src/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "jsx": "react-jsx"
  }
}
```

### cspell

Create `cspell.json` in your project:

```json
{
  "import": ["@inspira-legal/dev-config/src/cspell.json"],
  "words": ["your-project-specific-words"]
}
```

### Scripts

```json
{
  "scripts": {
    "lint": "oxfmt . && oxlint --fix --deny-warnings .",
    "lint:check": "oxfmt --check . && oxlint --deny-warnings .",
    "spell:check": "cspell \"src/**/*.{ts,tsx}\"",
    "format": "oxfmt ."
  }
}
```

## i18n Plugin Rules

| Rule | Description |
|------|-------------|
| `@inspira-legal/i18n/no-literal-string` | Detects untranslated strings in JSX |
| `@inspira-legal/i18n/enforce-keys-sync` | Ensures locale JSON files are in sync across locales |
| `@inspira-legal/i18n/no-unused-keys` | Detects translation keys not referenced in source code |

## Development

```sh
pnpm install
pnpm test
```
