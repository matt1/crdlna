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
			var listing = document.createElement('div');
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
			container.appendChild(listing);
			list.appendChild(container);
		});

};

/**
 * Draws any child folders
 *
 * @param {Object} elem The element into which to add the child items
 * @param {Object} data The object contianing the child folder data 
 */
CrDlna.prototype.drawChildFolders = function (device, elem, data) {
	if (!data) return;

	var that = this;
	var list = document.createElement('ul');

	data.forEach(function (v, i, a){
		var child = document.createElement('li');		
		child.setAttribute('objectId', v.id);
		child.setAttribute('type', v.type);
		if (v.type.indexOf('object.item') >= 0) {
			// Item
			child.innerHTML = '<p>' + v.title + '</p><audio controls preload="none"><source src="' + v.url + '"></audio>';
		} else {
			// Container

			child.innerText = v.title;
			child.addEventListener('click', function (){			

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
		list.appendChild(child);
	});

	elem.innerHTML = '';
	elem.appendChild(list);
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
