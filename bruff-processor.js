var ValueParser = require('./value-parser');
var xtend = require('xtend');
var Q = require('q');
var Helpers = require('./bruff-helpers');
var RequestBuilder = require('./request-builder');

/**
 * this class is responsible for processing requests
 * to the destination servers. can process one to one 
 * or one to many
 * @clas BruffProcessor
 */
class BruffProcessor {

    /**
     * takse response and filer or filters. if filters loops through the array
     * and calls the filter function one by one the response else just calls the filter
     * function on response and returns the response from filter function
     * @class BruffProcessor
     * @method _runResponseFilter
     * @static
     * @param resp {Object}
     * @param filters {Function|Functions[]} function or array of functions
     */
    static _runResponseFilter(resp, filters) {
        var newResp = xtend({}, resp);

        if (Array.isArray(filters)) {
            for (var i = 0; i < filters.length; i++) {
                var filterFunction = filters[i];
                newResp = filterFunction(newResp);
            }
        } else {
            newResp = filters(newResp);
        }

        return newResp;
    }

    /**
     * responsible for processing request to each destination
     * @method _doTask
     * @private
     * @static
     * @param destination {Object}
     * @param context {Object}
     */
    static _doTask(destination, context) {
        var deferred = Q.defer();

        //set the method to use for remote call to variable method
        //either use destination method if set or use request method used by client
        var method = destination.method || context.client.req.method;
        var url = ValueParser.parse(destination.url, context);

        var requestObject = {};
        requestObject.headers = context.client.req.headers;
        //set request default values base on the method
        if (method === "GET") {
            requestObject.qs = context.client.req.query;
        } else {
            requestObject.form = context.client.req.body;
        }
        
        //if destination has requires override the default request values with it
        if (destination.hasOwnProperty('requires')) {
            //TODO parse values in the require section
            //with context values
            var destRequirement = Helpers.parseRequestObject(destination.requires, context);

            //override the request object with values in require
            requestObject = xtend(requestObject, destRequirement);
        }
        // context.responses = [];
        console.log(destination.title+"::::"+JSON.stringify(requestObject));
        console.log(destination.title+"::::"+JSON.stringify(context));

        new RequestBuilder(url, requestObject)
            .makeRequest(method)
            .then(function (resp) {
                //attach the response to context
                console.log(context.title+":::response:::"+resp.body);
                // context.responses.push(JSON.parse(resp.body));
                deferred.resolve(resp);
            })
            .catch(function (error) {
                context.responses.push({});
                deferred.reject(error);
            });

        return deferred.promise;
    }

    /**
     * responsible for processing or forwarding single 
     * client request to another server
     * @class BruffProcessor
     * @method processOneToOne
     * @static
     * @param destination {Object}
     * @param context {Object}
     */
    static processOneToOne(destination, context) {
        var deferred = Q.defer();

        BruffProcessor
            ._doTask(destination, context)
            .then(function (resp){
                return deferred.resolve(resp);
            }, function (error) {
                return deferred.reject(error);
            });
                    
        return deferred.promise;
    }

    /**
     * responsible for making independent multiple remote requests
     * to servers
     * @class BruffProcessor
     * @method processManyAsync
     * @static
     * @param destinations {Object|Array}
     * @param context Object
     * @return {Promise}
     */
    static processManyAsync(destinations, context) {
        var deferred = Q.defer();
        var destPromises = [];
        var resultFulfilment = {};

        for (var i = 0; i < destinations.length; i++) {
            destPromises.push(BruffProcessor._doTask(destinations[i], context));
        }
        Q.allSettled(destPromises)
         .done(function (responses) {
             for (var i = 0; i < responses.length; i++) {
                 var destFulfilment = responses[i];
                 if (destFulfilment.state === 'fulfilled') {
                     resultFulfilment[destinations[i].title] = responses[i].value;
                 } else {
                     resultFulfilment[destinations[i].title] = responses[i].reason;
                 }
                 
             }
             return deferred.resolve(resultFulfilment);
         });

        return deferred.promise;
    }

    /**
     * responsible for processing multiple requests to endpoints that depend 
     * on responses of siblings or previous requests.
     * In this situation if any one fails all subsequent ones fail as well
     * @class BruffProcessor
     * @method processManSync
     * @static
     */
    static processManySync(destinations, context) {
        var deferred = Q.defer();

        var result = Q();
        var responses = [];

        var objResponses = {};

        context.responses = [];
        var counter = 0;
        //run the requests to the servers sequentially
        destinations.forEach(function (f) {
            result = BruffProcessor._doTask(f, context)
                        .then(function (resp) {
                            console.log("iininnnnin");

                            context.responses.push(JSON.parse(resp.body));
                            objResponses[destinations[counter].title] = resp;
                            counter++;
                            return objResponses;
                        }, function (error) {
                            objResponses[destinations[counter].title] = error;
                            counter++;
                            return objResponses;
                        });
        });

        result.then(function () {
            
        });
        // result.then(function (results) {
        //     for (var i = 0; i < responses.length; i++) {
        //         objResponses[destinations[i].title] = responses[i];
        //     }
        //     deferred.resolve(objResponses);
        // });

        return result;
    }
}

module.exports = BruffProcessor;