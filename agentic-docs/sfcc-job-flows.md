# Cloudshelf SFCC Job Flows

This reference describes how the scheduled jobs in the Cloudshelf SFCC cartridge work end-to-end. Use it when reasoning about automation, debugging job runs, or extending the integration.

## Products Export to Cloudshelf (`custom.int_cloudshelf.ProductExport`)

**Script**: `cartridges/int_cloudshelf/cartridge/scripts/jobs/cloudShelf/productsExportToCloudShelf.js`  
**Type**: Step job (beforeStep/read/process/write/afterStep)  
**Purpose**: Publish SFCC products, their variant details, and category assignments to Cloudshelf, and ensure default Themes/Cloudshelf records exist.

### Flow
1. **beforeStep**
   - Captures the current `runDate` and reads the job `params.jobMode` (`DELTA` vs `FULL`).
   - Resolves the previous run timestamp via `jobsUtils.getLastRunDate('custom.int_cloudshelf.ProductExport')`.
   - Builds an SFCC `ProductSearchModel` rooted at the `root` category (recursive) to iterate every online product; stores the search hit iterator, root category, and total hit count.
2. **getTotalCount / read**
   - `getTotalCount` logs and returns the total hit count for progress tracking.
   - `read` streams individual `ProductSearchHit` objects from the iterator until exhausted.
3. **process**
   - Skips product bundles, sets, and option products; only considers standard and master/variant products.
   - Creates a `cloudshelfProductModel` if the product is in scope. In `DELTA` mode this only happens when `lastModified > lastRunDate`; otherwise an empty model is returned to suppress redundant exports.
   - Always builds a `cloudshelfProductVariantsModel`, passing `lastRunDate`. During delta runs a variant modified since the last run is built in full; every other variant is built with only its id, prices and stock flags. Prices and stock come from price books and inventory, so they change without the product's `lastModified` moving, and a delta run has to send them for every variant to keep Cloudshelf in step.
4. **write**
   - Deduplicates product and variant payloads within the chunk (guards against duplicate hits) while preserving insertion order.
   - Calls `cloudshelfApi.upsertProducts` once per chunk when there are product payloads. Logs success/failure counts.
   - Delegates variant exports to `exportChunksVariations`, which slices the variation payloads into sub-batches capped at ~150 variants per API request and calls `cloudshelfApi.upsertProductVariants` for each slice. Logs how many variants and API calls were performed.
