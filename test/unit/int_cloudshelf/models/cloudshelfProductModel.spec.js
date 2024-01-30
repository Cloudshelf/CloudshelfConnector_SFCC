'use strict';
const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('cloudshelf/cloudshelfProductModel', function () {
    const cloudshelfHelperMock = {
        getGlobalId: (namespace, id) => 'gid://external/' + namespace + '/' + id,
        getMetadata: () => [],
        GLOBAL_ID_NAMESPACES: {
            PRODUCT: 'PRODUCT'
        }
    };

    const product = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelfProductModel.js', {
        '*/cartridge/scripts/helpers/cloudshelfHelper': cloudshelfHelperMock
    });

    it('should create product model with valid input', function () {
        const productSearchHitMock = {
            product: {
                ID: 'productId',
                name: 'ProductName',
                shortDescription: 'Short Description',
                longDescription: 'Long Description',
                bundle: false,
                productSet: false,
                optionProduct: false,
                primaryCategory: {
                    displayName: 'Sample Category'
                },
                allCategoryAssignments: [{
                    category: {
                        displayName: 'Sample Category'
                    }
                }],
                custom: {
                    cloudshelfTags: ['Tag1', 'Tag2']
                },
                brand: 'Sample Brand'
            },
            representedProducts: ['product1']
        };

        const result = new product(productSearchHitMock);
        if (productSearchHitMock.representedProducts.length > 1) {
            assert.equal(result.id, 'gid://external/PRODUCT/productId');
        } else {
            assert.equal(result.id, 'gid://external/PRODUCT/productIdM');
        }        
        assert.equal(result.displayName, 'ProductName');
        assert.equal(result.description, 'Short Description');
        assert.deepEqual(result.metadata, []);
        assert.equal(result.productType, 'Sample Category');
        assert.deepEqual(result.tags, ['Tag1', 'Tag2']);
        assert.equal(result.vendor, 'Sample Brand');
    });

    it('should not create product model with invalid input', function () {
        const productSearchHitMockBundle = {
            product: {
                ID: 'productId',
                name: 'ProductName',
                shortDescription: 'Short Description',
                longDescription: 'Long Description',
                bundle: true,
                productSet: false,
                optionProduct: false,
                primaryCategory: {
                    displayName: 'Sample Category'
                },
                allCategoryAssignments: [{
                    category: {
                        displayName: 'Sample Category'
                    }
                }],
                custom: {
                    cloudshelfTags: ['Tag1', 'Tag2']
                },
                brand: 'Sample Brand'
            },
            representedProducts: ['product1']
        };
        const result = new product(productSearchHitMockBundle);
        assert.deepEqual(result, {});
    });
});
