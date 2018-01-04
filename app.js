
const fs = require("fs");
const md5 = require("md5");
const path = require('path');
const http = require('http');
const https = require('https');
const logger = require('morgan');
const motion = require('hls-motion-detect');
const kaltura = require("kaltura-client");
const express = require('express');
const favicon = require('serve-favicon');
const socketIO = require('socket.io');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const item = require('./routes/item');
const index = require('./routes/index');
const search = require('./routes/search');
const monitor = require('./routes/monitor');
const category = require('./routes/category');


const yolo = './darknet';
const yoloData = 'cfg/easy.data';
const yoloConfig = 'cfg/easy.cfg';
const yoloWeights = '/home/ram/Documents/easy-yolo/backup/easy_final.weights';



/**********************************************
 * Express
 **********************************************/

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/item', item);
app.use('/monitor', monitor);
app.use('/category', category);
app.use('/search', search);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

app.io = socketIO();

module.exports = app;








/**********************************************
 * Socket.io
 **********************************************/

app.io.on("connection", function(socket)
{
    console.log("Monitor connected");
    
    socket.on("follow", (entryId) => {
    	console.log(`Following [${entryId}]`);
    	socket.join(entryId);
    });
});

function onEntryEvent(entryId, event, data) {
	setTimeout(() => {
		app.io.sockets.in(entryId).emit(event, data);
	}, 10000);
}






/**********************************************
 * Client lib
 **********************************************/

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
    			client.setKs(response.ks);
    			resolve();
    		}
    		else {
    			reject(response);
    		}
        })
        .execute(client);
    });
}









/**********************************************
 * Monitor
 **********************************************/

var recordingPath = './recorded';
var items = {};

if(!fs.existsSync(recordingPath)) {
	fs.mkdirSync(recordingPath);
}

var detectServer = new motion.DetectServer({
    ffmpegPath: 'ffmpeg', 
    ffprobePath: 'ffprobe', 
    recordingsPath: recordingPath
})
.listen(1336)
.on('source-added', (source) => {
    console.log(`New Source added [${source.systemName}] URL [${source.sourceURL}]`);
    
    source
    .on('start', (filepath) => {
        console.log(`Source [${source.systemName}] started`);
    })
    .on('stop', () => {
        console.log(`Source [${source.systemName}] stopped`);
    })
})
.on('source-removed', (systemName) => {
    console.log(`Source removed [${systemName}]`);
});