5. **afterStep**
   - Receives `success` from SFCC, which calls `afterStep` even when a chunk threw. When it is not `true` the step read only part of the catalogue: nothing is removed from Cloudshelf and the last run date is not moved on.
   - Logs accumulated counts (`countProcessed`, `countTotalVariations`).
   - In `FULL` mode, calls `cloudshelfRemovalHelper.removeMissing(...)` with the ids `write` collected for every product and variant it read. The helper pages through the products Cloudshelf holds, and deletes the products and variants with this connector's global ids that the export did not read (`deleteProducts`, `deleteProductVariants`). Controlled by the `removeMissing` job parameter: `ON` (default) refuses to delete more than half of the products, `OFF` deletes nothing, `NO_LIMIT` lifts the limit.
   - Runs `exportProductGroups()` to synchronise category data:
     - Recursively walks the root category tree.
     - Builds `productGroup` models and matching `productsInProductGroup` assignments only when the category contains products and—during `DELTA` runs—was modified since the last export. A delta run does not read the products of a category that has not changed.
     - Batches `upsertProductGroups` calls in sets of 100 categories, then sends each category's products with `ProductsInProductGroup.assign`. A category's products include those of its subcategories, so they are held and sent in batches of 5,000: the first batch with `updateProductsInProductGroup`, which replaces the category's products in Cloudshelf, and any further batches with `addProductsToProductGroup`, which adds to them. A category with 5,000 products or fewer is still one request. A batch Cloudshelf does not accept is logged as an error naming the category, which may hold only part of its products in Cloudshelf until the next export that sends it.
     - An error thrown here is logged and reported to Cloudshelf as `FAILED` before the job stops, because the catalog stats step that would end the sync never runs.
   - In `FULL` mode, calls `cloudshelfRemovalHelper.removeMissingCategories(...)` with the id of every online category the walk found, with or without products. The helper pages through the product groups Cloudshelf holds and deletes those with this connector's global ids that the walk did not find (`deleteProductGroups`). The products of a removed category stay; Cloudshelf also removes the tiles that showed it. A category that is still online but has no products any more is not exported, so the same pass clears it: when Cloudshelf still holds products for it, the helper sends it an empty product list (`updateProductsInProductGroup`). Both follow the `removeMissing` job parameter, and with `ON` the helper refuses to delete more than half of the categories or to empty more than half of the ones that hold products.
   - Calls `cloudshelfHelper.createDefaultThemeIfNotExist()` and `cloudshelfHelper.createDefaultCloudshelfIfNotExist()` to guarantee Cloudshelf-side defaults exist.
   - Logs a one-line `Product export summary` (mode, previous run, product hits read, products sent, variants sent in full, variants sent with price and stock only, variant API calls, failed calls, variants rejected by Cloudshelf). Variants count as sent only when Cloudshelf took the call they were in. Rejected variants are also logged as warnings, with Cloudshelf's reason, when the call that carried them returns.
   - When anything went wrong, ends with one warning that repeats the summary and lists the first 20 problems (`cloudshelfLogHelper.ProblemList`). See Logging below.
   - Persists the new `runDate` via `jobsUtils.updateLastRunDate(...)` for future delta comparisons.

### Sync status
Both export jobs tell Cloudshelf how the sync is going through `cloudshelfHelper.reportSyncStatus(...)` (the `reportSyncStatus` mutation), so the Cloudshelf Manager can show it whether the job was started from Cloudshelf, by its schedule or by hand:
- `beforeStep` of the product export reports `REQUEST_PRODUCTS` and clears earlier errors.
- `afterStep` reports `FAILED` when the step stopped on an error, otherwise `PROCESS_PRODUCT_GROUPS`, with an error entry when Cloudshelf rejected variations or requests failed.
- The catalog stats step is the last step of both jobs. It reports `DONE` once the stats are in, or `FAILED`.

A status that cannot be reported is logged as a warning and never stops the export.

### Key Dependencies & Notes
- Respects job `params.jobMode` (`FULL` or `DELTA`) to minimise API traffic. `DELTA` still sends one small price-and-stock record per variant on every run; Cloudshelf only writes the ones whose values changed.
- Requires custom product/category models under `cartridges/int_cloudshelf/cartridge/models/cloudshelf/*`.
- Uses the shared `cloudshelfApiModel` to communicate with Cloudshelf. A request that gets no answer (a dropped connection, a timeout) or a server error is sent once more before it counts as failed; a request Cloudshelf refuses is not. Every request the cartridge makes can be repeated safely.
- SFCC's script engine does not scope `const` to a block. Declaring the same `const` twice in one function, even in separate blocks, stops the script compiling, and SFCC then refuses to start the job with "the job is invalid". Unit specs run in Node and do not catch this.
- Assumes the site-wide root category ID is `root`; adjust the script if the catalog hierarchy differs.
- No on-platform reporting is persisted beyond `jobsUtils`; what a run did is in its log.
- SFCC stops a script whose object holds more than 2,000 properties (quota `api.jsObjectSize`) or whose array holds more than 20,000 elements (quota `api.jsArraySize`). Never collect a catalogue's ids, or a category's products, as the keys of one object or in one array: use `cloudshelfRemovalHelper.IdSet`, which spreads them over many small objects, or keep them as batches the way `productsInProductGroup` does. The catalog stats step counts unique products and variants with an `IdSet`, and counts categories with `ProductsInProductGroup.hasProducts`, which does not collect their products.

