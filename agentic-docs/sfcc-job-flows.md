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
   - Always builds a `cloudshelfProductVariantsModel`, passing `lastRunDate` so the model can filter stale variants during delta runs.
4. **write**
   - Deduplicates product and variant payloads within the chunk (guards against duplicate hits) while preserving insertion order.
   - Calls `cloudshelfApi.upsertProducts` once per chunk when there are product payloads. Logs success/failure counts.
   - Delegates variant exports to `exportChunksVariations`, which slices the variation payloads into sub-batches capped at ~150 variants per API request and calls `cloudshelfApi.upsertProductVariants` for each slice. Logs how many variants and API calls were performed.
5. **afterStep**
   - Logs accumulated counts (`countProcessed`, `countTotalVariations`).
   - Runs `exportProductGroups()` to synchronise category data:
     - Recursively walks the root category tree.
     - Builds `productGroup` models and matching `productsInProductGroup` assignments only when the category contains products and—during `DELTA` runs—was modified since the last export.
     - Batches `upsertProductGroups` calls in sets of 100 categories, then iterates `productsInProductGroup` payloads calling `updateProductsInProductGroup` to refresh product-to-category mapping.
   - Calls `cloudshelfHelper.createDefaultThemeIfNotExist()` and `cloudshelfHelper.createDefaultCloudshelfIfNotExist()` to guarantee Cloudshelf-side defaults exist.
   - Persists the new `runDate` via `jobsUtils.updateLastRunDate(...)` for future delta comparisons.

### Key Dependencies & Notes
- Respects job `params.jobMode` (`FULL` or `DELTA`) to minimise API traffic.
- Requires custom product/category models under `cartridges/int_cloudshelf/cartridge/models/cloudshelf/*`.
- Uses the shared `cloudshelfApiModel` to communicate with Cloudshelf.
- Assumes the site-wide root category ID is `root`; adjust the script if the catalog hierarchy differs.
- Tracks counts per chunk for log-based monitoring; no on-platform reporting is persisted beyond `jobsUtils`.

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
