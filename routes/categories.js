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
				resolve(response.objects);
			}
			else {
				reject(response);
			}
		})
		.execute(client);
	});
}

function reorder(categories, parentId = 0) {
	let ret = [];
	
	for(var i = 0; i < categories.length; i++) {
		let category = categories[i];
		if(category.parentId != parentId) {
			continue;
		}
		
		let item = {
			"text": category.name + "[" + category.parentId + "]",
			"expanded": true,
			"classes": "important"
		};
		ret.push(item);
	}
	
	return ret;
}

/* GET categories data. */
router.get('/', function(req, res, next) {

	startWidgetSession()
	.then((widgetSession) => startSession(widgetSession))
	.then((session) => listCategories(session))
	.then((categories) => res.send(reorder(categories, 0)))
	.catch((err) => res.render('error', err));
	
});

/*
	var categories = [
		{
			"text": "1. Pre Lunch (120 min)",
			"expanded": true,
			"classes": "important",
			"children":
			[
				{
					"text": "1.1 The State of the Powerdome (30 min)"
				},
			 	{
					"text": "1.2 The Future of jQuery (30 min)"
				},
			 	{
					"text": "1.2 jQuery UI - A step to richnessy (60 min)"
				}
			]
		},
		{
			"text": "2. Lunch  (60 min)"
		},
		{
			"text": "3. After Lunch  (120+ min)",
			"children":
			[
				{
					"text": "3.1 jQuery Calendar Success Story (20 min)"
				},
			 	{
					"text": "3.2 jQuery and Ruby Web Frameworks (20 min)"
				},
			 	{
					"text": "3.3 Hey, I Can Do That! (20 min)"
				},
			 	{
					"text": "3.4 Taconite and Form (20 min)"
				},
			 	{
					"text": "3.5 Server-side JavaScript with jQuery and AOLserver (20 min)"
				},
			 	{
					"text": "3.6 The Onion: How to add features without adding features (20 min)",
					"id": "36",
					"hasChildren": true
				},
			 	{
					"text": "3.7 Visualizations with JavaScript and Canvas (20 min)"
				},
			 	{
					"text": "3.8 ActiveDOM (20 min)"
				},
			 	{
					"text": "3.8 Growing jQuery (20 min)"
				}
			]
		}
	]
	*/

module.exports = router;
