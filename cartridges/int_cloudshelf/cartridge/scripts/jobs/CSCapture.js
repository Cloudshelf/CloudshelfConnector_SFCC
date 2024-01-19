"use strict";

/**
 * Job Step Type that returns cybersource capture results for orders in a certain date range
 */

var Status = require("dw/system/Status");
var Order = require("dw/order/Order");
var OrderMgr = require("dw/order/OrderMgr");
var logger = require("dw/system").Logger.getLogger("CyberSource", "CyberSource");

/** @var dw.util.SeekableIterator */
var orders;

exports.beforeStep = function (params) {
    var ordersSearchQuery = "custom.CyberSourceCaptured != {0}";
    var dateTo;
    var dateFrom;
    if (params.DateFrom) {
        ordersSearchQuery += " AND creationDate >= {1}";
        dateFrom = new Date(params.DateFrom);

    }
    if (params.DateTo) {
        ordersSearchQuery += " AND creationDate <= {2}";
        dateTo = new Date(params.DateTo);
    }

    orders = OrderMgr.searchOrders(
        ordersSearchQuery,
        null,
        true,
        dateFrom,
        dateTo
    );

    return orders;
};

/**
 * Returns the total number of items that are available.
 *
 * @returns {number}
 */
exports.getTotalCount = function () {
    return orders.count;
};

/**
 * Returns one item or nothing if there are no more items.
 *
 * @returns {?dw.order.Order} - API order
 */
exports.read = function () {
    if (orders.hasNext()) {
        return orders.next();
    }

    return undefined;
};

exports.write = function (order) {
    return order;
};

/**
 *
 * returns Cybersource capture for orders
 * @param {dw.order.Order} order
 * @returns {*} - obj Job Status
 */
exports.process = function (order) {
    var CardFacade = require("*/cartridge/scripts/facade/CardFacade");
    var PayPalFacade = require("*/cartridge/scripts/paypal/facade/PayPalFacade");

    if (order) {
        var merchantRefCode = order.getOrderNo();
        var paymentType = order.getPaymentInstrument().getPaymentMethod();
        var currency = order.getCurrencyCode();
        var requestID = order.getPaymentTransaction().getTransactionID();
        var purchaseTotal = order.getTotalGrossPrice();
        var CSCaptureResponse;
        try {
            switch (paymentType) {
                case "CREDIT_CARD":
                    CSCaptureResponse = CardFacade.CCCaptureRequest(requestID, merchantRefCode, paymentType, purchaseTotal, currency);
                    break;
                case "PAYPALL":
                    CSCaptureResponse = PayPalFacade.PayPalCaptureService(requestID, merchantRefCode, paymentType, purchaseTotal, currency);
                    break;
                default:
                    break;
            }
            if (CSCaptureResponse && CSCaptureResponse.getReasonCode() == 100) {
                // eslint-disable-next-line no-param-reassign
                order.custom.CyberSourceCaptured = true;
                order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
            }
        } catch (e) {
            logger.error("[CSCapture.js] - Cybersource Capture Error - {0}", e);
            return new Status(Status.ERROR);
        }
    }

    return new Status(Status.OK);

};
