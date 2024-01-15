'use strict';

/**
 * @namespace Cloudshelf
 */

var server = require('server');

/**
 * Cloudshelf-SetSession : The Cloudshelf-SetSession endpoint initialize customer session on storefront based on sid parameter value 
 */
server.get('SetSession', function(req, res, next) {
    const URLUtils = require('dw/web/URLUtils');
    const cookieHelper = require('*/cartridge/scripts/helpers/cookieHelper');
    const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
    const logger = cloudshelfHelper.getLogger();

    if (req.querystring.sid) {
        cookieHelper.createCookie('dwsid', req.querystring.sid, '/');
        res.redirect(URLUtils.url('Checkout-Begin'));
    } else {
        logger.warn('Clousdhelf.js:SetSession error: session id value is not provided');
        res.redirect(URLUtils.url('Home-Show'));
    }

    next();
});

/**
 * Cloudshelf-CreateBasket : The Cloudshelf-CreateBasket endpoint create basket based on provided data
 * data parameter must be provided as url encoded json string ( e.g. {"prop":"value"} = %7B%22prop%22%3A%22value%22%7D )
 */
server.get('CreateBasket', function(req, res, next) {
    const URLUtils = require('dw/web/URLUtils');
    const cloudshelfBasketHelper = require('*/cartridge/scripts/helpers/cloudshelfBasketHelper');
    const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
    const logger = cloudshelfHelper.getLogger();

    const cloudshelfData = cloudshelfBasketHelper.getCloudshelfDataFromRequest(req);

    if (!cloudshelfBasketHelper.validateCloudshelfBasketData(cloudshelfData)) {
        logger.warn('Clousdhelf.js:CreateBasket error: insufficient cloudshelf basket data: {0}', JSON.stringify(cloudshelfData));
        res.redirect(URLUtils.url('Home-Show'));
        return next();
    }

    const createBasketResult = cloudshelfBasketHelper.createCloudshelfBasket(cloudshelfData);

    if (createBasketResult.error) {
        logger.warn('Clousdhelf.js:CreateBasket error during basket creation: {0}', JSON.stringify(createBasketResult));
        res.redirect(URLUtils.url('Home-Show'));
        return next();
    }

    res.redirect(URLUtils.url('Checkout-Begin'));
    return next();
});

module.exports = server.exports();