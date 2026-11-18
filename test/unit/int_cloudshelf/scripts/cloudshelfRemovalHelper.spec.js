'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

const productId = id => 'gid://external/salesforceProduct/' + id;
const variantId = id => 'gid://external/salesforceVariant/' + id;

const cloudshelfProduct = (platformProvidedId, variantIds) => ({
    node: {
        id: 'gid://cloudshelf/Product/' + platformProvidedId,
        platformProvidedId: platformProvidedId,
        productVariants: (variantIds || []).map(id => ({
            id: 'gid://cloudshelf/ProductVariant/' + id,
            platformProvidedId: id,
        })),
    },
});

describe('cloudshelf/cloudshelfRemovalHelper', function () {
    let logged;
    let pages;
    let deletedProducts;
    let deletedVariants;
    let failDeletes;

    const logger = {};
    ['info', 'warn', 'error'].forEach(level => {
        logger[level] = function () {
            logged.push({ level: level, message: arguments[0] });
        };
    });

    const helper = proxyquire(
        '../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfRemovalHelper',
        {
            '*/cartridge/scripts/helpers/cloudshelfHelper': {
                GLOBAL_ID_NAMESPACES: {
                    PRODUCT: 'salesforceProduct',
                    VARIANT: 'salesforceVariant',
                    PRODUCT_GROUP: 'salesforceCategory',
                },
                getLogger: () => logger,
            },
        },
    );

    const api = {
        getProducts: (first, after) => {
            const index = after ? Number(after) : 0;
            const page = pages[index];
            if (!page) {
                return null;
            }
            return {
                products: {
                    edges: page,
                    pageInfo: { endCursor: String(index + 1), hasNextPage: index + 1 < pages.length },
                },
            };
        },
        deleteProducts: ids => {
            if (failDeletes) {
                return null;
            }
            deletedProducts = deletedProducts.concat(ids);
            return { deleteProducts: { products: ids.map(id => ({ id: id })), userErrors: [] } };
        },
        deleteProductVariants: ids => {
            if (failDeletes) {
                return null;
            }
            deletedVariants = deletedVariants.concat(ids);
            return { deleteProductVariants: { productVariants: ids.map(id => ({ id: id })), userErrors: [] } };
        },
    };

    const known = (products, variants) => {
        const result = { products: new helper.IdSet(), variants: new helper.IdSet() };
        products.forEach(id => {
            result.products.add(productId(id));
        });
        (variants || []).forEach(id => {
            result.variants.add(variantId(id));
        });
        return result;
    };

    const errors = () => logged.filter(entry => entry.level === 'error');

    beforeEach(function () {
        logged = [];
        deletedProducts = [];
        deletedVariants = [];
        failDeletes = false;
        pages = [
            [
                cloudshelfProduct(productId('shirt'), [variantId('shirt-s'), variantId('shirt-m')]),
                cloudshelfProduct(productId('hat'), [variantId('hat-one')]),
            ],
            [
                cloudshelfProduct(productId('scarf'), [variantId('scarf-one')]),
                cloudshelfProduct('gid://external/otherSource/gift-card', ['gid://external/otherSource/gift-card-1']),
            ],
        ];
    });

    describe('IdSet', function () {
        it('should hold a whole catalogue without any object growing past the SFCC property limit', function () {
            const set = new helper.IdSet();
            for (let i = 0; i < 250000; i++) {
                set.add(variantId(String(700000000000 + i) + 'M'));
            }

            assert.equal(set.size, 250000);
            assert.isTrue(set.has(variantId('700000000000M')));
            assert.isTrue(set.has(variantId('700000249999M')));
            assert.isFalse(set.has(variantId('700000250000M')));
            assert.isAtMost(set.buckets.length, 2000);
            set.buckets.forEach(parts => {
                assert.isAtMost(parts.length, 2000);
                parts.forEach(part => {
                    assert.isAtMost(Object.keys(part.ids).length, helper.ID_SET_MAX_KEYS_PER_OBJECT);
                });
            });
        });

        it('should start a new object when one is full', function () {
            const set = new helper.IdSet();
            // Enough ids that at least one of the buckets has to overflow
            for (let i = 0; i < 2000000; i += 1) {
                set.add('id-' + i);
            }

            assert.isTrue(set.buckets.some(parts => parts.length > 1));
            assert.isTrue(set.has('id-0'));
            assert.isTrue(set.has('id-1999999'));
        });

        it('should say whether an id was new', function () {
            const set = new helper.IdSet();

            assert.isTrue(set.add('a'));
            assert.isFalse(set.add('a'));
            assert.equal(set.size, 1);
            assert.isFalse(set.has('constructor'));
        });
    });

    describe('getMode', function () {
        it('should default to ON', function () {
            assert.equal(helper.getMode(undefined), 'ON');
            assert.equal(helper.getMode(''), 'ON');
            assert.equal(helper.getMode('something else'), 'ON');
        });

        it('should read OFF and NO_LIMIT in any case', function () {
            assert.equal(helper.getMode('off'), 'OFF');
            assert.equal(helper.getMode('NO_LIMIT'), 'NO_LIMIT');
        });
    });

    describe('removeMissing', function () {
        it('should remove nothing when SFCC still has everything', function () {
            const summary = helper.removeMissing(
                api,
                known(['shirt', 'hat', 'scarf'], ['shirt-s', 'shirt-m', 'hat-one', 'scarf-one']),
                'ON',
            );

            assert.deepEqual(deletedProducts, []);
            assert.deepEqual(deletedVariants, []);
            assert.isNull(summary.skipped);
            assert.lengthOf(errors(), 0);
        });

        it('should remove a product SFCC no longer has, across pages', function () {
            const summary = helper.removeMissing(api, known(['shirt', 'hat'], ['shirt-s', 'shirt-m', 'hat-one']), 'ON');

            assert.deepEqual(deletedProducts, [productId('scarf')]);
            // The product's own variations go with it, so they are not deleted one by one
            assert.deepEqual(deletedVariants, []);
            assert.equal(summary.removedProducts, 1);
        });

        it('should remove a variation SFCC no longer has from a product it still has', function () {
            const summary = helper.removeMissing(
                api,
                known(['shirt', 'hat', 'scarf'], ['shirt-m', 'hat-one', 'scarf-one']),
                'ON',
            );

            assert.deepEqual(deletedProducts, []);
            assert.deepEqual(deletedVariants, [variantId('shirt-s')]);
            assert.equal(summary.removedVariants, 1);
        });

        describe('a product whose id changed in SFCC', function () {
            // SFCC now has the shirt as "shirtM" with one variation, shirt-m. Cloudshelf still has it as "shirt".
            it('should be kept while Cloudshelf still holds the variation SFCC has under it', function () {
                const summary = helper.removeMissing(
                    api,
                    known(['shirtM', 'hat', 'scarf'], ['shirt-m', 'hat-one', 'scarf-one']),
                    'ON',
                );

                // Deleting "shirt" would delete shirt-m with it
                assert.deepEqual(deletedProducts, []);
                assert.equal(summary.missingProducts, 0);
                assert.equal(summary.keptProducts, 1);
                assert.include(logged.filter(entry => entry.level === 'warn')[0].message, 'Kept {0} products');
            });

            it('should still lose the variations SFCC no longer has', function () {
                helper.removeMissing(api, known(['shirtM', 'hat', 'scarf'], ['shirt-m', 'hat-one', 'scarf-one']), 'ON');

                assert.deepEqual(deletedVariants, [variantId('shirt-s')]);
            });

            it('should be removed when all it still holds is a variation made in Cloudshelf, which has no id', function () {
                pages[0] = [
                    cloudshelfProduct(productId('shirt'), [null]),
                    cloudshelfProduct(productId('hat'), [variantId('hat-one')]),
                ];

                const summary = helper.removeMissing(api, known(['hat', 'scarf'], ['hat-one', 'scarf-one']), 'ON');

                assert.deepEqual(deletedProducts, [productId('shirt')]);
                assert.equal(summary.keptProducts, 0);
            });

            it('should be removed once its variation has moved to the new product', function () {
                pages[0] = [
                    cloudshelfProduct(productId('shirt'), [variantId('shirt-s')]),
                    cloudshelfProduct(productId('shirtM'), [variantId('shirt-m')]),
                    cloudshelfProduct(productId('hat'), [variantId('hat-one')]),
                ];

                const summary = helper.removeMissing(
                    api,
                    known(['shirtM', 'hat', 'scarf'], ['shirt-m', 'hat-one', 'scarf-one']),
                    'ON',
                );

                assert.deepEqual(deletedProducts, [productId('shirt')]);
                assert.equal(summary.keptProducts, 0);
            });
        });

        it('should leave alone what did not come from this connector', function () {
            helper.removeMissing(
                api,
                known(['shirt', 'hat', 'scarf'], ['shirt-s', 'shirt-m', 'hat-one', 'scarf-one']),
                'ON',
            );
            helper.removeMissing(api, known(['shirt', 'hat'], ['shirt-s', 'shirt-m', 'hat-one']), 'NO_LIMIT');

            assert.notInclude(deletedProducts, 'gid://external/otherSource/gift-card');
            assert.notInclude(deletedVariants, 'gid://external/otherSource/gift-card-1');
        });

        it('should not remove products when more than half of them would go', function () {
            const summary = helper.removeMissing(api, known(['shirt'], ['shirt-s', 'shirt-m']), 'ON');

            assert.deepEqual(deletedProducts, []);
            assert.equal(summary.missingProducts, 2);
            assert.equal(summary.removedProducts, 0);
            assert.equal(summary.skipped, 'more than half of the products would be removed');
            assert.lengthOf(errors(), 1);
        });

        it('should remove however many are missing with NO_LIMIT', function () {
            const summary = helper.removeMissing(api, known(['shirt'], ['shirt-s', 'shirt-m']), 'NO_LIMIT');

            assert.deepEqual(deletedProducts, [productId('hat'), productId('scarf')]);
            assert.equal(summary.removedProducts, 2);
        });

        it('should do nothing when turned off', function () {
            const summary = helper.removeMissing(api, known(['shirt'], []), 'OFF');

            assert.deepEqual(deletedProducts, []);
            assert.deepEqual(deletedVariants, []);
            assert.equal(summary.skipped, 'the removeMissing job parameter is OFF');
        });

        it('should do nothing when the export read no products', function () {
            const summary = helper.removeMissing(api, known([], []), 'NO_LIMIT');

            assert.deepEqual(deletedProducts, []);
            assert.equal(summary.skipped, 'this export read no products from SFCC');
        });

        it('should do nothing when Cloudshelf cannot be read to the end', function () {
            pages[1] = null;
            const summary = helper.removeMissing(api, known(['shirt'], ['shirt-m']), 'NO_LIMIT');

            assert.deepEqual(deletedProducts, []);
            assert.deepEqual(deletedVariants, []);
            assert.equal(summary.skipped, 'the products Cloudshelf holds could not be read');
            assert.lengthOf(errors(), 1);
        });

        it('should report a delete Cloudshelf refused and carry on', function () {
            failDeletes = true;
            const summary = helper.removeMissing(api, known(['shirt', 'hat'], ['shirt-m', 'hat-one']), 'ON');

            assert.equal(summary.missingProducts, 1);
            assert.equal(summary.missingVariants, 1);
            assert.equal(summary.removedProducts, 0);
            assert.equal(summary.removedVariants, 0);
            assert.equal(summary.failedCalls, 2);
            assert.lengthOf(errors(), 2);
        });
    });
    describe('removeMissingCategories', function () {
        const categoryId = id => 'gid://external/salesforceCategory/' + id;
        const cloudshelfCategory = (platformProvidedId, productCount) => ({
            node: {
                id: 'gid://cloudshelf/ProductGroup/' + platformProvidedId,
                platformProvidedId: platformProvidedId,
                productCount: productCount === undefined ? 5 : productCount,
            },
        });
        let categoryPages;
        let deletedCategories;
        let emptiedCategories;
        let failCategoryDeletes;
        let failEmptying;
        let unreadablePage;

        const categoryApi = {
            getProductGroups: (first, after) => {
                const index = after ? Number(after) : 0;
                const page = categoryPages[index];
                if (!page || index === unreadablePage) {
                    return null;
                }
                return {
                    productGroups: {
                        edges: page,
                        pageInfo: { endCursor: String(index + 1), hasNextPage: index + 1 < categoryPages.length },
                    },
                };
            },
            updateProductsInProductGroup: (productGroupId, productIds) => {
                if (failEmptying) {
                    return null;
                }
                emptiedCategories.push({ id: productGroupId, productIds: productIds });
                return { updateProductsInProductGroup: true };
            },
            deleteProductGroups: ids => {
                if (failCategoryDeletes) {
                    return null;
                }
                deletedCategories = deletedCategories.concat(ids);
                return { deleteProductGroups: { productGroups: ids.map(id => ({ id: id })), userErrors: [] } };
            },
        };
        // What an export found: the online categories, and which of them had no products
        const knownCategories = (ids, idsWithoutProducts) => {
            const result = { online: new helper.IdSet(), withoutProducts: new helper.IdSet() };
            ids.forEach(id => {
                result.online.add(categoryId(id));
            });
            (idsWithoutProducts || []).forEach(id => {
                result.withoutProducts.add(categoryId(id));
            });
            return result;
        };

        beforeEach(function () {
            deletedCategories = [];
            emptiedCategories = [];
            failCategoryDeletes = false;
            failEmptying = false;
            unreadablePage = -1;
            categoryPages = [
                [cloudshelfCategory(categoryId('womens')), cloudshelfCategory(categoryId('mens'))],
                [
                    cloudshelfCategory(categoryId('sale')),
                    cloudshelfCategory('gid://external/otherSource/staff-picks'),
                    // A group made in Cloudshelf has no platform id
                    cloudshelfCategory(null),
                ],
            ];
        });

        it('should remove nothing when SFCC still has every category', function () {
            const summary = helper.removeMissingCategories(categoryApi, knownCategories(['womens', 'mens', 'sale']), 'ON');

            assert.deepEqual(deletedCategories, []);
            assert.equal(summary.missingCategories, 0);
            assert.isNull(summary.skipped);
        });

        it('should remove a category SFCC no longer has, across pages', function () {
            const summary = helper.removeMissingCategories(categoryApi, knownCategories(['womens', 'mens']), 'ON');

            assert.deepEqual(deletedCategories, [categoryId('sale')]);
            assert.equal(summary.removedCategories, 1);
            assert.isNull(summary.skipped);
        });

        it('should leave alone what did not come from this connector', function () {
            helper.removeMissingCategories(categoryApi, knownCategories(['womens', 'mens']), 'ON');

            assert.notInclude(deletedCategories, 'gid://external/otherSource/staff-picks');
            assert.lengthOf(deletedCategories, 1);
        });

        it('should not remove categories when more than half of them would go', function () {
            const summary = helper.removeMissingCategories(categoryApi, knownCategories(['womens']), 'ON');

            assert.deepEqual(deletedCategories, []);
            assert.equal(summary.missingCategories, 2);
            assert.equal(summary.skipped, 'more than half of the categories would be removed');
            assert.lengthOf(errors(), 1);
        });

        it('should remove however many are missing with NO_LIMIT', function () {
            const summary = helper.removeMissingCategories(categoryApi, knownCategories(['womens']), 'NO_LIMIT');

            assert.deepEqual(deletedCategories, [categoryId('mens'), categoryId('sale')]);
            assert.equal(summary.removedCategories, 2);
        });

        it('should do nothing when turned off', function () {
            const summary = helper.removeMissingCategories(categoryApi, knownCategories(['womens', 'mens']), 'OFF');

            assert.deepEqual(deletedCategories, []);
            assert.isString(summary.skipped);
        });

        it('should do nothing when the export found no categories', function () {
            const summary = helper.removeMissingCategories(categoryApi, knownCategories([]), 'NO_LIMIT');

            assert.deepEqual(deletedCategories, []);
            assert.isString(summary.skipped);
        });

        it('should do nothing when Cloudshelf cannot be read to the end', function () {
            unreadablePage = 1;

            const summary = helper.removeMissingCategories(categoryApi, knownCategories(['womens']), 'NO_LIMIT');

            assert.deepEqual(deletedCategories, []);
            assert.equal(summary.skipped, 'the categories Cloudshelf holds could not be read');
        });

        it('should report a delete Cloudshelf refused', function () {
            failCategoryDeletes = true;

            const summary = helper.removeMissingCategories(categoryApi, knownCategories(['womens', 'mens']), 'ON');

            assert.equal(summary.removedCategories, 0);
            assert.equal(summary.failedCalls, 1);
            assert.isAtLeast(errors().length, 1);
        });

        describe('a category that is still online but has no products any more', function () {
            it('should be emptied and kept', function () {
                const summary = helper.removeMissingCategories(
                    categoryApi,
                    knownCategories(['womens', 'mens', 'sale'], ['sale']),
                    'ON',
                );

                assert.deepEqual(emptiedCategories, [{ id: categoryId('sale'), productIds: [] }]);
                assert.deepEqual(deletedCategories, []);
                assert.equal(summary.emptiedCategories, 1);
                assert.isNull(summary.emptyingSkipped);
            });

            it('should be left alone when Cloudshelf already holds no products for it', function () {
                categoryPages[1][0] = cloudshelfCategory(categoryId('sale'), 0);

                const summary = helper.removeMissingCategories(
                    categoryApi,
                    knownCategories(['womens', 'mens', 'sale'], ['sale']),
                    'ON',
                );

                assert.deepEqual(emptiedCategories, []);
                assert.equal(summary.categoriesToEmpty, 0);
            });

            it('should not be emptied when more than half of the categories with products would be', function () {
                const summary = helper.removeMissingCategories(
                    categoryApi,
                    knownCategories(['womens', 'mens', 'sale'], ['womens', 'sale']),
                    'ON',
                );

                assert.deepEqual(emptiedCategories, []);
                assert.equal(summary.categoriesToEmpty, 2);
                assert.equal(
                    summary.emptyingSkipped,
                    'more than half of the categories that hold products would be emptied',
                );
                assert.lengthOf(errors(), 1);
            });

            it('should be emptied however many there are with NO_LIMIT', function () {
                helper.removeMissingCategories(
                    categoryApi,
                    knownCategories(['womens', 'mens', 'sale'], ['womens', 'sale']),
                    'NO_LIMIT',
                );

                assert.deepEqual(
                    emptiedCategories.map(category => category.id),
                    [categoryId('womens'), categoryId('sale')],
                );
            });

            it('should not be emptied when removal is turned off', function () {
                helper.removeMissingCategories(
                    categoryApi,
                    knownCategories(['womens', 'mens', 'sale'], ['sale']),
                    'OFF',
                );

                assert.deepEqual(emptiedCategories, []);
            });

            it('should be reported when Cloudshelf refuses to empty it', function () {
                failEmptying = true;

                const summary = helper.removeMissingCategories(
                    categoryApi,
                    knownCategories(['womens', 'mens', 'sale'], ['sale']),
                    'ON',
                );

                assert.equal(summary.emptiedCategories, 0);
                assert.equal(summary.failedCalls, 1);
                assert.isAtLeast(errors().length, 1);
            });

            it('should not touch a category from another source', function () {
                categoryPages[1][1] = cloudshelfCategory('gid://external/otherSource/sale', 9);

                helper.removeMissingCategories(
                    categoryApi,
                    knownCategories(['womens', 'mens', 'sale'], ['sale']),
                    'ON',
                );

                assert.deepEqual(
                    emptiedCategories.map(category => category.id),
                    [categoryId('sale')],
                );
            });
        });
    });
});
