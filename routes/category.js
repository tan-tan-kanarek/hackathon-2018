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

function getMetadata(session, parentId) {
	var day = 60 * 60 * 24;
	var yesterday = (Date.now() / 1000) - day;
	var lanes = 4;
	var lanesMax = [];
	var laneSize = day / lanes;
	for(var lane = 1; lane <= lanes; lane++) {
		lanesMax.push(yesterday + (laneSize * lane)); 
	}
	
    return new Promise((resolve, reject) => {

        var itemsFilter = new kaltura.objects.CategoryFilter({
        	parentIdEqual: parentId
        });

        var liveStreamsFilter = new kaltura.objects.LiveStreamEntryFilter({
        	categoriesIdsMatchAnd: parentId
        });
    
    	var thumbnailsFilter = new kaltura.objects.MediaEntryFilter({
    		tagsLike: "thumb",
    		statusIn: kaltura.enums.EntryStatus.NO_CONTENT + "," + kaltura.enums.EntryStatus.READY
    	});
    
    	var eventsFilter = new kaltura.objects.MediaEntryFilter({
    		tagsLike: "event",
    		createdAtGreaterThanOrEqual: yesterday
    	});
    
    	var entryFilterMapping = new kaltura.objects.ResponseProfileMapping({
    		filterProperty: "categoriesIdsMatchAnd",
    		parentProperty: "id"
    	});
    
    	var thumbResponseProfile = new kaltura.objects.DetachedResponseProfile({
    		name: "thumbs",
    		filter: thumbnailsFilter,
    		mappings: [entryFilterMapping]
    	});
    
    	var eventsResponseProfile = new kaltura.objects.DetachedResponseProfile({
    		name: "events",
    		filter: eventsFilter,
    		mappings: [entryFilterMapping]
    	});
    
    	var responseProfile = new kaltura.objects.DetachedResponseProfile({
    		relatedProfiles: [thumbResponseProfile, eventsResponseProfile]
    	});

        kaltura.services.category.listAction(itemsFilter)
		.setResponseProfile(responseProfile)
        .add(kaltura.services.liveStream.listAction(liveStreamsFilter))
        .setKs(session)
        .completion((success, response) => {
            if(success) {
            	var items = response[0].objects;
            	for(var i = 0; i < items.length; i++) {
            		var item = items[i];
            		items[i].lanes = Array(lanes);
    				for(var lane = 0; lane < lanes; lane++) {
    					items[i].lanes[lane] = {
    						events: 0,
    						purchased: Math.floor(Math.random() * 10)
    					};
    				}
            		if(item.relatedObjects.events.totalCount) {
            			for(var eventIndex in item.relatedObjects.events.objects) {
            				var event = item.relatedObjects.events.objects[eventIndex];
            				for(var lane = 0; lane < lanes; lane++) {
            					if(event.createdAt < lanesMax[lane]) {
            						items[i].lanes[lane].events++;
            					}
            				}
            			}
            		}
            	}
            	
                resolve({
                	session: session, 
                	items: items, 
                	liveStreams: response[1].objects
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
    .then(({session, items, liveStreams}) => res.render('category', {
    	ks: session, 
    	serviceUrl: serviceUrl, 
    	items: items, 
    	liveStreams: liveStreams
    }))
    .catch((err) => res.render('error', err));

});

module.exports = router;


