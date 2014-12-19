/**
 * Acts as a facade for all the communication with a UPnP MediaServer device.  Expects a device
 * object containing the appropriate bits and pieces parsed out of the UPnP device description
 * document, e.g.
 *
 * var device = {
 *  name: 'ExampleName,
 *  services: [{
 *      serviceType: 'urn:schemas-upnp-org:service:ContentDirectory:1',
 *      serviceId: 'urn:upnp-org:serviceId:ContentDirectory',
 *      controlUrl: '/control/ContentDirectoryExample',
 *      eventSubUrl: '/event/ContentDirectoryExample',
 *      SCPDUrl: '/ContentDirectoryExmple.xml'
 *    }, ...
 *  ],
 *  presentationURL: 'http://192.168.0.1'
 * };
 *
 * @constructor
 * @param {Object} device The object representing the UPnP device to use with this client
 */
var MediaServerClient = function(device) {
  this.device = device;

  // Find the ContentDirectory service
  var contentDirs = this.device.services.filter(function (v, i, a) {
    if (v.serviceType && v.serviceType == 'urn:schemas-upnp-org:service:ContentDirectory:1') {
      return true;
    } else {
      return false;
    }     
  });

  if (contentDirs.length >= 1) {
    // N.B. if this device has more than one content directory, we only look at the first one
    this.contentDirectory = contentDirs[0];
  } 

};


/**
 * Posts the SOAP request to the server.
 *
 * @param {string} url The URL to post to
 * @param {string} action The SOAP Action header value
 * @param {string} soapMessage The actual SOAP XML message
 * @param {Object} callback The function callback used to handle the SOAP response
 * @private
 */
MediaServerClient.prototype.postSOAP = function(url, action, soapMessage, callback) {

  var xhr = new XMLHttpRequest();
  var that = this;

  xhr.open('POST', url, true);
  xhr.setRequestHeader('SOAPAction', action);
  xhr.setRequestHeader('Content-Type', 'text/xml; charset="utf-8"');


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
 * Browses the folder on the device.  Expects a folder ID to browse, if no ID is provided it 
 * defaults to "0" which is the root
 *
 * @param {string} [folderId=0] The ID of the folder to browse.
 */
MediaServerClient.prototype.browseFolder = function(folderId, callback) {
  var objectId = folderId || 0;
  var that = this;
  var callerCallback = callback;

  // cant use presentation URL for the POST url as sometimes it is wrong on some devices!
  var host = this.device.location.match(/(http[s]{0,1}:\/\/[a-z0-9-\.:]*)/)[0];
  var url = host + this.contentDirectory.controlUrl;
  var action = '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"';  // Have to quote it!
  var request = '<?xml version="1.0" encoding="UTF-8"?>' + 
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
          's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
        '<s:Body>' +
          '<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">' +
            '<ObjectID>' + objectId + '</ObjectID>' +
            '<BrowseFlag>BrowseDirectChildren</BrowseFlag>' +
            '<Filter>dc:title,dc:date,microsoft:userRating,res,res@duration,res@size,res@bitrate,' +
            'res@sampleFrequency,res@bitsPerSample,res@nrAudioChannels,upnp:albumArtURI,' +
            'upnp:originalTrackNumber,upnp:PlayCounter,upnp:rating,upnp:album,upnp:artist,' +
            'upnp:genre,upnp:author,upnp:actor,upnp:director,upnp:producer,upnp:publisher,' +
            'container@childCount,@childCount</Filter>' + 
            '<StartingIndex>0</StartingIndex>' + 
            '<RequestedCount>30</RequestedCount>' + 
            '<SortCriteria/>' + 
        '</u:Browse>' +
    '</s:Body>'+
    '</s:Envelope>';


    var response = {};
    var decodeResponse = function(data) {
      // The resposne comes back as percent-encoded DIDL-lite document held within the SOAP
      // reult tag.
      var parser = new DOMParser();
      var xmlDoc = parser.parseFromString(data, 'application/xml');
      var didl = xmlDoc.querySelector('Result').textContent;
      didl = decodeURI(didl);
      var didlDoc = parser.parseFromString(didl, 'application/xml');
      var filesAndFolders = that.parseDidl(didlDoc);

      // now call the provided callback!
      callerCallback(filesAndFolders);

    };

    // we use our own callback to process the SOAP response, the one provided in the arguments is
    // called by our callback once we've done some processing first.
    this.postSOAP(url, action, request, decodeResponse);

};

/**
 * Given a XML document with the DIDL data, extracts out the salient information as a javascript
 * object.
 *
 * @param {Oject} didlDoc The XML document to extract data from
 * @returns Javascript array containing objects for each item (e.g. file or folder)
 * @private
 */
MediaServerClient.prototype.parseDidl = function (didlDoc) {
  if (!didlDoc || didlDoc.children.length < 1) return;

  var items = [];
  var containers = didlDoc.querySelectorAll('container');  
  var files = didlDoc.querySelectorAll('item');

  [].forEach.call(containers, (function (container, i, a){
    var title = container.querySelector('title').textContent;
    var type = container.querySelector('class').textContent;
    var id = container.getAttribute('id');
    var parentId = container.getAttribute('parentID');
    var childCount = container.getAttribute('childCount');

    if (type && type.indexOf('object.container') >= 0) {
      items.push({
        title: title,
        id: id,
        parentId: parentId,
        childCount: childCount,
        type: type
      });
    }
  }));


  [].forEach.call(files, (function (item, i, a){
    var title = item.querySelector('title').textContent;
    var type = item.querySelector('class').textContent;
    var res = item.querySelector('res').textContent;
    var id = item.getAttribute('id');
    var parentId = item.getAttribute('parentID');

      items.push({
        title: title,
        id: id,
        parentId: parentId,
        type: type,
        url: res
      });
    
  }));

  return items;

};

/**
 * Log a message with an appropriate prefix
 *
 * @private
 * @param {string} message The message to log  
 */
MediaServerClient.prototype.log = function (message) {
  console.log("MediaServerClient: " + message);
};