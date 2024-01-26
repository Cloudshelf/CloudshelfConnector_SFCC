'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

const getThemeStub = sinon.stub();
const upsertThemeStub = sinon.stub();
const getCloudshelfStub = sinon.stub();
const upsertCloudshelvesStub = sinon.stub();
const getCustomPreferenceValueStub = sinon.stub();

function CloudshelfApiModelMock() { };
CloudshelfApiModelMock.prototype.getTheme = getThemeStub;
CloudshelfApiModelMock.prototype.upsertTheme = upsertThemeStub;
CloudshelfApiModelMock.prototype.getCloudshelf = getCloudshelfStub;
CloudshelfApiModelMock.prototype.upsertCloudshelves = upsertCloudshelvesStub;

describe('cloudshelfHelper', function () {
    const cloudshelfHelper = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfHelper', {
        '~/cartridge/models/cloudshelf/cloudshelfApiModel': CloudshelfApiModelMock,
        'dw/system/Logger': {
            getLogger: () => {}
        },
        '*/cartridge/models/cloudshelf/theme': () => {
            return {
                id: 'theme'
            }
        },
        '*/cartridge/models/cloudshelf/cloudshelf': () => {
            return {
                id: 'cloudshelf'
            }
        },
        'dw/system/Site': {
            getCurrent: () => {
                return {
                    getCustomPreferenceValue: getCustomPreferenceValueStub
                }
            }
        }
    });

    it('should return correct global id value', function () {
        const result = cloudshelfHelper.getGlobalId('type', 'id')
        assert.equal(result, 'gid://external/type/id');
    });
});
