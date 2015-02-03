/**
 *
 * @constructor
 */
var CrDlna = function() {
	this.clients = {};
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
			var listing = document.querySelector('#content')
			device.innerText = v.name;
			device.setAttribute('objectId', '0');

			// If this client has a content directory service, add a click listener
			if (that.clients[v.name] && that.clients[v.name].contentDirectory) {
				device.addEventListener('click', function (){				
					
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
							that.drawChildFolders(that.clients[v.name].device, listing, data);
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
 * Draws any child items
 *
 * @param {Object} elem The element into which to add the child items
 * @param {Object} data The object contianing the child folder data 
 */
CrDlna.prototype.drawChildFolders = function (device, elem, data) {
	if (!data || !elem) return;

	var that = this;
	elem.innerHTML = '';

	var playback = document.querySelector('#playback');

	data.forEach(function (v, i, a){
		var child = document.createElement('div');		
		child.classList.add('contentItem');
		child.setAttribute('objectId', v.id);
		child.setAttribute('type', v.type);
		if (v.type.indexOf('videoItem') >= 0) {
			// Video Item
			child.innerHTML = '<p>' + v.title + '</p><video width="300" height="240" controls preload="none"><source src="' + v.url + '"></video>';
		
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
			child.innerText = v.title;
			child.addEventListener('click', function () {			

				var sendBrowseRequest = new Promise(function(resolve, reject) {				
						var client = that.clients[device.name];
							if (client) {
								client.browseFolder(v.id, resolve);
							} else {
								reject(new Error('No client was found for the device ' + v.name));
							}
				});

				sendBrowseRequest.then(
					function (data) {
						that.drawChildFolders(device, elem, data);
					}, function (error) {
						console.log("error getting child folders");
				});

			});
		}
		elem.appendChild(child);
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
