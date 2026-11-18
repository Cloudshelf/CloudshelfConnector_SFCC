'use strict';

/**
 * @namespace Cloudshelf
 */

var server = require('server');

/**
 * Cloudshelf-SetSession : The Cloudshelf-SetSession endpoint initialize customer session on storefront based on sid parameter value
 */
server.get('SetSession', function (req, res, next) {
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
server.get('CreateBasket', function (req, res, next) {
    const URLUtils = require('dw/web/URLUtils');
    const cloudshelfBasketHelper = require('*/cartridge/scripts/helpers/cloudshelfBasketHelper');
    const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
    const logger = cloudshelfHelper.getLogger();

    const cloudshelfData = cloudshelfBasketHelper.getCloudshelfDataFromRequest(req);

    if (!cloudshelfBasketHelper.validateCloudshelfBasketData(cloudshelfData)) {
        logger.warn(
            'Clousdhelf.js:CreateBasket error: insufficient cloudshelf basket data: {0}',
            JSON.stringify(cloudshelfData),
        );
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

/**
 * Cloudshelf-StockLevels : The Cloudshelf-StockLevels endpoint answers a Cloudshelf display's live stock request
 * for one variant, with the site's own stock and the stock of each Cloudshelf store.
 * It is off until the Stock Levels Token site preference is set, and a request has to send that token as
 * "Authorization: Bearer <token>". Displays ask from a browser on another origin, so it answers CORS preflights.
 */
server.use('StockLevels', function (req, res, next) {
    const cloudshelfStockHelper = require('*/cartridge/scripts/helpers/cloudshelfStockHelper');
    const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
    const logger = cloudshelfHelper.getLogger();
    const startedAt = Date.now();
    const query = {
        variant: req.querystring.variant,
        product: req.querystring.product,
        location: req.querystring.location,
    };

    res.setHttpHeader('Access-Control-Allow-Origin', '*');
    res.setHttpHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHttpHeader('Access-Control-Allow-Headers', 'Authorization');

    // Only the payload is sent: res.json would add the route's own view data to it
    const respond = function (statusCode, body) {
        res.setStatusCode(statusCode);
        res.setContentType('application/json');
        res.print(JSON.stringify(body));
    };

    if (req.httpMethod === 'OPTIONS') {
        res.setStatusCode(204);
        res.print('');
        return next();
    }

    if (req.httpMethod !== 'GET') {
        logger.warn('Cloudshelf-StockLevels refused: method {0} is not supported', req.httpMethod);
        respond(405, { error: 'Method not allowed' });
        return next();
    }

    const access = cloudshelfStockHelper.checkAccess(req.httpHeaders.get('authorization'));
    if (!access.allowed) {
        logger.warn('Cloudshelf-StockLevels refused ({0}): {1}', access.statusCode, access.reason);
        respond(access.statusCode, { error: access.statusCode === 404 ? 'Not found' : 'Unauthorized' });
        return next();
    }

    if (!query.variant) {
        logger.warn('Cloudshelf-StockLevels refused (400): the request has no variant parameter');
        respond(400, { error: 'A variant is required' });
        return next();
    }

    try {
        const result = cloudshelfStockHelper.getStockLevels(query);
        const response = result.payload.response;

        if (!result.found) {
            logger.warn(
                'Cloudshelf-StockLevels: variant {0} is not a product on this site, answered with none available',
                query.variant,
            );
        } else {
            logger.info(
                'Cloudshelf-StockLevels: variant {0}, location {1} -> online {2}, at location {3}, locations answered {4}, {5} ms',
                query.variant,
                query.location || 'none',
                response.totalNumberAvailable,
                response.location ? response.location.numberAvailable : 'n/a',
                response.locations.length,
                Date.now() - startedAt,
            );
        }
        respond(200, result.payload);
    } catch (err) {
        logger.error(
            'Cloudshelf-StockLevels failed for variant {0}, location {1}: {2}',
            query.variant,
            query.location || 'none',
            err.message,
        );
        respond(500, { error: 'Stock levels could not be read' });
    }

    return next();
});

module.exports = server.exports();
