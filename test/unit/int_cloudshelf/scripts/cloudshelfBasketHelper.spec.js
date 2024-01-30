'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

require('babel-register')({
    plugins: ['babel-plugin-rewire']
});

const loggerSpy = {
    warn: sinon.spy()
};

const cartHelperStub = {
    addProductToCart: sinon.stub(),
    ensureAllShipmentsHaveMethods: sinon.stub()
};

const basketMgrStub = {
    getCurrentOrNewBasket: sinon.stub()
};

const transactionStub = {
    wrap: sinon.stub().callsFake((fn) => { fn(); })
};

const basketCalculationHelpersStub = {
    calculateTotals: sinon.stub()
};

describe('cloudshelf/cloudshelfBasketHelper', function () {
    const cloudshelfBasketHelper = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfBasketHelper', {
        'dw/order/BasketMgr': basketMgrStub,
        'dw/system/Transaction': transactionStub,
        '*/cartridge/scripts/cart/cartHelpers': cartHelperStub,
        '*/cartridge/scripts/helpers/basketCalculationHelpers': basketCalculationHelpersStub, 
        '*/cartridge/scripts/helpers/cloudshelfHelper': {
            getLogger: () => loggerSpy
        }
    });

    it('should return a valid object when data is provided', () => {
        const req = {
            querystring: {
                data: '{"key": "value"}'
            }
        };
        const result = cloudshelfBasketHelper.getCloudshelfDataFromRequest(req);
        assert.isObject(result);
        assert.deepEqual(result, { key: 'value' });
    });

    it('should return null when data is not provided or invalid', () => {
        const req = {
            querystring: {
                data: 'invalidJson'
            }
        };
        const result = cloudshelfBasketHelper.getCloudshelfDataFromRequest(req);
        assert.isNull(result);
    });

    it('should return true for valid cloudshelf basket data', () => {
        const validCloudshelfData = {
            productItems: ['item1', 'item2']
        };
        const result = cloudshelfBasketHelper.validateCloudshelfBasketData(validCloudshelfData);
        assert.isTrue(result);
    });

    it('should return false for null cloudshelf data', () => {
        const result = cloudshelfBasketHelper.validateCloudshelfBasketData(null);
        assert.isFalse(result);
    });

    it('should return false for undefined cloudshelf data', () => {
        const result = cloudshelfBasketHelper.validateCloudshelfBasketData(undefined);
        assert.isFalse(result);
    });

    it('should return false for cloudshelf data without productItems property', () => {
        const invalidCloudshelfData = {
            otherProperty: 'someValue'
        };
        const result = cloudshelfBasketHelper.validateCloudshelfBasketData(invalidCloudshelfData);
        assert.isFalse(result);
    });

    it('should log a warning when parsing fails', () => {
        const req = {
            querystring: {
                data: 'invalidJson'
            }
        };
        // Call the method that should log the warning
        cloudshelfBasketHelper.getCloudshelfDataFromRequest(req);
        assert.isTrue(loggerSpy.warn.called, 'Logger warn method should have been called');

    });
    // eslint-disable-next-line no-underscore-dangle
    const tryToCreateCloudshelfBasket = cloudshelfBasketHelper.__get__('tryToCreateCloudshelfBasket');
    it('should create a cloudshelf basket successfully', function() {
        // Sample cloudshelfData for testing
        const cloudshelfData = {
            productItems: [
                { productId: '123', quantity: '2' },
                { productId: '456', quantity: '1' }
            ]
        };
    
        const mockBasket = {
            custom: {}
        };
        // Setting up the stubs to mimic successful behavior
        cartHelperStub.addProductToCart.returns({ error: false });
        basketMgrStub.getCurrentOrNewBasket.returns(mockBasket);
    
        // Call the method with the test data
        tryToCreateCloudshelfBasket(cloudshelfData);
    
        // Assert that getCurrentOrNewBasket was called
        sinon.assert.calledOnce(basketMgrStub.getCurrentOrNewBasket);
    
        // Assert that addProductToCart was called for each product item
        sinon.assert.calledTwice(cartHelperStub.addProductToCart);
        sinon.assert.calledWith(cartHelperStub.addProductToCart.firstCall, sinon.match.any, '123', 2);
        sinon.assert.calledWith(cartHelperStub.addProductToCart.secondCall, sinon.match.any, '456', 1);
    
        // Assert that other methods like ensureAllShipmentsHaveMethods and calculateTotals were called
        sinon.assert.calledOnce(cartHelperStub.ensureAllShipmentsHaveMethods);
        sinon.assert.calledOnce(basketCalculationHelpersStub.calculateTotals);
    
        assert.isTrue(mockBasket.custom.isCloudshelf, 'isCloudshelf should be set to true');
    });
});
