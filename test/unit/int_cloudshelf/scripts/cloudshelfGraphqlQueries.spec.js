'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('cloudshelf/graphql/cloudshelfGraphqlQueries.js', function () {
    const cloudshelfGraphqlQueries = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/scripts/graphql/cloudshelfGraphqlQueries', {});

    it('should return an object with mutations and queries strings', function () {
        assert.isObject(cloudshelfGraphqlQueries.query);
        assert.isObject(cloudshelfGraphqlQueries.mutation);
    });
});
