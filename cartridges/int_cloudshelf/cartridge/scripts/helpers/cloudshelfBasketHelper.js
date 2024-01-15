'use strict';

const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
const logger = cloudshelfHelper.getLogger();

/**
 * Returns cloudshelf data object based on data string parameter
 * @param {Object} req - local instance of request object
 * @returns {Object|null} - cloudshelf basket details
 */
function getCloudshelfDataFromRequest(req) {
    try {
        return JSON.parse(req.querystring.data);
    } catch (err) {
        logger.warn(
            'cloudshelfBasketHelper.js:getCloudshelfDataFromRequest error durig parsing cloudshelf basket data: {0}',
            JSON.stringify(err)
        );
        return null;
    }
}

/**
* Validates cloudshelf basket details
* @param {Object} cloudshelfData - cloudshelf basket details object
* @returns {boolean} true if data is valid
*/
function validateCloudshelfBasketData(cloudshelfData) {
    return !!(cloudshelfData && cloudshelfData.productItems);
}

/**
 * Tries to create SFCC basket based on provided cloudshelf basket details
 * @param {Object} cloudshelfData - cloudshelf basket details object
 * @returns {void}
 * @throws {Error} If error during basket creation
 * @private
 */
function tryToCreateCloudshlfBasket(cloudshelfData) {
    const BasketMgr = require('dw/order/BasketMgr');
    const Transaction = require('dw/system/Transaction');
    const cartHelper = require('*/cartridge/scripts/cart/cartHelpers');
    const basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');

    const basket = BasketMgr.getCurrentOrNewBasket();
    let addToCartResult;

    Transaction.wrap(function(){
        cloudshelfData.productItems.forEach(function(productItem) {
            if (addToCartResult && addToCartResult.error) {
                throw new Error(addToCartResult.message);
            }

            let quantity = parseInt(productItem.quantity, 10);
            addToCartResult = cartHelper.addProductToCart(
                basket,
                productItem.productId,
                quantity
            );
        });
        basket.custom.isCloudshelf = true;
        basket.custom.cloudshelfData = JSON.stringify(cloudshelfData);

        if (addToCartResult && !addToCartResult.error) {
            cartHelper.ensureAllShipmentsHaveMethods(basket);
            basketCalculationHelpers.calculateTotals(basket);
        }
    });

    if (!addToCartResult) {
        throw new Error('Error during cloudshlf basket creation');
    }

    if (addToCartResult.error) {
        throw new Error(addToCartResult.message);
    }
}

/**
 * Creates SFCC basket based on provided cloudshelf basket details
 * @param {Object} cloudshelfData - cloudshelf basket details object
 * @returns {Object} - returns an object with error flag and error message if error=true
 */
function createCloudshelfBasket(cloudshelfData) {
    try {
        tryToCreateCloudshlfBasket(cloudshelfData);

        return {
            error: false
        };
    } catch (err) {
        logger.warn('cloudshelfBasketHelper.js:createCloudshelfBasket error: {0}', JSON.stringify(err));
        return {
            error: true,
            message: err.message
        }
    }
}

module.exports = {
    getCloudshelfDataFromRequest: getCloudshelfDataFromRequest,
    validateCloudshelfBasketData: validateCloudshelfBasketData,
    createCloudshelfBasket: createCloudshelfBasket
};
