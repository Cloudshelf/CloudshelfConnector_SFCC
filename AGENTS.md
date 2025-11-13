# Repository Guidelines

## Project Structure & Module Organization
The SFCC cartridge sits in `cartridges/int_cloudshelf/cartridge` with the usual `controllers/`, `models/`, `scripts/`, and `int_cloudshelf.properties`. GraphQL fragments live in `scripts/graphql/{queries,mutations}` and are bundled by the generator. Importable metadata, jobs, and services are under `data/site_template`, while `bin/initCloudshelfGraphql.js` is the only automation script. Tests mirror the cartridge under `test/unit/int_cloudshelf`, and longer-form docs live in `documentation/magidoc`.

## Build, Test, and Development Commands
- `node bin/initCloudshelfGraphql.js` — rebuilds `scripts/graphql/cloudshelfGraphqlQueries.js` after any `.graphql` change.
- `npm install` — installs only local developer tooling (Prettier 2.x, Mocha, Chai, etc.); this package manifest is isolated from the SFCC cartridge runtime.
- `npm run test:unit` (or `npm test`) — runs the Mocha suite under `test/unit/**`, matching the cartridge’s folder layout.
- To reuse SFRA’s harness, clone it into `storefront-reference-architecture/`, install its deps, then run `npm run test:unit -- --recursive ../CloudshelfConnector_SFCC/test/unit` from that repo.
- Deployment is a straight cartridge upload; use your preferred tool (e.g. `sfcc-ci code:upload`) to push `cartridges/int_cloudshelf`.

## Coding Style & Naming Conventions
JavaScript uses 4-space indents, single quotes, `'use strict';`, and CommonJS exports. Helpers use camelCase filenames; models follow `cloudshelf<Name>Model.js`. Keep GraphQL files near their scripts and let the generator rebuild the bundle. Run `npm run format` after edits so Prettier normalises JS/JSON/MD/GraphQL; for narrow scopes, run `npx prettier <path> --write`. `npm run format:check` gives a non-writing verification.

## Testing Guidelines
Specs run with Mocha, Chai, and Proxyquire. Mirror the cartridge tree when adding tests (e.g. new helper → `test/unit/int_cloudshelf/scripts/<helper>.spec.js`) and cover both success and error paths. If you add directories, update the SFRA harness or symlink so Mocha still finds them.

## Commit & Pull Request Guidelines
History follows short, present-tense commit subjects using conventional prefixes: start subjects with `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `build:`, or `breaking:` (for backwards-incompatible changes). Keep commits focused and include context or ticket references in the body when needed. Pull requests should describe the change, link related issues, call out metadata or configuration updates, and attach test results or manual verification notes. Screenshots are expected when UI behaviour changes.

## Security & Configuration Tips
Keep credentials out of git—set `cloudshelfAPIKey` in Business Manager. Review `data/site_template` archives before import so environment-specific endpoints or secrets are stripped or replaced.
