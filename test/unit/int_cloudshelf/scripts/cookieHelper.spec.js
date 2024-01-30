'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const assert = chai.assert;

const cookieSetPath = sinon.stub();
const cookieSetMaxAge = sinon.stub();
const cookieSetValue = sinon.stub();

function CookieMock () { };
CookieMock.prototype.setPath = cookieSetPath;
CookieMock.prototype.setMaxAge = cookieSetMaxAge;
CookieMock.prototype.setValue = cookieSetValue;

// Create an instance of the CookieMock for each test
const cookieInstance = new CookieMock();

// Use proxyquire to replace the Cookie module with the mock
const cookieManager = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cookieHelper', {
    'dw/web/Cookie': CookieMock
});

describe('cloudshelf/cookieHelper', function() {
    let responseMock;

    before(function() {
        // Global mock for the response object
        global.response = {
            addHttpCookie: sinon.spy()
        };
        responseMock = global.response;
    });

    after(function() {
        // Clean up the global object
        delete global.response;
    });

    it('should create a cookie correctly', function() {
        const name = 'testCookie';
        const value = 'testValue';
        const path = '/testPath';
        const maxAge = 3600;

        const cookie = cookieManager.createCookie(name, value, path, maxAge);

        assert.isTrue(cookie.setPath.calledWith(path));
        assert.isTrue(cookie.setMaxAge.calledWith(maxAge));
        assert.isTrue(responseMock.addHttpCookie.calledWith(cookie));
    });

    it('should update a cookie correctly', function() {
        const value = 'newValue';

        cookieManager.updateCookie(cookieInstance, value);

        assert.isTrue(cookieInstance.setValue.calledWith(value));
        assert.isTrue(cookieInstance.setPath.calledWith('/'));
        assert.isTrue(responseMock.addHttpCookie.calledWith(cookieInstance));
    });

    it('should delete a cookie correctly', function() {
        cookieManager.deleteCookie(cookieInstance);

        assert.isTrue(cookieInstance.setMaxAge.calledWith(0));
        assert.isTrue(responseMock.addHttpCookie.calledWith(cookieInstance));
    });

});
