'use strict';

const assert = require('chai').assert;
const cloudshelfLogHelper = require('../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfLogHelper');
const queries = require('../../../../cartridges/int_cloudshelf/cartridge/scripts/graphql/cloudshelfGraphqlQueries');

describe('cloudshelf/cloudshelfLogHelper', function () {
    describe('describeRequest', function () {
        it('should name the operation, count the items and give their first and last id', function () {
            const products = [];
            for (let i = 1; i <= 170; i++) {
                products.push({ id: 'product-' + i, displayName: 'A product with a long description' });
            }

            const description = cloudshelfLogHelper.describeRequest({
                query: queries.mutation.UpsertProducts,
                variables: { input: products },
            });

            assert.equal(description, 'UpsertProducts, input: 170 items (product-1 to product-170)');
        });

        it('should give the product id of variation lists', function () {
            const description = cloudshelfLogHelper.describeRequest({
                query: queries.mutation.UpsertProductVariants,
                variables: { inputs: [{ productId: 'product-1', variants: [{}, {}] }] },
            });

            assert.equal(description, 'UpsertProductVariants, inputs: 1 item (product-1)');
        });

        it('should name the category of a product assignment', function () {
            const description = cloudshelfLogHelper.describeRequest({
                query: queries.mutation.AddProductsToProductGroup,
                variables: { productGroupId: 'category-1', productIds: ['product-1', 'product-2', 'product-3'] },
            });

            assert.equal(
                description,
                'AddProductsToProductGroup, productGroupId: category-1, productIds: 3 items (product-1 to product-3)',
            );
        });

        it('should leave out what was not sent', function () {
            const description = cloudshelfLogHelper.describeRequest({
                query: queries.query.Products,
                variables: { first: 250, after: null },
            });

            assert.equal(description, 'Products, first: 250');
        });

        it('should stay short however much the request carries', function () {
            const description = cloudshelfLogHelper.describeRequest({
                query: queries.mutation.ReportSyncStatus,
                variables: { syncStage: new Array(5001).join('x') },
            });

            assert.isBelow(description.length, 200);
        });

        it('should never throw', function () {
            assert.equal(cloudshelfLogHelper.describeRequest(null), 'unnamed request');
            assert.equal(cloudshelfLogHelper.describeRequest({ query: 'not graphql' }), 'unnamed request');
        });
    });

    describe('describeResponse', function () {
        it('should count what Cloudshelf saved and rejected', function () {
            const described = cloudshelfLogHelper.describeResponse({
                data: { upsertProducts: { products: [{ id: 'a' }, { id: 'b' }], userErrors: [] } },
            });

            assert.equal(described.text, 'upsertProducts: products 2, userErrors 0');
            assert.isFalse(described.hasProblem);
        });

        it('should give the first rejection and call it a problem', function () {
            const described = cloudshelfLogHelper.describeResponse({
                data: {
                    upsertLocations: {
                        locations: [],
                        userErrors: [{ code: 'INVALID', message: 'A location needs an address' }, { code: 'INVALID' }],
                    },
                },
            });

            assert.equal(
                described.text,
                'upsertLocations: locations 0, userErrors 2 (first: A location needs an address)',
            );
            assert.isTrue(described.hasProblem);
        });

        it('should count the rows of a page', function () {
            const described = cloudshelfLogHelper.describeResponse({
                data: {
                    productGroups: {
                        edges: [{ node: {} }, { node: {} }],
                        pageInfo: { hasNextPage: false },
                        totalCount: 2,
                    },
                },
            });

            assert.equal(described.text, 'productGroups: edges 2, totalCount 2');
            assert.isFalse(described.hasProblem);
        });

        it('should give a plain answer as it is', function () {
            const described = cloudshelfLogHelper.describeResponse({ data: { reportSyncStatus: true } });

            assert.equal(described.text, 'reportSyncStatus: true');
        });

        it('should give the first error with its code and tracing id', function () {
            const described = cloudshelfLogHelper.describeResponse({
                errors: [{ message: 'Not allowed', extensions: { code: 'FORBIDDEN', tracing: { traceId: 'abc' } } }],
                data: null,
            });

            assert.equal(
                described.text,
                'errors: 1, first: Not allowed, code FORBIDDEN, tracing {"traceId":"abc"}; no data',
            );
            assert.isTrue(described.hasProblem);
        });

        it('should call an answer it cannot read a problem', function () {
            assert.isTrue(cloudshelfLogHelper.describeResponse(null).hasProblem);
            assert.isTrue(cloudshelfLogHelper.describeResponse('<html>').hasProblem);
        });
    });

    describe('shorten', function () {
        it('should leave a short text alone', function () {
            assert.equal(cloudshelfLogHelper.shorten('short', 10), 'short');
        });

        it('should cut a long text and say how long it was', function () {
            assert.equal(cloudshelfLogHelper.shorten('0123456789abcdef', 10), '0123456789... (16 characters in all)');
        });

        it('should take a missing text as empty', function () {
            assert.equal(cloudshelfLogHelper.shorten(null, 10), '');
        });
    });

    describe('ProblemList', function () {
        it('should list every problem under the heading', function () {
            const problems = new cloudshelfLogHelper.ProblemList();
            problems.add('Products not sent: chunk 3');
            problems.add('Variations not sent: 12 variations');

            assert.equal(
                problems.describe('Product export summary.'),
                'Product export summary.\nProblems: 2:\n1. Products not sent: chunk 3\n2. Variations not sent: 12 variations',
            );
        });

        it('should count every problem and list only the first ones', function () {
            const problems = new cloudshelfLogHelper.ProblemList();
            for (let i = 1; i <= 500; i++) {
                problems.add('Problem ' + i);
            }

            const recap = problems.describe('Summary');

            assert.equal(problems.total, 500);
            assert.include(recap, 'Problems: 500. The first 20:');
            assert.include(recap, '20. Problem 20');
            assert.notInclude(recap, 'Problem 21');
        });
    });
});
