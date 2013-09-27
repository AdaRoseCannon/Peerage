/*global define, Peer*/
var myId = $('#myId');
var theirId = $('#theirId');
var textData = $('#messageInput');
var connectBtn = $('#beginWebRTC');
var messageBtn = $('#sendMessage');
var messages = $('#messages').get(0);
var peerId;
var timestamps = [];
var useDataConn;

define(['dropzone-amd-module', 'filesaver'], function (Dropzone, saveAs) {
	'use strict';
	var myDropzone = new Dropzone('#dropzone', { url: '/'});

	function addDownloadLink (name, data, origin) {
		var node=document.createElement('li');
		node.classList.add('list-group-item');
		node.innerHTML = '<a href="#" onclick="return false;"> ' + name + ': ' + data + '</a>';
		node.onclick = function() { useDataConn.rawSend(origin, {timestamp: Date.now(), type: 'fileRequest', file: data}); return false; };
		messages.appendChild(node);
	}

	function addMessage (name, data) {
		var node=document.createElement('li');
		node.classList.add('list-group-item');
		node.innerHTML = name + ': ' + data;
		messages.appendChild(node);
	}

	function processData(data) {
		console.log(data.type + " signal sent");
		switch(data.type) {
		case 'message':
			addMessage (data.user, data.data);
			break;
		case 'file':
			addDownloadLink(data.user + ' is sending', data.file, data.user);
			break;
		case 'fileDownload':
			var blob = new Blob(data.blob, {type: data.filetype});
			saveAs(blob, data.file);
			break;
		case 'fileRequest':
			console.log('Request recieved');
			for(var i in myDropzone.files) {
				if(myDropzone.files[i].name === data.file){
					data.blob = myDropzone.files[i];
					break;
				}
			}
			data.user = peerId;
			data.type = 'fileDownload';
			useDataConn.rawSend(data.user, data);
			break;
		}
	}

	function recieveData (data) {
		useDataConn.updateListDisplay();
		if (timestamps.indexOf(data.timestamp) === -1) {
			if (data.type !== 'fileDownload' && data.type !== 'fileRequest') {
				processData(data);
				//This message is new to me so I will retransmit to make sure everyone else has it.
				timestamps.push(data.timestamp);
				useDataConn.retransmit(data);
			}
		}
	}

	function UseDataConn () {
		this.connections = {};

		this.updateListDisplay = function () {
			var d = '';
			for(var i in this.connections) {
				if (this.connections[i].open) {
					d = d + this.connections[i].peer + ', ';
				} else {
					this.connections[i].close();
					delete this.connections[i];
				}
			}
			theirId.get(0).value = d;
		};

		this.add = function (dataConn) {
			this.connections[dataConn.peer] = dataConn;
			this.updateListDisplay();
			dataConn.on('data',function (data) {
				recieveData (data);
			});
			dataConn.on('close',function () {
				addMessage ('Channel Status', 'Closed');
			});
		};

		this.rawSend = function (id, data) {
			for(var i in this.connections) {
				if (this.connections[i].peer === id) {
					console.log('requesting "' + data.type + '" from ' + this.connections[i].peer);
					this.connections[i].send(JSON.parse(JSON.stringify(data)));
				}
			}
		};

		this.send = function (data) {
			var timestamp = Date.now();
			timestamps.push(timestamp);
			for(var i in this.connections) {
				this.connections[i].send({timestamp: timestamp, user: peerId, type:'message', data: data});
			}
		};

		this.sendFile = function (file) {
			var timestamp = Date.now();
			timestamps.push(timestamp);
			for(var i in this.connections) {
				this.connections[i].send({timestamp: timestamp, user: peerId, type:'file', file: file.name, filetype: file.type});
			}
		};

		this.retransmit = function (data) {
			for(var i in this.connections) {
				this.connections[i].send(data);
			}
		};

		this.close = function () {
			for(var i in this.connections) {
				this.connections[i].close();
			}
		};
	}

	useDataConn = new UseDataConn();

	theirId.get(0).value = '';
	var peer = new Peer({host:'/', port: '9000', debug:3});

	peer.on('open', function(id) {
		myId.get(0).value = id;
		peerId = id;
	});

	connectBtn.on('click', function () {
		var dataConn = peer.connect(theirId.get(0).value, {
			reliable: false
		});
		dataConn.on('open', function() {
			useDataConn.add(dataConn);
			addMessage ('Connected to', dataConn.peer);
		});
	});

	peer.on('connection', function (dataConn) {
		dataConn.on('open', function() {
			useDataConn.add(dataConn);
			addMessage ('User has connected', dataConn.peer);
		});
	});

	peer.on('error', function (error) {
		addMessage ('Error', error);
	});

	messageBtn.on('click', function () {
		var data = textData.get(0).value;
		useDataConn.send(data);
		addMessage('Me', data);
	});

	myDropzone.on('addedfile', function (file) {
		useDataConn.sendFile(file);
		addMessage('Making file available', file.name);
	});

	window.onunload=function(){
		useDataConn.send('Disconnecting');
		useDataConn.close();
	};

	return '\'Allo \'Allo!';
});