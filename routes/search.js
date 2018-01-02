/*jshint esnext: true */

const fs = require("fs");
const express = require("express");
const router = express.Router();

router.post("/", function(req, res, next) {

	var buffer = Buffer.from(req.body.image, "base64");
	fs.writeFile("test.jpg", buffer, (err) => {
		res.send("83328941");
//		res.send(false);
	});
});

module.exports = router;
