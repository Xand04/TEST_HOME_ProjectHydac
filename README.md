# Project Hydac - Kundenmarkt-Scout

Kundenmarkt-Scout is a web app for preparing customer conversations using company information and news with source references.

The application lives in [`kundenmarkt-scout/`](kundenmarkt-scout/). See the [application README](kundenmarkt-scout/README.md) for configuration, data sources, optional integrations, and tests.

## Run locally

Requires Node.js 22.13 or newer and npm.

```sh
cd kundenmarkt-scout
npm install
npm run dev
```

The default local address is http://127.0.0.1:5173.

After installing the application dependencies, you can also launch it from the repository root with Python 3.12 or newer, or run `main.py` from PyCharm:

```sh
python main.py
```

Optional environment configuration is documented in [`kundenmarkt-scout/.env.example`](kundenmarkt-scout/.env.example). Local environment files, dependencies, generated output, and IDE settings are excluded from Git.
