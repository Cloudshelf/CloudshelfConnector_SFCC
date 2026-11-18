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
    let noApiKey;
    let storeQueries;

    beforeEach(function () {
        noApiKey = false;
        storeQueries = 0;
        logger.info.resetHistory();
        logger.warn.resetHistory();
        logger.error.resetHistory();
        upsertLocations.reset();
        job = proxyquire(
            '../../../../../cartridges/int_cloudshelf/cartridge/scripts/jobs/cloudShelf/exportLocationsToCloudShelf.js',
            {
                'dw/object/SystemObjectMgr': {
                    querySystemObjects: () => {
                        storeQueries++;
                        return storeList([{}, {}]);
                    },
                },
                '*/cartridge/scripts/helpers/cloudshelfHelper': {
                    getLogger: () => logger,
                    isSiteWithoutApiKey: () => noApiKey,
                },
                '*/cartridge/models/cloudshelf/cloudshelfLocationModel': function (store) {
                    this.id = store.ID;
                },
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

    it('should say so when a store has no name and its ID is sent instead', function () {
        job.process({ ID: 'store-1', name: 'High Street' });
        assert.isFalse(logger.warn.called);

        job.process({ ID: 'store-2', name: null });

        assert.isTrue(logger.warn.calledOnce);
        assert.include(logger.warn.firstCall.args.join(' '), 'has no name in SFCC');
        assert.include(logger.warn.firstCall.args, 'store-2');
    });

    it('should read and send nothing for a site without an API key', function () {
        noApiKey = true;
        storeQueries = 0;
        logger.info.resetHistory();

        job.beforeStep({});

        assert.equal(storeQueries, 0);
        assert.isUndefined(job.getTotalCount());
        assert.isUndefined(job.read());
        job.afterStep(true);
        assert.isFalse(upsertLocations.called);
        assert.isFalse(logger.info.called);
    });
});
