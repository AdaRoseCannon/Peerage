var express = require('express');
var sass = require('node-sass');
var app = express();
var appDir = __dirname + '/../app';
app.use('/', express.static(appDir));
app.get('/styles/*.css', function(req, res){
	'use strict';
	var body = sass.renderSync({
		file: appDir + req.originalUrl.substr(0, req.originalUrl.lastIndexOf('.')) + '.scss',
		success: function () {console.log('woop');},
		error: function (e) {console.log(e);}
    });
	res.setHeader('Content-Type', 'text/css');
	res.setHeader('Content-Length', body.length);
	res.end(body);
});
app.listen(3000);