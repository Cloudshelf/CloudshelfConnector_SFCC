'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const sinon = require('sinon');

const getMetadataStub = sinon.stub();
const categoryMock = {
    ID: 'laptops',
    getDisplayName: () => 'Laptops',
    getImage: () => {
        return {
            getAbsURL: () => {
                return {
                    toString: () => 'imageUrl'
                }
            }
        }
    }
}

describe('cloudshelf/ProductGroupModel', function () {
    const ProductGroupModel = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/productGroup.js', {
        '*/cartridge/scripts/helpers/cloudshelfHelper': {
            GLOBAL_ID_NAMESPACES: {
                PRODUCT_GROUP: 'PRODUCT_GROUP'
            },
            getGlobalId: (type, id) => {
                return type + '/' + id;
            },
            getMetadata: getMetadataStub
        }
    });

    beforeEach(function () {
        getMetadataStub.reset();
    });

    it('should create productGroup model with all details', function () {
        const result = new ProductGroupModel(categoryMock);
        assert.equal(result.id, 'PRODUCT_GROUP/laptops');
        assert.equal(result.displayName, 'Laptops');
        assert.equal(result.featuredImage.url, 'imageUrl');
        assert.isTrue(getMetadataStub.calledOnce);
    });
});