function getStreamUrl(url, m3u8) {
	return new Promise((resolve, reject) => {
        let lines = m3u8.split('\n');
        let segments = [];
        for(let i = 0; i < lines.length; i++) {
        	if(lines[i].match(/^#EXT-X-TARGETDURATION:[\d.]+$/) || lines[i].match(/^#EXTINF:[\d.]+,$/) || lines[i].match(/^#EXT-X-STREAM-INF:$/)) {
        		resolve(url);
        	}
        	if(lines[i].match(/^#EXT-X-STREAM-INF/)) {
        		resolve(lines[i + 1]);
        	}
        }
        
        return segments;
	});
}

function getUrlContent(url) {
	return new Promise((resolve, reject) => {
		let request = http.get(url, function(response){
			if(response.statusCode === 404) {
				reject('Source [' + This.sourceURL + '] status code: ' + response.statusCode);
				return;
			}

			response.setEncoding('utf8');
			let rawData = '';
	        response.on('data', function(chunk){
	        	rawData += chunk;
	        });
	        response.on('end', function(){
	        	resolve(rawData);
	        });
		});
		
		request.on('error', function(e){
			reject(e);
		});
		
		request.on('timeout', function(e){
			request.abort();
			reject('Source [' + This.sourceURL + '] request timeout');
		});
		
		request.setTimeout(3000);
	});
}

function createEntry(filepath, stats, action, categoryId, liveStreamId) {
	
	let entry = new kaltura.objects.MediaEntry({
		name: action,
		categoriesIds: categoryId,
		mediaType: kaltura.enums.MediaType.VIDEO, 
		tags: `event,${action},${liveStreamId}`,
		conversionProfileId: 9261601
	});
	let uploadToken = new kaltura.objects.UploadToken({
		fileName: path.basename(filepath),
		fileSize: stats.size
	});
	let contentResource = new kaltura.objects.UploadedFileTokenResource({
		token: '{1:result:id}'
	});
	
	let multiRequest = kaltura.services.uploadToken.add(uploadToken)
	.add(kaltura.services.media.add(entry))
	.add(kaltura.services.media.addContent('{2:result:id}', contentResource))
	.add(kaltura.services.uploadToken.upload('{1:result:id}', filepath));

	return new Promise((resolve, reject) => {
    	multiRequest
    	.execute(client, (success, response) => {
    		if(success) {
    			console.log('Entry created', response[1]);
    			resolve({
    				entry: response[1],
    				categoryId: categoryId
    			});
    		}
    		else {
    			reject(response);
    		}
    	});
	});
}

function detect(filepath) {

	return new Promise((resolve, reject) => {
		
		let cmd = `${yolo} detector test ${yoloData} ${yoloConfig} ${yoloWeights} ${filepath}`;
		cmd.exec((stdout, stderr) => {
			resolve(JSON.parse(stdout));
		});
    });
}

function isDifferent(a, b) {
	return (a.x != b.x || a.y != b.y || a.width != b.width || a.height != b.height)
}

function processMotion(stats, categoryId, detectedObjects, lastDetections) {

	return new Promise((resolve, reject) => {
		var eventItems = [];

    	for(var itemId in detectedObjects) {
    		var detections = detectedObjects[itemId];
    		if(detections.length <= 1) {
    			continue;
    		}
    		
    		var item = items[itemId];
    		var action;
    		if(item.parentId == categoryId) {
    			console.log(`Item [${item.name}] grabbed`);
    			action = "grabbed";
    		}
    		else if(lastDetections[itemId]) {
    			console.log(`Item [${item.name}] misplaced`);
    			action = "misplaced";
    		}
    		else {
    			continue;
    		}

    		eventItems.push({
    			action: action, 
    			categoryId: itemId
    		});
    	}

		resolve({
			stats: stats,
			eventItems: eventItems
		});
    });
}

function statFile(filepath) {
	return new Promise((resolve, reject) => {
		fs.stat(filepath, (err, stats) => {
			if(err) {
				reject(err);
			}
			else {
				resolve(stats);
			}
		});
    });
}

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

function addSource(entryId, url) {
	var detectedObjects = {};
	var lastDetections;
	var inMotion = 0;
	
	var source = new motion.Source({
		systemName: entryId, 
		sourceURL: url, 
		ffmpegPath: 'ffmpeg', 
		ffprobePath: 'ffprobe'
	}).on('record-start', (filepath) => {
		
		inMotion++;
		console.log(`Motion start [${entryId}]`);

		var d = new Date();
		var time = padStart(d.getHours()) + ":" + padStart(d.getMinutes());
		onEntryEvent(entryId, 'motion-start', time);
		
    }).on('record-stop', (filepath) => {

    	inMotion--;
    	statFile(filepath)
    	.then((stats) => processMotion(stats, source.categoryId, detectedObjects, lastDetections))
    	.then(({stats, eventItems}) => {

    		detectedObjects = {};
    		
    		for(var i = 0; i < eventItems.length; i++) {
    			createEntry(filepath, stats, eventItems[i].action, eventItems[i].categoryId, entryId)
    			.then(({entry, categoryId}) => {
    				
    				var item = items[categoryId];
    				var d = new Date(entry.createdAt * 1000);
    				var time = padStart(d.getHours()) + ":" + padStart(d.getMinutes());

    				onEntryEvent(entryId, 'new-event', {
    					id: entry.id,
    					action: entry.name,
    					name: item.name,
    					time: time
    				});
    			})
    	    	.catch((err) => console.error(err));
    		}
    		
    	})
    	.catch((err) => console.error(err));

		console.log(`Motion end [${entryId}]`);
		var d = new Date();
		var time = padStart(d.getHours()) + ":" + padStart(d.getMinutes());
		onEntryEvent(entryId, 'motion-end', time);
		
    }).on('capture', (filepath) => {
    	
    	if(!inMotion) {
    		return;
    	}
    	
    	detect(filepath)
    	.then((detections) => {
        	lastDetections = {};
        	for(var i = 0; i < detections.length; i++) {
        		var detection = detections[i];
            	if(items[detection.itemId]) {
            		console.log(`Object detected [${entryId}]`, detection);
            		
            		lastDetections[detection.itemId] = true;
            		
            		if(!detectedObjects[detection.itemId]) {
            			detectedObjects[detection.itemId] = [detection];
            		}
            		else {
            			var lastDetection = detectedObjects[detection.itemId][detectedObjects[detection.itemId].length - 1];
            			if(isDifferent(lastDetection, detection)) {
            	    		detectedObjects[detection.itemId].push(detection);
            			}
            		}
            	}
            	else {
            		console.log(`Object detected on missing item id`, detection);
            	}
        	}
    	});
    });
	
	source.keepSegmentsCount = 1;
	source.threshold = 25;

	detectServer.addSource(source);
	

    var categoryEntryFilter = new kaltura.objects.CategoryEntryFilter({
    	entryIdEqual: entryId
    });

    kaltura.services.categoryEntry.listAction(categoryEntryFilter)
    .completion((success, response) => {
        if(success) {
        	source.categoryId = response.objects[0].categoryId;
        	source.start();
        }
        else {
            console.error(response);
        }
    })
    .execute(client);
}

function updateLiveStreams(entries) {
	var liveStreams = {};
	for(var i = 0; i < entries.length; i++) {
		var entry = entries[i];
		for(var j = 0; j < entry.liveStreamConfigurations.length; j++) {
			var liveStreamConfiguration = entry.liveStreamConfigurations[j];
			if(liveStreamConfiguration.protocol == "hls") {
				liveStreams[entry.id] = liveStreamConfiguration.url;
				break;
			}
		}
	}
	
	for(var entryId in liveStreams) {
		if(detectServer.sources[entryId]) {
			continue;
		}
		
		getUrlContent(liveStreams[entryId])
		.then((m3u8) => getStreamUrl(liveStreams[entryId], m3u8))
		.then((url) => addSource(entryId, url));
	}
}

function reloadLiveStreams() {

    var liveStreamsFilter = new kaltura.objects.LiveStreamEntryFilter({
    	categoriesMatchAnd: "Market>",
    	isLive: true
    });

    kaltura.services.liveStream.listAction(liveStreamsFilter)
    .completion((success, response) => {
        if(success) {
        	updateLiveStreams(response.objects);
        }
        else {
            console.error(response);
        }
        setTimeout(reloadLiveStreams, 8000);
    })
    .execute(client);
}

function initLiveStreams() {

	reloadLiveStreams();

	var itemsFilter = new kaltura.objects.CategoryFilter({
		fullNameStartsWith: "Market>",
		tagsLike: "item"
	});
	
    kaltura.services.category.listAction(itemsFilter)
    .completion((success, response) => {
        if(success) {
        	for(var i = 0; i < response.objects.length; i++) {
        		var item = response.objects[i];
        		items[item.id] = item;
        	}
        }
        else {
            console.error(response);
        }
    })
    .execute(client);
}

startWidgetSession()
.then((widgetSession) => startSession(widgetSession))
.then(() => initLiveStreams())
.catch((err) => {
	console.error(err);
	process.exit(-1);
});

