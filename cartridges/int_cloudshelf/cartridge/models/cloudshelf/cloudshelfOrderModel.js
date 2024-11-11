'use strict';
var Logger = require("dw/system/Logger");

/**
 * @constructor
 * @classdesc The ClaudShelf order model
 * @param orderObject - a order objects
 * @param status - ClaudShelf order status
 */
function orderModel(orderObject, status) {
    if (orderObject) {
        try {
            var claudShelfOrderId =  JSON.parse(orderObject.custom.cloudshelfData).cloudshelfBasketId;
        } catch (err) {
            Logger.warn(
                'cloudshelfOrderModel error durig parsing cloudshelfData: {0}',
                JSON.stringify(err)
            );
        }
        this.id = claudShelfOrderId;
        this.status = status;
    }
}

module.exports = orderModel;