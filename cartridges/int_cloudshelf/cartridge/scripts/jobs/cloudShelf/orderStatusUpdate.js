'use strict';

var Status = require('dw/system/Status');
var OrderMgr = require('dw/order/OrderMgr');
var Logger = require('dw/system/Logger');
var Order = require('dw/order/Order');
var Transaction = require('dw/system/Transaction');
const CLOUDSHELF_ORDER_STATUSES = {
    PAID: 'PAID',
    VOIDED: 'VOIDED',
};

/**
 * Update order status on Cloudshelf, when status updated on SFCC
 */
module.exports.execute = function () {
    Logger.info('Processing Cloudshelf orders with status Paid');
    OrderMgr.processOrders(
        processOrder,
        'status!={0} and paymentStatus={1} and custom.isCloudshelf={2} and custom.cloudshelfStatus!={3}',
        Order.ORDER_STATUS_CANCELLED,
        Order.PAYMENT_STATUS_PAID,
        true,
        CLOUDSHELF_ORDER_STATUSES.PAID,
    );

    Logger.info('Processing Cloudshelf orders with status Cancelled');
    OrderMgr.processOrders(
        processOrder,
        'status={0} and custom.isCloudshelf={1} and custom.cloudshelfStatus!={2}',
        Order.ORDER_STATUS_CANCELLED,
        true,
        CLOUDSHELF_ORDER_STATUSES.VOIDED,
    );

    return new Status(Status.OK);
};

function processOrder(order) {
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const cloudshelfApi = new CloudshelfApiModel();
    const OrderModel = require('*/cartridge/models/cloudshelf/cloudshelfOrderModel');
    var isCancelled = order.status == order.ORDER_STATUS_CANCELLED;

    if (isCancelled) {
        let orderObject = new OrderModel(order, CLOUDSHELF_ORDER_STATUSES.VOIDED);
        cloudshelfApi.upsertOrders(orderObject);

        Transaction.wrap(function () {
            order.custom.cloudshelfStatus = CLOUDSHELF_ORDER_STATUSES.VOIDED;
        });
    } else {
        let orderObject = new OrderModel(order, CLOUDSHELF_ORDER_STATUSES.PAID);
        cloudshelfApi.upsertOrders(orderObject);

        Transaction.wrap(function () {
            order.custom.cloudshelfStatus = CLOUDSHELF_ORDER_STATUSES.PAID;
        });
    }
    Logger.info('Order {0} status updated on Cloudshelf', order.orderNo);
}
