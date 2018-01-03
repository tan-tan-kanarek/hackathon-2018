/*jshint esnext: true */

const fs = require("fs");
const md5 = require('md5');
const url = require('url');
const kaltura = require("kaltura-client");
const express = require('express');
const querystring = require('querystring');
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

var day = 60 * 60 * 24;
var yesterday = (Date.now() / 1000) - day;

function padStart(src) {
	src += '';
    var targetLength = 2;
    var padString = '0';
    if (src.length > targetLength) {
        return src;
    }
    else {
        targetLength = targetLength-src.length;
        if (targetLength > padString.length) {
            padString += padString.repeat(targetLength/padString.length);
        }
        return padString.slice(0,targetLength) + src;
    }
}

function getMetadata(session, entryId, categoryId) {
	
    return new Promise((resolve, reject) => {

    	var eventsFilter = new kaltura.objects.MediaEntryFilter({
    		tagsMultiLikeAnd: `event,${entryId}`,
    		createdAtGreaterThanOrEqual: yesterday,
    		statusIn: kaltura.enums.EntryStatus.NO_CONTENT + "," + kaltura.enums.EntryStatus.READY + "," + kaltura.enums.EntryStatus.IMPORT + "," + kaltura.enums.EntryStatus.PRECONVERT,
    		orderBy: kaltura.enums.MediaEntryOrderBy.CREATED_AT_DESC
    	});

    	var relatedEventsFilter = new kaltura.objects.MediaEntryFilter({
    		tagsMultiLikeOr: `event,${entryId}`,
    		createdAtGreaterThanOrEqual: yesterday,
    		statusIn: kaltura.enums.EntryStatus.NO_CONTENT + "," + kaltura.enums.EntryStatus.READY + "," + kaltura.enums.EntryStatus.IMPORT + "," + kaltura.enums.EntryStatus.PRECONVERT
    	});

        var itemsFilter = new kaltura.objects.CategoryFilter({
    		fullNameStartsWith: "Market>",
    		tagsLike: "item"
        });

    	kaltura.services.category.listAction(itemsFilter)
        .add(kaltura.services.category.get(categoryId))
        .add(kaltura.services.liveStream.get(entryId))
        .add(kaltura.services.media.listAction(eventsFilter))
        .setKs(session)
        .completion((success, response) => {
            if(success) {
            	var items = response[0].objects;
            	var category = response[1];
            	var entry = response[2];
            	var events = response[3].objects;

            	var itemsList = {};
            	for(var i = 0; i < items.length; i++) {
            		itemsList[items[i].id] = items[i];
            	}
                	
            	for(var i = 0; i < events.length; i++) {
            		
            		events[i].item = itemsList[events[i].categoriesIds];
            		
            		var d = new Date(events[i].createdAt * 1000);
            		events[i].time = padStart(d.getHours()) + ":" + padStart(d.getMinutes());

    				if(events[i].tags.indexOf("grab") >= 0) {
    					events[i].action = "grabbed";
    				}
    				if(events[i].tags.indexOf("misplaced") >= 0) {
    					events[i].action = "misplaced";
    				}
            	}
            	
                resolve({
                	session: session, 
                	entry: entry,
                	category: category,
                	events: events
                });
            }
            else {
                reject(response);
            }
        })
        .execute(client);
    });
}

router.get('/', function(req, res, next) {

    var urlParts = req.originalUrl.split("?");
    var query = querystring.parse(urlParts[1]);
    var entryId = query.id;
    var categoryId = query.categoryId;
    
    startWidgetSession()
    .then((widgetSession) => startSession(widgetSession))
    .then((session) => getMetadata(session, entryId, categoryId))
    .then(({session, entry, category, events}) => res.render('monitor', {
    	ks: session, 
    	partnerId: partnerId,
    	serviceUrl: serviceUrl, 
    	entryId: entryId,
    	entry: entry, 
    	category: category,
    	events: events
    }))
	.catch((err) => {
		console.error(err);
		res.render("error", err);
	});

});

module.exports = router;


