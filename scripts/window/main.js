/**
 *
 * @constructor
 */
var CrDlna = function() {

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
CrDlna.prototype.updateDeviceList = function() {
		var devices = this.upnp.getDevices();
		var list = document.querySelector('#devices');
		list.innerHTML = '';

		devices.forEach(function (v, i, a) {
			var device = document.createElement('div');
			device.innerText = v.name;
			list.appendChild(device);
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
