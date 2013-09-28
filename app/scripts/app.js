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
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

define(['dropzone-amd-module', 'filesaver'], function (Dropzone, saveAs) {
	'use strict';
	var myDropzone = new Dropzone('#dropzone', { url: '/', autoProcessQueue: false});

	$.fn.dndhover = function(options) {

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
	            /*
	             * Firefox 3.6 fires the dragleave event on the previous element
	             * before firing dragenter on the next one so we introduce a delay
	             */
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
	    'dndHoverStart': function(event) {
	        $(document.body).addClass('dropMe');
	    },
	    'dndHoverEnd': function(event) {
	    	setTimeout(function () {
	       		$(document.body).removeClass('dropMe');
	    	}, 2000);
	    }
	});

	$("#dropzone").dndhover().on({
	    'dndHoverStart': function(event) {
	        $(document.body).addClass('dropMe');
	    },
	    'dndHoverEnd': function(event) {
	    	setTimeout(function () {
	       		$(document.body).removeClass('dropMe');
	    	}, 2000);
	    }
	});

	$("#closevideo").on("click", function () {
		document.body.classList.remove('video');
		currentCall.close();
	}); 

	function addDownloadLink (name, data, origin) {
		var node=document.createElement('li');
		node.classList.add('list-group-item');
		node.innerHTML = '<a href="#" onclick="return false;"> ' + name + ': ' + data + '</a>';
		node.onclick = function() { useDataConn.rawSend(origin, {timestamp: Date.now(), type: 'fileRequest', file: data, user: peerId}); return false; };
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
		var video = document.getElementById("video");
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
		console.log(data.type + " signal sent");
		switch(data.type) {
		case 'message':
			addMessage (data.user, data.data);
			break;
		case 'file':
			addDownloadLink(data.user + ' is sending', data.file, data.user);
			break;
		case 'fileDownload':
			var blob = new Blob([data.blob], {type: data.filetype});
			window.saveAs(blob, data.file);
			break;
		case 'fileRequest':
			var reader = new FileReader();
			var target = data.user;
			var data2 = JSON.parse(JSON.stringify(data));
			for(var i in myDropzone.files) {
				if(myDropzone.files[i].name === data.file){
					reader.readAsArrayBuffer(myDropzone.files[i]);
					//data2.fileblob = myDropzone.files[i];
					break;
				}
			}
			reader.onload = function (progress) {
				data2.blob = reader.result;
				data2.timestamp = Date.now();
				data2.user = peerId;
				data2.type = 'fileDownload';
				useDataConn.rawSend(target, data2);
			};
			reader.onerror = function (e) {
				console.log(e);
			}
			break;
		}
	}

	function recieveData (data) {
		useDataConn.updateListDisplay();
		if (timestamps.indexOf(data.timestamp) === -1) {
			processData(data);
			if (data.type !== 'fileDownload' && data.type !== 'fileRequest') {
				//This message is new to me so I will retransmit to make sure everyone else has it.
				timestamps.push(data.timestamp);
				useDataConn.retransmit(data);
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
		this.connections = {};

		this.updateListDisplay = function () {
			people.innerHTML = '';
			var count = 0;
			for(var i in this.connections) {
				theirId.get(0).value = '';
				if (this.connections[i].open) {
					count++;
					var node=document.createElement('li');
					node.classList.add('list-group-item');
					node.innerHTML = '<a href="#" onclick="return false;">' + this.connections[i].peer + '</a>';
					node.innerHTML += '<span class="badge"><span class="phonebutton glyphicon glyphicon-earphone"></span></span>';
					node.onclick = function() { makeCall(useDataConn.connections[i].peer); return false;};
					people.appendChild(node);
				} else {
					this.connections[i].close();
					delete this.connections[i];
				}
			}
			if (count !== 0) {
				document.body.classList.remove('hidebeginbody');
			} else {
				document.body.classList.add('hidebeginbody');
			}
		};

		this.add = function (dataConn) {
			this.connections[dataConn.peer] = dataConn;
			this.updateListDisplay();
			dataConn.on('data',function (data) {
				recieveData (data);
			});
			dataConn.on('close',function () {
				useDataConn.updateListDisplay();
				addMessage ('Connection Status', 'Closed');
			});
		};

		this.rawSend = function (id, data) {
			console.log('requesting "' + data.type + '" from ' + this.connections[id].peer);
			this.connections[id].send(data);
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

	function submitmessage () {
		var data = textData.get(0).value;
		textData.get(0).value = '';
		useDataConn.send(data);
		addMessage('Me', data);
		messages.scrollTop = messages.scrollHeight;
	}
	textData.on('keyup', function(e) {
		if (e.which == 13 || event.keyCode == 13) {
			submitmessage();
			e.preventDefault();
			return false;
		}
	});
	messageBtn.on('click', function () {
		submitmessage();
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