### Logging
SFCC stops writing to a log file once it reaches 10 MB in a day, and everything after that, errors included, is lost. One request for a chunk of products is around 150 KB, so nothing may log a request or an answer in full at info level, and nothing may log a line for every chunk or every product. Keep to these rules when adding log lines:
- **Per run, not per chunk.** The product export logs a `Product export progress` line every 2,500 product hits and one summary at the end. Lines for each chunk are at debug level. One line for each category is kept, because "why does this category hold N products" is a common support question.
- **A failure line stands on its own.** It says what was being sent, with the first and last id, and why. `cloudshelfApiModel` logs every failed request with `cloudshelfLogHelper.describeRequest(...)`, the number of attempts, the time taken and the reason; `CloudshelfApiModel.getLastFailure()` gives a job step that reason for its own line. Error texts are cut to 1,000 characters.
- **Problems are repeated at the end.** `reportProblem(...)` in the product export logs an error and keeps it; `afterStep` logs the summary and the first 20 problems as one warning. Warnings and errors are written whatever the instance's Custom Log Settings are; info lines only when info logging is switched on there, so a line support needs must not be info only.
- **Pass text as an argument, never as the message.** SFCC's logger treats the message as a pattern, so braces or apostrophes in it are read as formatting. Log a built text with `logger.error('{0}', text)`.
- **The service communication log** (`service-cloudshelf-graphql-*.log`) is written by SFCC for every call, on production too, because the service implements the log callbacks. `getRequestLogMessage` and `getResponseLogMessage` in `cloudshelfHttpGraphQL.js` return one line each (`cloudshelfLogHelper.describeRequest` / `describeResponse`): the operation, the number of items with their first and last id, the HTTP status and what Cloudshelf saved or rejected. The answer and the request are added, cut to 2,000 characters, only when the answer carries an error, a rejection or no data. With SFCC's own lines around them a call costs about 0.6 KB: measured on a catalogue of 21,000 products, a full export makes 662 calls and writes 408 KB to the service log and 19 KB to its job log, a delta export 271 calls, 173 KB and 6 KB.
- Full API responses are logged at debug level only (log category `graphql`).

### Cartridge version
`cartridge/scripts/cloudshelfVersion.js` holds the version of the cartridge. Every request to Cloudshelf carries it as the User-Agent (`Cloudshelf-Salesforce-Connector/v1.2.0`, the same form the Shopify connector uses), which Cloudshelf's API records on the request's trace, and the product export writes it in its first log line and in its summary. Change it with every release, together with `version` in `package.json` and `package-lock.json`; a spec fails when they differ.

## Export Locations to Cloudshelf

**Script**: `cartridges/int_cloudshelf/cartridge/scripts/jobs/cloudShelf/exportLocationsToCloudShelf.js`  
**Type**: Step job  
**Purpose**: Push SFCC store records flagged for Cloudshelf to the external service.

### Flow
1. **beforeStep**
   - Aborts early when the job parameter `isDisable` is true (useful for on-demand toggling).
   - Queries `SystemObjectMgr` for `Store` objects whose `custom.isCloudshelf` attribute is true, ordered by newest first, and stores the iterator.
   - Logs the total count discovered.
2. **getTotalCount / read**
   - `getTotalCount` exposes the iterator size; `read` returns one `Store` object per invocation until the cursor is exhausted.
3. **process**
   - Wraps each `Store` in a `cloudshelfLocationModel` which formats payloads for the API.
4. **write**
   - Instantiates `cloudshelfApiModel` and calls `upsertLocations` with the chunked array of location models.
   - Logs how many stores were exported in the batch.
5. **afterChunk / afterStep**
   - No-op placeholders; the job relies entirely on chunk processing.

### Key Dependencies & Notes
- Only stores explicitly marked with `custom.isCloudshelf` are exported; ensure Business Manager data maintenance keeps that field accurate.
- Entirely additive/upsert behaviour; deletions are not handled here.
- Logging is handled through `cloudshelfHelper.getLogger()` for consistent log categories.

