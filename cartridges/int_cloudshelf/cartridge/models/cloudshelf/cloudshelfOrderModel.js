'use strict';
var Logger = require("dw/system/Logger");

/**
 * @constructor
 * @classdesc The ClaudShelf order model
 * @param orderObject - a order objects
 * @param status - Cloudshelf order status
 */
function orderModel(orderObject, status) {
    if (orderObject) {
        try {
            var cloudShelfOrderId =  JSON.parse(orderObject.custom.cloudshelfData).cloudshelfBasketId;
        } catch (err) {
            Logger.warn(
                'cloudshelfOrderModel error durig parsing cloudshelfData: {0}',
                JSON.stringify(err)
            );
        }
        this.id = cloudShelfOrderId;
        this.status = status;
    }
}

module.exports = orderModel;
