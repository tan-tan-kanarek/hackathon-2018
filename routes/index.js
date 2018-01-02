/*jshint esnext: true */

const fs = require("fs");
const md5 = require('md5');
const kaltura = require("kaltura-client");
const express = require('express');
var cookieParser = require('cookie-parser');

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


function saveSession(session) {
	//document.cookie = "ks=" + session;
	console.log("XXXXXXX ks  = " + session);
	// var app = express();
	// app.use(cookieParser());
    //
	// app.get('/cookie',function(req, res){
	// 	console.log("BBBBBBBB");
    //
	// 	res.cookie("ks" , session).send('Cookie is set');
	// });
    //
	// app.get('/', function(req, res) {
	// 	console.log("CCCCCC");
	// 	console.log("sssssAAAAAAAAAAAAA Cookies :  ", req.cookies);
	// });

	return new Promise((resolve, reject) => {
			resolve(session);
		});

}

/* GET home page. */
router.get('/', function(req, res, next) {

	startWidgetSession()
	.then((widgetSession) => startSession(widgetSession))
	.then((session) => saveSession(session))
	.then((session) => listCategories(session))
	.then(({session, categories}) => res.render('index', {ks: session, serviceUrl: serviceUrl, categories: categories}))
	.catch((err) => {
		console.log(err);
		res.render('error', err)
	});
	
});

module.exports = router;
