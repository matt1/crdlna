/**
 * Acts as a facade for all the communication with a UPnP MediaServer device.  Expects a device
 * object containing the appropriate bits and pieces parsed out of the UPnP device description
 * document, e.g.
 *
 * var device = {
 *	name: 'ExampleName,
 *	services: [{
 *      serviceType: 'urn:schemas-upnp-org:service:ContentDirectory:1',
 *      serviceId: 'urn:upnp-org:serviceId:ContentDirectory',
 *      controlUrl: '/control/ContentDirectoryExample',
 *      eventSubUrl: '/event/ContentDirectoryExample',
 *      SCPDUrl: '/ContentDirectoryExmple.xml'
 *		}, ...
 *	],
 *  presentationURL: 'http://192.168.0.1'
 * };
 *
 * @constructor
 * @param {Object} device The object representing the UPnP device to use with this client
 */
var MediaServerClient = function(device) {
	this.device = device;

	// Find the ContentDirectory service
	this.contenDirectory = {};
	var contentDirs = this.device.services.filter(function (v, i, a) {
		if (v.serviceType && v.serviceType === 'urn:schemas-upnp-org:service:ContentDirectory:1') {
			return true;
		} else {
			return false;
		} 		
	});

	if (contentDirs.length >= 1) {
		// N.B. if this device has more than one content directory, we only look at the first one
		this.contenDirectory = contenDirs[0];
	}

};

/**
 * Browses the folder on the device.  Expects a folder ID to browse, if no ID is provided it 
 * defaults to "0" which is the root
 *
 * @param {string} [folderId=0] The ID of the folder to browse.
 */
MediaServerClient.prototype.browseFolder = function(folderId) {
	var objectId = folderId || 0;
	var that = this;

	var url = this.device.presentationURL + this.contenDirectory.controlUrl;
	var request = '<?xml version="1.0" encoding="UTF-8"?>' + 
				'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"' +
					's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
				'<s:Body>' +
		    	'<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">' +
		        '<ObjectID>' + objectId + '</ObjectID>' +
		        '<BrowseFlag>BrowseDirectChildren</BrowseFlag>' +
		        '<Filter>dc:title,upnp:album,upnp:artist</Filter>' + 
		        '<StartingIndex>0</StartingIndex>' + 
		        '<RequestedCount>30</RequestedCount>' + 
		        '<SortCriteria/>' + 
		    '</u:Browse>' +
		'</s:Body>'+
		'</s:Envelope>';

		var callback = function(data) {
			that.log('Got browse callback: ' + data);
		};

		this.postSOAP(url, request, callback);

};

/**
 * Posts the SOAP request to the server.
 *
 * @param {string} url The URL to post to
 * @param {string} soapMessage The actual SOAP XML message
 * @param {Object} callback The function callback used to handle the SOAP response
 * @private
 */
MediaServerClient.prototype.postSOAP = function(url, soapMessage, callback) {

	var xhr = new XMLHttpRequest();
	var that = this;

	xhr.open('POST', url, true);
	xhr.setRequestHeader('Content-Type', 'text/xml');
	xhr.setRequestHeader("Content-Length", message.length);	

	xhr.onreadystatechange = function() {
			if (xhr.readyState == 4 && xhr.status == 200) {
				xml = xhr.responseText;
				// callback is called with scope of this XHR callback handler
				callback.call(this, xml);
			}
	};

	try {
		xhr.send(soapMessage);
	} catch (err) {
		that.log(err);
	}

};

/**
 * Log a message with an appropriate prefix
 *
 * @private
 * @param {string} message The message to log  
 */
UPNP.prototype.log = function (message) {
  console.log("MediaServerClient: " + message);
};