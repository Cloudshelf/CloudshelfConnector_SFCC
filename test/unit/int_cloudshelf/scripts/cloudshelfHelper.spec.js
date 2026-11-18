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
let warnings = [];

describe('cloudshelf/cloudshelfHelper', function () {
    const cloudshelfHelper = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfHelper', {
        '~/cartridge/models/cloudshelf/cloudshelfApiModel': CloudshelfApiModelMock,
        'dw/system/Logger': {
            getLogger: () => ({
                warn: (message, ...args) => warnings.push(message.replace(/\{(\d+)\}/g, (match, index) => args[index])),
            })
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
                    getCustomPreferenceValue: () => customPreferenceValue,
                    getID: () => 'RefArchGlobal'
                }
            }
        }
    });

    describe('isSiteWithoutApiKey', function () {
        beforeEach(function () {
            warnings = [];
        });

        it('should say nothing for a site with an API key', function () {
            customPreferenceValue = 'an-api-key';

            assert.isFalse(cloudshelfHelper.isSiteWithoutApiKey('Product export'));
            assert.lengthOf(warnings, 0);
        });

        it('should log once, naming the site and the step, for a site without one', function () {
            customPreferenceValue = null;

            assert.isTrue(cloudshelfHelper.isSiteWithoutApiKey('Product export'));
            assert.lengthOf(warnings, 1);
            assert.include(warnings[0], 'Product export skipped for site RefArchGlobal');
            assert.include(warnings[0], 'Cloudshelf API Key site preference is empty');
        });
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
