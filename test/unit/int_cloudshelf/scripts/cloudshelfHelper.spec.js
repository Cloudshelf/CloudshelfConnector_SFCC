'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

const getThemeStub = sinon.stub();
const upsertThemeStub = sinon.stub();
const getCloudshelfStub = sinon.stub();
const upsertCloudshelvesStub = sinon.stub();

function CloudshelfApiModelMock() { };
CloudshelfApiModelMock.prototype.getTheme = getThemeStub;
CloudshelfApiModelMock.prototype.upsertTheme = upsertThemeStub;
CloudshelfApiModelMock.prototype.getCloudshelf = getCloudshelfStub;
CloudshelfApiModelMock.prototype.upsertCloudshelves = upsertCloudshelvesStub;

require('babel-register')({
    plugins: ['babel-plugin-rewire']
});


let customPreferenceValue;

describe('cloudshelf/cloudshelfHelper', function () {
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
                    getCustomPreferenceValue: () => customPreferenceValue
                }
            }
        }
    });

    it('should return correct global id value', function () {
        const result = cloudshelfHelper.getGlobalId('type', 'id')
        assert.equal(result, 'gid://external/type/id');
    });


    // eslint-disable-next-line no-underscore-dangle
    const getPropertyByPath = cloudshelfHelper.__get__('getPropertyByPath');
    it('should return correct property value', function () {
        let object = {
            "id": "unitId",
            "name": "unitName",
            "deeper": {
                "key": "unitKey",
                "data": "desiredValue"
            }
        }
        let path = 'deeper.data';
        assert.equal(getPropertyByPath(object, path), 'desiredValue');
    });

    it('should return correct metadata object', function () {
        let object = {
            "id": "unitId",
            "name": "unitName",
            "deeper": {
                "key": "unitKey",
                "data": "desiredValue"
            }
        }
        customPreferenceValue = '{"id" : "cloudShelfId", "name" : "cloudShelfKey"}';
        assert.equal(JSON.stringify(cloudshelfHelper.getMetadata(object)), 
            '[{"data":"unitId","key":"cloudShelfId"},{"data":"unitName","key":"cloudShelfKey"}]');
    });

});
