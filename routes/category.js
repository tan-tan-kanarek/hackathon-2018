/*jshint esnext: true */

const fs = require("fs");
const md5 = require('md5');
const kaltura = require("kaltura-client");
const express = require('express');
const router = express.Router();

const {serviceUrl, partnerId, appToken} = JSON.parse(fs.readFileSync("config/kaltura.json"));

let config = new kaltura.Configuration();
config.serviceUrl = serviceUrl;

const client = new kaltura.Client(config);

function startWidgetSession() {
    return new Promise((resolve, reject) => {
            const widgetId = `_${partnerId}`;
    kaltura.services.session.startWidgetSession(widgetId)
        .completion((success, response) => {
        if(success) {
            resolve(response.ks);
        }
        else {
            reject(response);
}
})
.execute(client);
});
}

function startSession(widgetSession) {
    return new Promise((resolve, reject) => {
            const tokenHash = md5(widgetSession + appToken.token);
    kaltura.services.appToken.startSession(appToken.id, tokenHash)
        .setKs(widgetSession)
        .completion((success, response) => {
        if(success) {
            resolve(response.ks);
        }
        else {
            reject(response);
}
})
.execute(client);
});
}

function listCategories(session) {
    return new Promise((resolve, reject) => {

            var filter = new kaltura.objects.CategoryFilter({
                fullNameStartsWith: "Market"
            });

    kaltura.services.category.listAction(filter)
        .setKs(session)
        .completion((success, response) => {
        if(success) {
            resolve({session: session, categories: response.objects});
        }
        else {
            reject(response);
}
})
.execute(client);
});
}

/* GET home page. */
router.get('/', function(req, res, next) {
    var url = require('url');
    var querystring = require('querystring');


    console.log("Orig URL = " + req.originalUrl);
    var res = req.originalUrl.split("?");
    console.log( "Query Params = " +  res[1]);
    var qs = querystring.parse(res[1]);
    console.log("ID = " +  qs.id);
    startWidgetSession()
        .then((widgetSession) => startSession(widgetSession))
    .then((session) => listCategories(session))
    .then(({session, categories}) => res.render('index', {ks: session, serviceUrl: serviceUrl, categories: categories}))
    .catch((err) => res.render('error', err));

});

module.exports = router;


