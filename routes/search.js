/*jshint esnext: true */

const fs = require("fs");
const express = require("express");
const router = express.Router();
const uniqid = require('uniqid');

const yolo = './darknet';
const yoloData = 'cfg/easy.data';
const yoloConfig = 'cfg/easy.cfg';
const yoloWeights = '/home/ram/Documents/easy-yolo/backup/easy_final.weights';

const searchPath = './recorded/';

router.post("/", function(req, res, next) {

	var buffer = Buffer.from(req.body.image, "base64");
	var filepath = searchPath + uniqid() + '.jpg';
	fs.writeFile(filepath, buffer, (err) => {

    	/*
    	TODO run YOLO

		let cmd = `${yolo} detector test ${yoloData} ${yoloConfig} ${yoloWeights} ${filepath}`;
		cmd.exec((stdout, stderr) => {
			var detections = JSON.parse(stdout);
			if(detections.length) {
    			var detection = detections[0];
    			res.send(detection.itemId);
    		}
    		else {
    			res.send(false);
    		}
		});
		
		*/
		
		res.send("83713751");
//		res.send(false);
	});
});

module.exports = router;
