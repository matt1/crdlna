/**
 *	Queries services (found via SSDP) using XHR for the details of the servces they provide
 */
var UPNP = function () {

	this.devices = [];

};

/**
 *	Initialise the UPNP handler
 */
UPNP.prototype.init = function() {
	var that = this;

	this.log("Initialising...");

};

/**
 * Process the services we know about by loading their XML details from their location URL, parsing
 * the XML and then storing it for later use.
 */
UPNP.prototype.processServices = function(services) {
	var that = this;
	var xml = '';
	var parser = new DOMParser();

	if (!services) return;

	services.forEach(function (v, i, a) {
		
		if (v.location) {
			var xhr = new XMLHttpRequest();
			xhr.open('GET', v.location, true);
			xhr.onreadystatechange = function() {
					if (xhr.readyState == 4 && xhr.status == 200) {
						xml = xhr.responseText;
						var deviceDoc = parser.parseFromString(xml, 'application/xml');
						that.processDevice(deviceDoc);
					}
			};
			xhr.send();
		} else {
			that.log('Service ' + v.usn +  ' had no location header!');
		}
	});
};

/**
 * Processes a UPnP's devices XML device document (retrieved from SSDP's data for the service) and
 * generates javascript object representing the XML data.  Finally adds it to the device collection
 */
UPNP.prototype.processDevice = function (deviceDoc) {
	if (!deviceDoc || deviceDoc.children.length < 1) return;

	var xmlDeviceType = deviceDoc.querySelector('deviceType').textContent;
	var xmlName = deviceDoc.querySelector('friendlyName').textContent;
	var xmlUDN = deviceDoc.querySelector('UDN').textContent;
	var xmlPresentationUrl = deviceDoc.querySelector('presentationURL').textContent;
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
			contorlUrl: controlUrl,
			eventSubUrl: eventUrl,
			SCPDUrl: scpdUrl
		});
	});

	var device = {
		type: xmlDeviceType,
		name: xmlName,
		UDN: xmlUDN,
		services: services,
		icons: icons,
		presentationURL: xmlPresentationUrl
	};

	this.addDevice(device);
};

/**
 * Adds a device to the collection.  If there is an existing device with the same UDN value/na,e
 * already in the collection, it will be deleted.
 */
UPNP.prototype.addDevice = function(device) {
	this.removeDevice(device);
	this.devices.push(device);
};

/**
 *	Removes a device from its collection based on its UDN
 */
UPNP.prototype.removeDevice = function(device) {
	var that = this;

	this.devices = this.devices.filter(function (v, i, a) {
		if (v.UDN == device.UDN) {
			return false;
		} else {
			return true;
		}
	});
};

/**
 *	Set the servives that should be retrieved
 */
UPNP.prototype.setServices = function (services) {
	this.services = services;
};

/**
 * Log a message with an appropriate prefix
 */
UPNP.prototype.log = function (message) {
  console.log("UPNP: " + message);
};