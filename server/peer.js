/* jshint node: true */

var PeerServer = require('peer').PeerServer;

var peerServer = new PeerServer({
	port: 9000,
	host: '0.0.0.0'
});

