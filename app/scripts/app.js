/*global define, Peer*/
var myId = $('#myId');
var theirId = $('#theirId');
var textData = $('#messageInput');
var connectBtn = $('#beginWebRTC');
var messageBtn = $('#sendMessage');
var messages = $('#messages').get(0);
var people = $('#people').get(0);
var peerId;
var timestamps = [];
var useDataConn;
var currentCall;
var _files = {};
var _chunksize = Math.pow(2,18);


navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

define(['dropzone-amd-module', 'filesaver'], function (Dropzone, saveAs) {
	'use strict';
	var myDropzone = new Dropzone('#dropzone', { url: '/', autoProcessQueue: false});

	function ab2getChunk(buf,i) {
		var p = i * _chunksize;
		return buf.slice(p, p + _chunksize);
	}

	$.fn.dndhover = function() {
		return this.each(function() {

			var self = $(this);
			var collection = $();

			self.on('dragenter', function(event) {
				if (collection.size() === 0) {
					self.trigger('dndHoverStart');
				}
				collection = collection.add(event.target);
			});

			self.on('dragleave', function(event) {
				setTimeout(function() {
					collection = collection.not(event.target);
					if (collection.size() === 0) {
						self.trigger('dndHoverEnd');
					}
				}, 1);
			});
		});
	};

	$(document).dndhover().on({
		'dndHoverStart': function() {
			$(document.body).addClass('dropMe');
		},
		'dndHoverEnd': function() {
			setTimeout(function () {
				$(document.body).removeClass('dropMe');
			}, 2000);
		}
	});

	$('#dropzone').dndhover().on({
		'dndHoverStart': function() {
			$(document.body).addClass('dropMe');
		},
		'dndHoverEnd': function() {
			setTimeout(function () {
				$(document.body).removeClass('dropMe');
			}, 2000);
		}
	});

	$('#closevideo').on('click', function () {
		document.body.classList.remove('video');
		currentCall.close();
	});

	function addDownloadLink (message, filename, origin) {
		var node=document.createElement('li');
		node.classList.add('list-group-item');
		node.innerHTML = '<a href="#" onclick="return false;"> ' + message + ': ' + filename + '</a>';
		node.onclick = function() { useDataConn.rawSendAll({timestamp: Date.now(), type: 'fileRequest', filename: filename, user: peerId}); return false; };
		messages.appendChild(node);
	}

	function addMessage (name, data) {
		var node=document.createElement('li');
		node.classList.add('list-group-item');
		node.innerHTML = name + ': ' + data;
		messages.appendChild(node);
	}

	function handleStream(stream, call) {
		document.body.classList.add('video');
		var video = document.getElementById('video');
		video.src = stream;
		video.play();
		call.on('close', function () {
			document.body.classList.remove('video');
			call.close();
		});
		if (window.webkitURL) {
			video.src = window.webkitURL.createObjectURL(stream);
			video.play();
		} else {
			video.src = stream;
			video.play();
		}
	}

	function processData(data) {
		//console.log(data.type + ' signal sent');
		switch(data.type) {
		case 'message':
			addMessage (data.user, data.data);
			break;
		case 'file': // Alerted a file is available
			addDownloadLink(data.user + ' is sending', data.filename, data.user);
			break;
		case 'fileRequest': // Recieved a request that someone wants to download a file
			if (_files[data.filename] !== undefined) {
				var data2 = {};//JSON.parse(JSON.stringify(data));
				data2.piece = 0;
				if (data.needed) {
					//need to make this more clever for multiple peers
					data2.piece = data.needed.indexOf('0');
					if (data2.piece === -1) {
						console.error('No file pieces needed so request should not\'ve been made');
						console.error(data.needed);
						break;
					}
				}
				if (_files[data.filename].chunks !== undefined) {
					//This file is being seeded from an already downloaded file
					//Use the existing chunks.
					if (data2.totalChunks === _files[data.filename].chunks.length ||  data2.totalChunks === undefined) {
						if ( _files[data.filename].chunks[data2.piece]) {
							data2.blob = _files[data.filename].chunks[data2.piece];
							data2.totalChunks = _files[data.filename].chunks.length;
						} else {
							console.log('Have not got requested piece');
							break;
						}
					} else {
						console.log('The number of chunks in the requested file and the file I have is different.');
						break;
					}
				} else {
					data2.blob = ab2getChunk(_files[data.filename].buffer, data2.piece);
					data2.totalChunks = _files[data.filename].noChunks;
				}
				data2.timestamp = Date.now();
				data2.user = peerId;
				data2.type = 'fileDownload';
				data2.filename = data.filename;
				data2.filesize = _files[data.filename].size;
				data2.filetype = _files[data.filename].type;
				data2.firstPiece =  (data.firstPiece === undefined);
				console.log('Sending chunk ' + data2.piece + ' of ' + data2.filename + ' in ' + data2.totalChunks +  ' chunks');
				useDataConn.rawSend(data.user, data2);
			}
			break;
		case 'fileDownload': // A file has been given to you.
			if (data.firstPiece) {
				_files[data.filename] = {};
				_files[data.filename].chunks = [];
				_files[data.filename].chunksGotten = Array.apply(null, new Array(data.totalChunks)).map(Number.prototype.valueOf,0);
				_files[data.filename].name = data.filename;
				_files[data.filename].size = data.filename;
				_files[data.filename].type = data.filename;
			}
			if (_files[data.filename].chunksGotten[data.piece] === 0) {
				_files[data.filename].chunks[data.piece] = data.blob;
				_files[data.filename].chunksGotten[data.piece] = 1;
			} else {
				console.log('Recieved duplicate piece no: ' + data.piece);
			}
			if (_files[data.filename].chunksGotten.indexOf(0) === -1) {
				var blob = new Blob(_files[data.filename].chunks, {type: data.filetype});
				window.saveAs(blob, data.filename);
			} else {
				var newRequest = JSON.parse(JSON.stringify(data));
				newRequest.expectChunks = 
				newRequest.type = 'fileRequest';
				newRequest.user = peerId;
				//convert 0/1 array to int
				newRequest.needed = _files[data.filename].chunksGotten.join('');
				useDataConn.rawSendAll(newRequest);
			}
			break;
		}
	}

	function recieveData (data) {
		useDataConn.updateListDisplay();
		if (timestamps.indexOf(data.timestamp) === -1) {
			processData(data);
			if (data.type !== 'fileDownload' && data.type !== 'fileRequest') {
				//This message is new to me so I will rawSendAll to make sure everyone else has it.
				timestamps.push(data.timestamp);
				useDataConn.rawSendAll(data);
			}
		}
	}

	function makeCall(id) {
		navigator.getUserMedia({video: true, audio: true}, function(stream) {
			var call = peer.call(id, stream);
			currentCall = call;
			call.on('stream', function(remoteStream) {
				// Show stream in some video/canvas element.
				handleStream(remoteStream, call);
			});
		}, function(err) {
			console.log('Failed to get local stream' ,err);
		});
	}

	function UseDataConn () {
		var _connections = {};
		var self = this;

		this.updateListDisplay = function () {
			people.innerHTML = '';
			var count = 0;
			for(var i in _connections) {
				theirId.get(0).value = '';
				if (_connections[i].open) {
					count++;
					var node=document.createElement('li');
					node.classList.add('list-group-item');
					node.innerHTML = '<a href="#" onclick="return false;">' + _connections[i].peer + '</a>';
					node.innerHTML += '<span class="badge"><span class="phonebutton glyphicon glyphicon-earphone"></span></span>';
					node.onclick = function() { makeCall(_connections[i].peer); return false;};
					people.appendChild(node);
				} else {
					_connections[i].close();
					delete _connections[i];
				}
			}
			if (count !== 0) {
				document.body.classList.remove('hidebeginbody');
			} else {
				document.body.classList.add('hidebeginbody');
			}
		};

		this.add = function (dataConn) {
			_connections[dataConn.peer] = dataConn;
			dataConn.on('data',function (data) {
				recieveData (data);
			});
			dataConn.on('error', function (e) {
				console.error(e.message);
				
			});
			dataConn.on('close',function () {
				self.updateListDisplay();
				addMessage ('Connection Status', 'Closed');
			});
			dataConn.on('open', function() {
				addMessage ('User has connected', dataConn.peer);
				self.updateListDisplay();
			});
		};

		this.rawSend = function (id, data) {
			//console.log('requesting "' + data.type + '" from ' + _connections[id].peer);
			_connections[id].send(data);
		};

		this.send = function (data) {
			var timestamp = Date.now();
			timestamps.push(timestamp);
			for(var i in _connections) {
				_connections[i].send({timestamp: timestamp, user: peerId, type:'message', data: data});
			}
		};

		this.sendFile = function (file) {
			var timestamp = Date.now();
			timestamps.push(timestamp);
			for(var i in _connections) {
				_connections[i].send({timestamp: timestamp, user: peerId, type:'file', filename: file.name, filetype: file.type});
			}
		};

		this.rawSendAll = function (data) {
			for(var i in _connections) {
				_connections[i].send(data);
			}
		};

		this.close = function () {
			for(var i in _connections) {
				_connections[i].close();
			}
		};
	}

	useDataConn = new UseDataConn();

	theirId.get(0).value = '';
	var peer = new Peer({host:'/', port: '9000', debug:1});

	peer.on('open', function(id) {
		myId.get(0).value = id;
		peerId = id;
	});

	peer.on('call', function(call) {
		currentCall = call;
		navigator.getUserMedia({video: true, audio: true}, function(stream) {
			call.answer(stream); // Answer the call with an A/V stream.
			call.on('stream', function(remoteStream) {
				handleStream(remoteStream, call);
				// Show stream in some video/canvas element.
			});
		}, function(err) {
			console.log('Failed to get local stream' ,err);
		});
	});

	connectBtn.on('click', function () {
		var dataConn = peer.connect(theirId.get(0).value, {
			reliable: true
		});
		useDataConn.add(dataConn);
	});

	peer.on('connection', function (dataConn) {
		useDataConn.add(dataConn);
	});

	peer.on('error', function (error) {
		addMessage ('Error', error.message);
		console.error(error.message);
		
	});

	function submitmessage () {
		var data = textData.get(0).value;
		textData.get(0).value = '';
		useDataConn.send(data);
		addMessage('Me', data);
		messages.scrollTop = messages.scrollHeight;
	}

	textData.on('keyup', function(e) {
		if (e.which === 13 || e.keyCode === 13) {
			submitmessage();
			e.preventDefault();
			return false;
		}
	});

	messageBtn.on('click', function () {
		submitmessage();
	});

	myDropzone.on('addedfile', function (file) {
		var reader = new FileReader();
		reader.readAsArrayBuffer(file);
		reader.onload = function () {
			_files[file.name] = {};
			_files[file.name].name = file.name;
			_files[file.name].size = file.size;
			_files[file.name].type = file.type;
			_files[file.name].buffer = reader.result;
			_files[file.name].noChunks = Math.ceil(reader.result.byteLength / _chunksize);
			_files[file.name].chunksize = _chunksize;

			useDataConn.sendFile(file);
			addMessage('Making file available', file.name);
		};
		reader.onerror = function (e) {
			console.log(e);
		};
	});

	window.onunload = function(){
		useDataConn.send('Disconnecting');
		useDataConn.close();
	};

	return '\'Allo \'Allo!';
});