## Order Status Update

**Script**: `cartridges/int_cloudshelf/cartridge/scripts/jobs/cloudShelf/orderStatusUpdate.js`  
**Type**: Simple job (`module.exports.execute`)  
**Purpose**: Synchronise order fulfilment state transitions (Paid or Cancelled/Void) from SFCC to Cloudshelf.

### Flow
1. **execute**
   - Logs the run context, then fetches two order cohorts using `OrderMgr.processOrders`:
     - **Paid orders**: Orders with `paymentStatus === PAID`, `status !== CANCELLED`, `custom.isCloudshelf === true`, and stale `custom.cloudshelfStatus !== 'PAID'`.
     - **Cancelled orders**: Orders whose lifecycle `status === CANCELLED`, `custom.isCloudshelf === true`, and `custom.cloudshelfStatus !== 'VOIDED'`.
   - Each order passes to `processOrder`.
   - Returns `new Status(Status.OK)` once both cohorts are processed.
2. **processOrder**
   - Instantiates `cloudshelfApiModel` and `cloudshelfOrderModel`.
   - Determines whether the order is cancelled; maps to Cloudshelf status `PAID` or `VOIDED`.
   - Calls `cloudshelfApi.upsertOrders` with a single order payload to push the update.
   - Wraps updates to `order.custom.cloudshelfStatus` inside `Transaction.wrap` to persist the new status on the SFCC side, preventing duplicate exports in future runs.
   - Logs each order number after successful synchronisation.

### Key Dependencies & Notes
- Relies on custom order attributes `custom.isCloudshelf` and `custom.cloudshelfStatus`.
- Uses `cloudshelfOrderModel` to shape the payload expected by the API; make changes there when the data contract evolves.
- The job does not currently handle other order states (e.g., refunded). Extend the status map if Cloudshelf introduces additional transitions.
- Because `OrderMgr.processOrders` batches internally, the job stays lightweight without explicit chunk handling.

## Report Catalog Stats

**Script**: `cartridges/int_cloudshelf/cartridge/scripts/jobs/cloudShelf/reportCatalogStats.js`  
**Type**: Simple job (`module.exports.execute`)  
**Purpose**: Recompute full-catalog metrics (product, variant, image, and product-group counts) and submit them to Cloudshelf via the `reportCatalogStats` GraphQL mutation.

### Flow
1. **execute**
   - Resolves the root category (defaults to `root`, override with the `categoryID` job param) and builds a recursive `ProductSearchModel` identical to the product-export step.
   - Iterates every eligible product search hit (skipping bundles, sets, option products) and instantiates the existing `cloudshelfProductModel` and `cloudshelfProductVariantsModel` to mirror export-time transformations.
   - Totals unique product ids, variant ids, and variant meta-images while the models are built so counts match a full export run.
   - Recursively walks the online category tree using `ProductsInProductGroup` to count product groups exactly as the export step would during a FULL run.
   - Normalises the optional `retailerClosed` parameter to a boolean and calls `cloudshelfApi.reportCatalogStats` with the aggregate payload. Logs the payload on success and returns `Status.OK`; returns `Status.ERROR` when the API yields no response.

### Key Dependencies & Notes
- Leverages the same product and category models used during export, ensuring counts stay aligned with what Cloudshelf receives elsewhere.
- Always performs a full catalog traversal, even when the preceding export ran in DELTA mode, so stats remain absolute.
- The category walk uses `ProductsInProductGroup`, which issues nested product searches; expect additional processing time on very large catalogs.
- Wired into both `CloudshelfDataExportFull` and `CloudshelfDataExportDelta` flows as the final step in `data/site_template/jobs.xml`, so it runs immediately after the product export (and location export for FULL).

---

For cross-cutting concerns (API schema, helper models, or default object creation) consult the cartridge models under `cartridges/int_cloudshelf/cartridge/models/cloudshelf` and helper utilities in `scripts/helpers` & `scripts/utils`.
