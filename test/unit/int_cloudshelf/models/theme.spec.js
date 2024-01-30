'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('cloudshelf/ThemeModel', function () {
    const ThemeModel = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/theme.js', {
        'dw/system/Site': {
            getCurrent: () => {
                return {
                    ID: 'RefApp'
                }
            }
        },
        '*/cartridge/scripts/helpers/cloudshelfHelper': {
            GLOBAL_ID_NAMESPACES: {
                THEME: 'THEME'
            },
            getGlobalId: (type, id) => {
                return type + '/' + id;
            }
        },
        'dw/web/URLUtils': {
            absStatic: (str) => {
                return {
                    toString: () => str
                }
            }
        }
    });

    it('should create default theme model', function () {
        const result = new ThemeModel();
        assert.equal(result.id, 'THEME/RefApp');
        assert.equal(result.displayName, 'Default Theme');
        assert.equal(result.logoUrl, '/images/logo.svg');
    });

    it('should create theme model based on passed arguments', function () {
        const result = new ThemeModel({
            id: 'theme_id',
            displayName: 'theme name'
        });
        assert.equal(result.id, 'THEME/theme_id');
        assert.equal(result.displayName, 'theme name');
    });
});
