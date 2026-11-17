'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const sinon = require('sinon');

describe('jobs/exportLocationsToCloudShelf', function () {
    const logger = { info: sinon.spy(), warn: sinon.spy(), error: sinon.spy() };
    const upsertLocations = sinon.stub();
    const storeList = function (stores) {
        let index = 0;
        return {
            getCount: () => stores.length,
            hasNext: () => index < stores.length,
            next: () => stores[index++],
        };
    };
    const chunk = function (locations) {
        return { toArray: () => locations, length: locations.length };
    };
    const lastSummary = function () {
        return logger.info.args
            .filter(args => args[0].indexOf('Store export summary') === 0)
            .map(args => args.slice(1))
            .pop();
    };
    let job;

    beforeEach(function () {
        logger.info.resetHistory();
        logger.warn.resetHistory();
        logger.error.resetHistory();
        upsertLocations.reset();
        job = proxyquire(
            '../../../../../cartridges/int_cloudshelf/cartridge/scripts/jobs/cloudShelf/exportLocationsToCloudShelf.js',
            {
                'dw/object/SystemObjectMgr': { querySystemObjects: () => storeList([{}, {}]) },
                '*/cartridge/scripts/helpers/cloudshelfHelper': { getLogger: () => logger },
                '*/cartridge/models/cloudshelf/cloudshelfApiModel': function () {
                    this.upsertLocations = upsertLocations;
                },
            },
        );
        job.beforeStep({});
    });

    it('should count the stores Cloudshelf saved', function () {
        upsertLocations.returns({ upsertLocations: { locations: [{ id: 'a' }, { id: 'b' }], userErrors: [] } });

        job.write(chunk([{ id: 'store-1' }, { id: 'store-2' }]));
        job.afterStep(true);

        assert.deepEqual(upsertLocations.firstCall.args[0], [{ id: 'store-1' }, { id: 'store-2' }]);
        assert.deepEqual(lastSummary(), [2, 2, 0, 0]);
        assert.isFalse(logger.warn.called);
        assert.isFalse(logger.error.called);
    });

    it('should log why Cloudshelf rejected a store and count the ones it saved', function () {
        upsertLocations.returns({
            upsertLocations: {
                locations: [{ id: 'a' }],
                userErrors: [{ code: 'ENTITY_CREATION_MISSING_FIELD', message: 'A countryCode is required' }],
            },
        });

        job.write(chunk([{ id: 'store-1' }, { id: 'store-2' }]));
        job.afterStep(true);

        assert.deepEqual(lastSummary(), [2, 1, 1, 0]);
        assert.isTrue(logger.warn.calledOnce);
        assert.include(logger.warn.firstCall.args.join(' '), 'A countryCode is required');
    });

    it('should log the stores of a request Cloudshelf did not accept', function () {
        upsertLocations.returns(null);

        job.write(chunk([{ id: 'store-1' }, { id: 'store-2' }]));
        job.afterStep(true);

        assert.deepEqual(lastSummary(), [2, 0, 0, 1]);
        assert.isTrue(logger.error.calledOnce);
        assert.include(logger.error.firstCall.args.join(' '), 'store-1, store-2');
    });
});
