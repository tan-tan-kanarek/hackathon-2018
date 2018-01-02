/*jshint esnext: true */

const fs = require("fs");
const md5 = require("md5");
const kaltura = require("kaltura-client");
const express = require("express");
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

function getMetadata(session) {
	return new Promise((resolve, reject) => {

		var categoriesFilter = new kaltura.objects.CategoryFilter({
			fullNameStartsWith: "Market>",
			tagsLike: "department"
		});

    	var itemsFilter = new kaltura.objects.CategoryFilter({
    		fullNameStartsWith: "Market>",
    		tagsLike: "item"
    	});
    
    	var thumbnailsFilter = new kaltura.objects.MediaEntryFilter({
    		tagsLike: "thumb",
    		statusIn: kaltura.enums.EntryStatus.NO_CONTENT + "," + kaltura.enums.EntryStatus.READY
    	});
    
    	var thumbnailsFilterMapping = new kaltura.objects.ResponseProfileMapping({
    		filterProperty: "categoriesIdsMatchAnd",
    		parentProperty: "id"
    	});
    
    	var thumbResponseProfile = new kaltura.objects.DetachedResponseProfile({
    		name: "thumbs",
    		filter: thumbnailsFilter,
    		mappings: [thumbnailsFilterMapping]
    	});
    
    	var responseProfile = new kaltura.objects.DetachedResponseProfile({
    		relatedProfiles: [thumbResponseProfile]
    	});
    	var rgbcolorsList = ["#00bfff","#0080ff","#0040ff","#DEB887","#CD853F", "#8B4513"];
    	kaltura.services.category.listAction(itemsFilter)
		.setResponseProfile(responseProfile)
		.add(kaltura.services.category.listAction(categoriesFilter))
		.setKs(session)
		.completion((success, response) => {
		if(success) {
			var catList = response[1].objects;
			var arrayLength = catList.length;
			for (var i = 0; i < arrayLength; i++) {
				catList[i].rgbcolor = rgbcolorsList[i];
				catList[i].index = i;
			}
			resolve({
				session: session,
				items: response[0].objects,
				categories: catList
			});
		}
		else {
			reject(response);
		}
    })
    .execute(client);
    });
}

/* GET home page. */
router.get("/", function(req, res, next) {

	startWidgetSession()
	.then((widgetSession) => startSession(widgetSession))
	.then((session) => getMetadata(session))
	.then(({session, categories, items}) => res.render("index", {ks: session, serviceUrl: serviceUrl, categories: categories, items: items}))
	.catch((err) => {
		console.error(err);
		res.render("error", err);
	});
});

module.exports = router;
