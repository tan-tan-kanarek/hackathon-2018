
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
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const item = require('./routes/item');
const index = require('./routes/index');
const search = require('./routes/search');
const monitor = require('./routes/monitor');
const category = require('./routes/category');





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

module.exports = app;







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
    .on('record-start', (filepath) => {
        console.log(`Source [${source.systemName}] started recording: ${filepath}`);
    })
    .on('record-stop', (filepath) => {
        console.log(`Source [${source.systemName}] stopped recording`);
    });
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

function addSource(entryId, url) {
	var source = new motion.Source({
		systemName: entryId, 
		sourceURL: url, 
		ffmpegPath: 'ffmpeg', 
		ffprobePath: 'ffprobe'
	}).on('record-start', (diff) => {
		console.log(`---  Motion start [${entryId}]`);
    }).on('record-stop', (filepath) => {
		console.log(`---  Motion end [${entryId}]`);
    });
	
	source.keepSegmentsCount = 1;
	source.threshold = 30;

	detectServer.addSource(source);
	source.start();
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

var lastUpdate = 0;
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
            reject(response);
        }
        setTimeout(reloadLiveStreams, 10000);
    })
    .execute(client);
}

startWidgetSession()
.then((widgetSession) => startSession(widgetSession))
.then(() => reloadLiveStreams())
.catch((err) => {
	console.error(err);
	process.exit(-1);
});

