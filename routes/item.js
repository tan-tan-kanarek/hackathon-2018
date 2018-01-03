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
var lanes = 4;
var lanesMax = [];
var laneSize = day / lanes;
for(var lane = 1; lane <= lanes; lane++) {
	lanesMax.push(yesterday + (laneSize * lane)); 
}

function getLanes(events) {
	var ret = Array(lanes);
	for(var lane = 0; lane < lanes; lane++) {
		ret[lane] = {
			grabs: 0,
			misplacements: 0,
			sales: Math.floor(Math.random() * 10)
		};
	}
	for(var eventIndex in events) {
		var lastLane = 0;
		for(var lane = 0; lane < lanes; lane++) {
			var event = events[eventIndex];
			if(event.createdAt < lanesMax[lane] && event.createdAt > lastLane) {
				if(event.tags.indexOf("grab") >= 0) {
					ret[lane].grabs++;
				}
				if(event.tags.indexOf("misplacement") >= 0) {
					ret[lane].misplacements++;
				}
			}
			lastLane = lanesMax[lane];
		}
	}
	
	return ret;
}

function getMetadata(session, itemId) {
	
    return new Promise((resolve, reject) => {

    	var thumbnailsFilter = new kaltura.objects.MediaEntryFilter({
        	categoriesIdsMatchAnd: itemId,
    		tagsLike: "thumb",
    		statusIn: kaltura.enums.EntryStatus.NO_CONTENT + "," + kaltura.enums.EntryStatus.READY
    	});
    
    	var eventsFilter = new kaltura.objects.MediaEntryFilter({
        	categoriesIdsMatchAnd: itemId,
    		tagsLike: "event",
    		createdAtGreaterThanOrEqual: yesterday,
    		statusIn: kaltura.enums.EntryStatus.NO_CONTENT + "," + kaltura.enums.EntryStatus.READY + "," + kaltura.enums.EntryStatus.IMPORT + "," + kaltura.enums.EntryStatus.PRECONVERT
    	});
    
        kaltura.services.category.get(itemId)
        .add(kaltura.services.category.get("{1:result:parentId}"))
        .add(kaltura.services.media.listAction(thumbnailsFilter))
        .add(kaltura.services.media.listAction(eventsFilter))
        .setKs(session)
        .completion((success, response) => {
            if(success) {
            	var item = response[0];
            	var category = response[1];
            	var thumb = response[2].objects[0];
            	var events = response[3].objects;
            	
            	item.lanes = getLanes(events);
            	
                resolve({
                	session: session, 
                	item: item,  
                	category: category,
                	thumb: thumb, 
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
    
    startWidgetSession()
    .then((widgetSession) => startSession(widgetSession))
    .then((session) => getMetadata(session, query.id))
    .then(({session, item, category, thumb, events}) => res.render('item', {
    	ks: session, 
    	serviceUrl: serviceUrl, 
    	item: item, 
    	category: category,
    	thumb: thumb, 
    	events: events
    }))
	.catch((err) => {
		console.error(err);
		res.render("error", err);
	});

});

module.exports = router;


