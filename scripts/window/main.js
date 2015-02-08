/**
 *
 * @constructor
 */
var CrDlna = function() {
	this.clients = {};
	
	// Navigation path stack
	this.navigationPath = [];

	// The device we are currently looking at
	this.currentDevice = undefined;
};

/**
 * Function called when the UPnP handler registers a new device from the network
 * @callback
 */
CrDlna.prototype.newDeviceCallback = function() {
	if (this.upnp) {
		console.log("UPnP got new devices!");
		this.updateDeviceList();

	}
};

/**
 * Updates the list of known devices
 */
CrDlna.prototype.updateDeviceList = function () {
		var devices = this.upnp.getDevices();
		var list = document.querySelector('#devices');
		var that = this;

		list.innerHTML = '';

		devices.forEach(function (v, i, a) {

			if (!that.clients[v.name]) {
				// TODO: make sure we only add media server devices
				that.clients[v.name] = new MediaServerClient(v);
			}
			var container = document.createElement('div');			
			var device = document.createElement('div');
			device.innerText = v.name;
			device.setAttribute('objectId', '0');

			// If this client has a content directory service, add a click listener
			if (that.clients[v.name] && that.clients[v.name].contentDirectory) {
				device.addEventListener('click', function (){				
					that.currentDevice = v;
					var sendBrowseRequest = new Promise(function(resolve, reject) {
						var client = that.clients[v.name];
						if (client) {
							client.browseFolder('0', resolve);
						} else {
							reject(new Error('No client was found for the device ' + v.name));
						}
					});

					sendBrowseRequest.then(
						function (data) {
							that.drawChildFolders(data);
						}, function (error) {
							console.log("error getting child folders");
					});

				});
			} else {
				device.innerText += ' (not a media server)';
			}
			container.appendChild(device);
			list.appendChild(container);
		});

};

/**
 * Draws the navigation path
 */
CrDlna.prototype.drawPath = function() {
	var that = this;

	var heading = document.querySelector('#header');
	heading.innerHTML = '';

	var item = document.createElement('div');
	item.innerHTML = "Device root";
	heading.appendChild(item);

	this.navigationPath.forEach(function (folder, i, a){
		
		item = document.createElement('div');
		item.innerHTML = " &gt; ";
		heading.appendChild(item);
		
		item = document.createElement('div');
		item.innerHTML = folder.title;
		item.addEventListener('click', function() {
			
			while (folder !== that.navigationPath.pop()) {
				// keep popping off anything else in the list
			}
			that.browseFolder(folder);
		});
		heading.appendChild(item);

	});


};

/**
 * Draws any child items
 *
 * @param {Object} data The object contianing the child folder data 
 */
CrDlna.prototype.drawChildFolders = function (data) {

	var that = this;
	var elem = document.querySelector('#content');
	elem.innerHTML = '';

	if (!data || !elem) return;

	var playback = document.querySelector('#playback');

	data.forEach(function (v, i, a){
		var child = document.createElement('div');		
		child.classList.add('contentItem');
		child.setAttribute('objectId', v.id);
		child.setAttribute('type', v.type);
		if (v.type.indexOf('videoItem') >= 0) {
			// Video Item
			child.innerHTML = '<p>' + v.title + '</p>';
			child.addEventListener('click', function() {
				playback.innerHTML = '<video width="300" height="240" controls preload="none"><source src="' + v.url + '"></video>';
			});	
		} else if (v.type.indexOf('imageItem') >= 0) {
			// Image Item
			child.innerHTML = '<p>' + v.title + '</p>';
			child.addEventListener('click', function() {
				playback.innerHTML = '<webview src="' + v.url + '" width="640" height="480" autosize="on"></webview>';
			});
		} else if (v.type.indexOf('object.item') >= 0) {
			// Audio Item
			child.innerHTML = '<p>' + v.title + '</p>';
			child.addEventListener('click', function() {
				playback.innerHTML = '<audio controls autoplay><source src="' + v.url + '"></audio>';
			});
		} else {
			// Container
			child.classList.add('contentFolder');

			// Fairly inefficient albumArt retrieval - have to do it this way due to security restrictions
			// of chrome apps.  Could be improved by caching to file system
			if (v.albumArt !== '') {
				var xhr = new XMLHttpRequest();
				xhr.open('GET', v.albumArt, true);
				xhr.responseType = 'blob';
				xhr.onload = function(e) {
				  child.style.backgroundImage = 'url("' + window.URL.createObjectURL(this.response) + '")';
					child.style.backgroundSize = 'cover';
				};
				xhr.send();
			} else {
				// load local backup placeholder when we have one
			}

			child.innerText = v.title;
			child.title = v.title;
			child.addEventListener('click', function () {			
				that.browseFolder(v);
			});
		}
		elem.appendChild(child);
	});

};

/**
 * Browse the folder of this device
 */
CrDlna.prototype.browseFolder = function(folder) {
	var that = this;
	var sendBrowseRequest = new Promise(function(resolve, reject) {				
		var client = that.clients[that.currentDevice.name];
			if (client) {
				that.navigationPath.push(folder);
				client.browseFolder(folder.id, resolve);
			} else {
				reject(new Error('No client was found for the device ' + v.name));
			}
	});

	sendBrowseRequest.then(
		function (data) {
			that.drawPath();
			that.drawChildFolders(data);
		}, function (error) {
			console.log("error getting child folders");
	});
};

/**
 * Binds the various UI controls to any handlers that are needed
 */
CrDlna.prototype.bindControls = function() {
	var that = this;

	var refreshDevices = document.querySelector('#refreshDevices');
	refreshDevices.addEventListener('click', function() {
		// Update the device list right away from known devices, but also instruct the SSDP manager to
		// try and find anything new - the callback will handle adding those if they arrive
		that.updateDeviceList();
		that.ssdp.sendDiscover();
	});

};

/**
 * Kicks off everything by creating a new CrDlna object as well as SSDP and UPNP handlers.
 */
document.addEventListener("DOMContentLoaded", function() {
	console.log("Starting Chrome DLNA...");
	var c = new CrDlna();

	// Bind any controls
	c.bindControls();

	c.ssdp = new SSDP();
	c.upnp = new UPNP({
		deviceCallback: c.newDeviceCallback.bind(c)
	});

	c.ssdp.init();
	c.upnp.init();

	// Make sure the SSDP cache resets periodically (doing it here as we have
	// access to window.setInterval)
	window.setInterval(function(){

		// SSDP updates
		c.ssdp.updateCache();

		// UPNP updates
		c.upnp.processServices(c.ssdp.getServices());

	}, 5000);
});
