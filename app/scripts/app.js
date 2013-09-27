/*global define, Peer*/
var myId = document.getElementById('myId');
var theirId = document.getElementById('theirId');
define([], function () {
    'use strict';
    var peer = new Peer({host:'/', port: '9000', debug:3});

    peer.on('open', function(id) {
		myId.value = id;
	});

    return '\'Allo \'Allo!';
});