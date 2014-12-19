/**
 * Queries services (found via SSDP) using XHR for the details of the servces they provide.
 *
 * @constructor
 * @param {Object} details Contains construction details, specifically should contain a
 * deviceCallack function to be called when new devices are added to the device cache
 */
var UPNP = function (details) {
	this.devices = [];
	this.deviceUrls = [];

	this.deviceCallback = details.deviceCallback;
	

};

/**
 *	Initialise the UPNP handler
 */
UPNP.prototype.init = function() {
	var that = this;

	this.log("Initialising...");	// actually nothing to do for now
};

/**
 * Process the services we know about by GETing their XML details from their location URL, parsing
 * the XML and then storing it for later use.
 *
 * The format of the parameter is basically a javascript object of the SSDP NOTIFY response, e.g.
 * the following is an example of the sort of thing we're expecting - the critical part is the 
 * location value as that contains the devices service description XML
 *
 * var service = {
 *   cachecontrol: "max-age=60"
 *   location: "http://192.168.0.1:1234/MadeUpUrl.xml"
 *   nt: "urn:schemas-upnp-org:device:MediaServer:1"
 *   nts: "ssdp:alive"
 *   usn: "uuid:1a2b3c4d-1234-abcd-1234-abcdef"
 * }
 * @private
 * @param {Object} services An array containing details of all services that we're going to process
 */
UPNP.prototype.processServices = function(services) {
	var that = this;
	var xml = '';
	var parser = new DOMParser();

	if (!services) return;

	services.forEach(function (service, i, a) {
		// check if we already know about this device or not
		if (!service.location || that.deviceUrls.indexOf(service.location) > -1) {
			// skip for now - we either tried to download alrady, or its malformed
		} else {

		
			var xhr = new XMLHttpRequest();
			xhr.open('GET', service.location, true);
			xhr.onreadystatechange = function() {
					if (xhr.readyState == 4 && xhr.status == 200) {
						xml = xhr.responseText;
						var deviceDoc = parser.parseFromString(xml, 'application/xml');
						that.processDevice(deviceDoc, service.location);
					}
			};

			try {
				// Keep track of visited URLs so we dont visit too many times
				that.deviceUrls.push(service.location);
				xhr.send();
			} catch (err) {
				that.log(err);
			}

		}
	});
};

/**
 * Processes a UPnP's devices XML device document (retrieved from SSDP's data for the service) and
 * generates javascript object representing the XML data.  Finally adds it to the device collection
 *
 * @param {string} deviceDoc The XML string returned from the device's location URL
 * @param {string} location The device's location URL
 * @private
 */
UPNP.prototype.processDevice = function (deviceDoc, location) {
	if (!deviceDoc || deviceDoc.children.length < 1) return;

	var xmlDeviceType = deviceDoc.querySelector('deviceType').textContent;
	var xmlName = deviceDoc.querySelector('friendlyName').textContent;
	var xmlUDN = deviceDoc.querySelector('UDN').textContent;
	var xmlPresentationUrl = (deviceDoc.querySelector('presentationURL') || {textContent:''}).textContent;
	var xmlIcons = deviceDoc.querySelectorAll('iconList icon');
	var xmlServices = deviceDoc.querySelectorAll('serviceList service');

	var icons = [];
	[].forEach.call(xmlIcons, function (v, i, a) {
		var w = v.querySelector('width').textContent;
		var h = v.querySelector('height').textContent;
		var url = v.querySelector('url').textContent;
		var mime = v.querySelector('mimetype').textContent;
		icons.push({
			width: w,
			height: h,
			url: url,
			mimeType: mime
		});
	});

	var services = [];
	[].forEach.call(xmlServices, function (v, i, a) {
		var st = v.querySelector('serviceType').textContent;
		var sid = v.querySelector('serviceId').textContent;
		var controlUrl = v.querySelector('controlURL').textContent;
		var eventUrl = v.querySelector('eventSubURL').textContent;
		var scpdUrl = v.querySelector('SCPDURL').textContent;
		services.push({
			serviceType: st,
			serviceId: sid,
			controlUrl: controlUrl,
			eventSubUrl: eventUrl,
			SCPDUrl: scpdUrl
		});
	});

	var device = {
		location: location,
		type: xmlDeviceType,
		name: xmlName,
		usn: xmlUDN,		// Is this really the same USN we're seeing in SSDP?
		services: services,
		icons: icons,
		presentationURL: xmlPresentationUrl
	};

	this.addDevice(device);
};

/**
 * Checks to see if this is a knoww URL so we dont try to process it over and over.
 *
 * @param {string} url The location URL of the device we're checking
 * @returns {Boolean} True if the device is one we already have in our device cache
 * @private
 */
UPNP.prototype.knownDevice = function(url) {
	var found = false;
	this.devices.forEach(function (v, i, a) {
		if (v.location == url) {
			found = true;
		}
	});
	return found;
};

/**
 * Adds a device to the collection.  If there is an existing device with the same location/URL
 * already in the collection, it will be deleted first.
 *
 * @param {Object} decice The device to add
 */
UPNP.prototype.addDevice = function(device) {
	var known = this.knownDevice(device);
	
	if (known) {
		this.removeDevice(device);
	}

	this.devices.push(device);

	if (!known) {
		// Let other interested parties know that we have a new device
		if (this.deviceCallback) {
			this.deviceCallback();
		}
	}
};

/**
 * Removes a device from its collection based on its location/URL
 *
 * @param {Object} decice The device to remove 
 */
UPNP.prototype.removeDevice = function(device) {
	this.devices = this.devices.filter(function (v, i, a) {
		if (v.location == device.location) {
			return false;
		} else {
			return true;
		}
	});
};

/**
 * Gets the known devices
 *
 * @returns {Array} Array of known devices
 */
UPNP.prototype.getDevices = function() {
	return this.devices;
};

/**
 *	Set the servives that should be retrieved
 */
UPNP.prototype.setServices = function (services) {
	this.services = services;
};

/**
 * Log a message with an appropriate prefix
 *
 * @private
 * @param {string} message The message to log 
 */
UPNP.prototype.log = function (message) {
  console.log("UPNP: " + message);
};