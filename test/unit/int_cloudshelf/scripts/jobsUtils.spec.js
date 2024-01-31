'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const assert = chai.assert;
const customObjectInstance = {
    custom: {
        lastRun: null
    }
};
const CUSTOM_OBJECT_NAME = 'JobsData';

const CustomObjectMgrMock = {
    getCustomObject: sinon.stub().returns(customObjectInstance),
    createCustomObject: sinon.stub().returns(customObjectInstance)
};
const transactionStub = {
    wrap: sinon.stub().callsFake((callback) => callback())
};

describe('Job Data Custom Object Tests', function() {
    
    const jobDataCustomObject = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/scripts/utils/jobsUtils', {
        'dw/object/CustomObjectMgr': CustomObjectMgrMock,
        'dw/system/Transaction': transactionStub
    });


    it('getLastRunDate should return null for first run', function() {
        const stepName = 'step1';
        const date = jobDataCustomObject.getLastRunDate(stepName);
        assert.isNull(date);
        assert.isTrue(CustomObjectMgrMock.getCustomObject.calledWith(CUSTOM_OBJECT_NAME, stepName));
    });

    it('getLastRunDate should return date of last successful run', function() {
        const stepName = 'step1';
        const expectedDate = new Date();
        customObjectInstance.custom.lastRun = expectedDate;

        const date = jobDataCustomObject.getLastRunDate(stepName);
        assert.equal(date, expectedDate);
    });

    it('updateLastRunDate should create custom object and set lastRun date if not exists', function() {
        const stepName = 'step1';
        const runDate = new Date();

        jobDataCustomObject.updateLastRunDate(stepName, runDate);

        assert.isTrue(transactionStub.wrap.calledOnce);
        assert.isTrue(CustomObjectMgrMock.createCustomObject.calledWith(CUSTOM_OBJECT_NAME, stepName) || CustomObjectMgrMock.getCustomObject.calledWith(CUSTOM_OBJECT_NAME, stepName));
        assert.equal(customObjectInstance.custom.lastRun, runDate);
    });

    it('updateLastRunDate should update lastRun date if custom object exists', function() {
        const stepName = 'step1';
        const runDate = new Date();

        jobDataCustomObject.updateLastRunDate(stepName, runDate);

        assert.isTrue(CustomObjectMgrMock.getCustomObject.calledWith(CUSTOM_OBJECT_NAME, stepName));
        assert.equal(customObjectInstance.custom.lastRun, runDate);
    });
});
