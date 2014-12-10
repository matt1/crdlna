/**
 * Provides a basic SSDP handler that will set up UDP multicast listeners and look for services 
 * advertising via the SSDP protocol.  
 *
 * For each SSDP service found, a javascript object will be made available that contains the 
 * salient information about that service (n.b. we add some stuff to make house keeping easier,
 * such as expiration dates for cache control) that can be used elsewhere, e.g.:
 *
 * var service = {
 *   cachecontrol: "max-age=60"
 *   location: "http://192.168.0.1:1234/MadeUpUrl.xml"
 *   nt: "urn:schemas-upnp-org:device:MediaServer:1"
 *   nts: "ssdp:alive"
 *   usn: "uuid:1a2b3c4d-1234-abcd-1234-abcdef"
 * }
 *
 */
var SSDP = function(config) {
  var c = config || {};

  this.address = c.address || '0.0.0.0'; 
  this.port = c.port || 1900;
  this.multicast = c.multicast || '239.255.255.250';

  this.socketId = -1;
  this.bufferLength = c.bufferLength || 4096;

  this.services = [];

};

/**
 * Gets a service by filtering on the service type name
 */
SSDP.prototype.getServices = function(filter) {
  var matchedServices = this.services.filter(function (v, i, a) {
    if (v.nt && v.nt.indexOf(filter) > -1) {
      return true;
    } else {
      return false;
    }
  });
  return matchedServices;
};

/**
 * Adds a service to the cache
 */
SSDP.prototype.addServiceToCache = function(service) {

  if (!service.usn) {
    this.log('Service with no USN: ' + service);
    return;
  }

  // remove any old entry for this service
  this.removeServiceFromCache(service);
  this.services.push(service);
};

/**
 * Remove service from cache if it already exists
 */
SSDP.prototype.removeServiceFromCache = function(service) {

  if (!service.usn) {
    this.log('Service with no USN: ' + service);
    return;
  }

  // remove any old entry for this service
  this.services = this.services.filter(function (v, i, a) {
    if (v.usn == service.usn) {
      return false;
    } else {
      return true;
    }
  });

};

/**
 * Updates the cache, removing anything that has expired
 */
SSDP.prototype.updateCache = function() {
  this.services = this.services.filter(function (v, i, a) {
    if (v.expires) {
      if (v.expires < Date.now()) {
        // remove
        return false;
      } else {
        return true;
      }
    } else {
      // remove anything we dont have an expiration for
      return false;
    }
  });
};

/**
 * Log a message with an appropriate prefix
 */
SSDP.prototype.log = function(message) {
  console.log("SSDP: " + message);
};

/**
 *  Handles incomming UDP data
 */
SSDP.prototype.pollData = function() {
  var that = this;
  if (that.socketId > -1) {
    chrome.socket.recvFrom(that.socketId, that.bufferLength, function (result) {
      if (result.resultCode >= 0) {
        var data = that.bufferToString(result.data);
        // TODO: move cache check to a timer so that we refresh regardless of data arriving or not
        that.updateCache();
        that.processNotify(data);
        that.pollData();
      } else {
        that.log("Error handling data");
      }
    });
  }
};

/**
 * Processes the NOTIFY broadcast and stores the service details in the
 * services array
 */
SSDP.prototype.processNotify = function(str) {
  var notify = {};
  if (str.indexOf('NOTIFY') < 0) {
// only interested in notify broadcasts
    return;
  }
  str.replace(/([A-Z\-]*){1}:([a-zA-Z\-_0-9\.:=\/ ]*){1}/gi, 
    function (match, m1, m2) {
      var name = m1.toLowerCase().trim();
      name = name.replace('-',''); // remove any hypens, e.g. cache-control
      notify[name] = m2.trim();
    });

  // Check for expiration/max-age
  if (notify.cachecontrol) {
    var expires = notify.cachecontrol.split('=')[1];
    notify.expires = Date.now() + (Number(expires) * 1000);
  }

  // Check for graceful byebye messages
  if (notify.nts == 'ssdp:byebye') {
    this.removeServiceFromCache(notify);
  } else {  // ssdp:alive
    this.addServiceToCache(notify);
  }
};

/**
 *  Initialise the SSDP connection
 */
SSDP.prototype.init = function() {
  this.log("Initialising...");
  
  var that = this;
  chrome.socket.create('udp', function (socket) {
    var socketId = socket.socketId;

    // House keeping on TTL & loopback
    chrome.socket.setMulticastTimeToLive(socketId, 12, function (result) {
      if (result !== 0) {
        that.log('Error setting multicast TTL' + result);
      }});

    chrome.socket.setMulticastLoopbackMode(socketId, true, function (result) {
      if (result !== 0) {
        that.log('Error setting multicast loop-back mode: ' + result);
      }
    });

    chrome.socket.bind(socketId, that.address, that.port, function (result) {
      if (result !== 0) {
        that.log('Unable to bind to new socket: ' + result);
      } else {
        chrome.socket.joinGroup(socketId, that.multicast, function (result) {
          if (result !== 0) {
            that.log('Unable to join multicast group ' + that.multicast + ': ' + result);
          } else {
            that.socketId = socketId;
            that.sendDiscover();
            that.pollData();  
            that.log("Waiting for SSDP broadcasts.");             
          }
        });
      }
    });
  });
};

/**
 * Send a discover message
 */
SSDP.prototype.sendDiscover = function() {
  var that = this;
  var search = 'M-SEARCH * HTTP/1.1\r\n' +
    'HOST: 239.255.255.250:1900\r\n' +
    'MAN: ssdp:discover\r\n' +
    'MX: 10\r\n' +
    'ST: ssdp:all\r\n\r\n';

  var buffer = this.stringToBuffer(search);
  chrome.socket.sendTo(this.socketId, buffer, that.multicast, 
    that.port, function(info) { });
};

/**
 *  Leave groups and close any open sockets
 */
SSDP.prototype.shutdown = function() {
  this.log('Closing sockets');

  chrome.sockets.udp.getSockets(function(sockets) {
    sockets.forEach(function(socket) {
      // Chrome auto leaves groups for us
      chrome.sockets.udp.close(socket.socketId);
    });
  });
};

/**
 * Converts a string to an array buffer
 */
SSDP.prototype.stringToBuffer = function(str) {
  // courtesy of Renato Mangini / HTML5Rocks
  // http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint8Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
};

/**
 * Converts a buffer back to a string
 */
SSDP.prototype.bufferToString = function(buffer) {
  // courtesy of Renato Mangini / HTML5Rocks
  // http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
  return String.fromCharCode.apply(null, new Uint8Array(buffer));
};