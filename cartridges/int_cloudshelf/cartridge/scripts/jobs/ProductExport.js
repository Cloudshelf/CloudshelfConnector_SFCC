"use strict";

/**
 * Job Step Type 
 */

const Status = require("dw/system/Status");
const ProductSearchModel = require("dw/catalog/ProductSearchModel");
var cloudshelfHelper = require("~/cartridge/scripts/helpers/cloudshelfHelper");
var cloudshelfHttpGraphQL = require("~/cartridge/scripts/services/cloudshelfHttpGraphQL");
var cloudshelfGraphQueries = require("~/cartridge/scripts/graphql/cloudshelfGraphqlQueries");
const logger = require("dw/system").Logger.getLogger("Cloudshelf", "Cloudshelf");
let countProcessed = 0;

let products;

let exportObj =[];

exports.beforeStep = function (params) {   
    const cgid = 'root';
    if (!cgid) {
        return new Status(Status.ERROR, 'ERROR', 'CategoryID is not set.');
    }
    /* const ProductSearchModel = require('dw/catalog/ProductSearchModel'); */
    const apiProductSearch = new ProductSearchModel();
    apiProductSearch.setCategoryID(cgid);
    apiProductSearch.setRecursiveCategorySearch(true);
    apiProductSearch.search();
    products = apiProductSearch.getProductSearchHits();
    return products;
};

/**
 * Returns the total number of items that are available.
 *
 * @returns {number}
 */
exports.getTotalCount = function () {
    return true;
};

/**
 * Returns one item or nothing if there are no more items.
 *
 * @returns {?dw.order.Order} - API order
 */
exports.read = function () {
    if (products.hasNext()) {
        return products.next();
    }

    return undefined;
};

exports.write = function () {
    let masterProductQueryVariables =  [];
    
    let requestBody;
    let variantRequestBody;
    let productInfo;
    let variantsInfo;
    let variantObj;
    let gid;
    let requestBodyVar;
    
    exportObj.forEach(element => {
        if (!element.product.bundle === true || !element.product.productSet === true) {
            gid = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, element.product.ID);
            let zzz = element.product.bundle
            productInfo =
            {
                "description": String(element.product.shortDescription || element.product.longDescription || ""),
                "displayName": element.product.name,
                "id": gid,
                "metadata": [
                    {
                        "data": "data",
                        "id": gid,
                        "key": "key"
                    }
                ],
                "productType": element.product.primaryCategory.displayName,
                "tags": [
                    "tags"
                ],
                "vendor": element.product.brand
            }

            masterProductQueryVariables.push(productInfo);
            
            let variations = element.variations.toArray();
            var variationModel = element.product.getVariationModel();
            var variantAttributes = variationModel.getProductVariationAttributes();

            variantsInfo = {
                "productId":  variations.length > 1 ? gid : cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, element.product.ID + 'M'),
                "variants": []
            }

            variations.forEach(variation => {
                let attributes = [];
                var images = variation.getImages('large');

                var metaimages = [];
                images.toArray().forEach(element => {
                    metaimages.push({
                        "preferredImage": false,
                        "url": String(element.httpsURL)
                    })   
                });
                if (metaimages.length) {
                    metaimages[0].preferredImage = true;
                }
                var prices = variation.getPriceModel();
                for (var index = 0; index < variantAttributes.length; ++index) {
                    var varVal = variationModel.getVariationValue(variation, variantAttributes[index]);

                    if (varVal) {
                        var variationVal = varVal.displayValue;
                        variationVal;
                        attributes.push({
                            "key": variantAttributes[index].attributeID,
                            "value": variationVal
                        })
                    }
                }
                images
                attributes
                variantObj = {
                    "attributes": attributes,
                    "availableToPurchase": variation.available,
                    "currentPrice": Number(prices.price),
                    "displayName": variation.name,
                    "id": cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, variation.ID),
                    "isInStock": true,
                    "metadata": [
                      {
                          "key": "quality",
                          "data": "High"
                      }
                    ],
                    "metaimages": metaimages,
                    "originalPrice": Number(prices.maxPrice),
                    "sku": variation.ID
                  }
                variantsInfo.variants.push(variantObj)
                let xx = variantsInfo
                xx
            });


            requestBodyVar = {
                query: cloudshelfGraphQueries.mutation.UpsertProductVariants,
                variables: {
                    inputs: variantsInfo
                }
            };
        
            const serviceVar = cloudshelfHttpGraphQL();
            const serviceResultVar = serviceVar.call(requestBodyVar);
            serviceResultVar
        }
    });
   masterProductQueryVariables

    requestBody = {
        query: cloudshelfGraphQueries.mutation.UpsertProducts,
        variables: {
            input: masterProductQueryVariables
        }
    };
    const service = cloudshelfHttpGraphQL();
    const serviceResult = service.call(requestBody);

    

    exportObj = [];
    return;
};

/**
 *
 * returns Cloudshelf ProductHit
 * @param {dw.catalog.ProductSearchHit} productSearchHit
 * @returns {*} - obj Job Status
 */
exports.process = function (productSearchHit) {
    if (productSearchHit) {
        try {
            /* Remove Export Obj */
            exportObj.push({product: productSearchHit.product,  variations: productSearchHit.representedProducts});
          
            /* Transaction.wrap(function  () {
                product.custom.isNew = isNew;
                product.custom.highlights = highlights;
            }); */
        } catch (error) {
            logger.error('processProductExportJob error: {0}', error);
        }
    }
    return new Status(Status.OK);

};
