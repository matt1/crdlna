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
 * @constructor
 * @param {Object} config Contains configuration details for the SSDP client.  Sepcifically
 * config.address is the IPv4 address to bind this socket to, config.port is the multicast port to
 * use, config.multicast is the multicast address to use, config.bufferLength is the length of the
 * socket buffer
 */
var SSDP = function(config) {
  var c = config || {};

  this.address = c.address || '0.0.0.0'; 
  this.port = c.port || 1900;
  this.multicast = c.multicast || '239.255.255.250';

  this.socketId = -1;
  this.bufferLength = c.bufferLength || 8192;

  this.services = [];

};

/**
 *  Initialise the SSDP connection by opening a UDP socket and joining the multicast group.
 */
SSDP.prototype.init = function() {
  this.log("Initialising...");

  var that = this;
  chrome.sockets.udp.create({}, function (socket) {
    var socketId = socket.socketId;
    chrome.sockets.udp.onReceive.addListener(function(result) {
        var data = that.bufferToString(result.data);
        console.log(result, data);
        that.processNotify(data);
    })
    // House keeping on TTL & loopback
    chrome.sockets.udp.setMulticastTimeToLive(socketId, 12, function (result) {
      if (result !== 0) {
        that.log('Error setting multicast TTL' + result);
      }});

    chrome.sockets.udp.setMulticastLoopbackMode(socketId, true, function (result) {
      if (result !== 0) {
        that.log('Error setting multicast loop-back mode: ' + result);
      }
    });


    // use port 0 to pick a free port
    // this solves Address In Use (-147) error when there are other SSDP servers on the same machine
    chrome.sockets.udp.bind(socketId, that.address, 0, function (result) {
      if (result !== 0) {
        that.log('Unable to bind to new socket: ' + result);
      } else {
        chrome.sockets.udp.joinGroup(socketId, that.multicast, function (result) {
          if (result !== 0) {
            that.log('Unable to join multicast group ' + that.multicast + ': ' + result);
          } else {
            that.socketId = socketId;            
            that.sendDiscover();
            that.log("Waiting for SSDP broadcasts.");
          }
        });
      }
    });
  });
};

/**
 * Send a discover/M-SEARCH message
 * @param {Object} config Contains configuration settings for the discover message, config.delay
 * contains the delay in seconds that SSDP services should wait before sending a response
 */
SSDP.prototype.sendDiscover = function(config) {
  var that = this;
  var c = config || {};
  var respondDelay = c.delay || 3;

  var search = 'M-SEARCH * HTTP/1.1\r\n' +
    'HOST: 239.255.255.250:1900\r\n' +
    'MAN: ssdp:discover\r\n' +
    'MX: ' + respondDelay + '\r\n' +
    'ST: ssdp:all\r\n\r\n';

  var buffer = this.stringToBuffer(search);
  chrome.sockets.udp.send(this.socketId, buffer, that.multicast,
    that.port, function(info) {
      that.log("Sent M-SEARCH discovery message...");
    });
};


/**
 * Processes the NOTIFY broadcast and stores the service details in the services array
 * @param {string} str Contains the string of the NOTIFY resposne sent by SSDP services.
 * @private 
 */
SSDP.prototype.processNotify = function(str) {
  var notify = {};

  if (0 && str.indexOf('NOTIFY') < 0) {
    // only interested in notify broadcasts
    // check temporary disabled - I have packets without NOTIFY prefix (very strange)
    return;
  }
  str.replace(/([A-Z\-]*){1}:([^\n]*){1}/gi, 
    function (match, m1, m2) {
      var name = m1.toLowerCase().trim();
      name = name.replace('-',''); // remove any hypens, e.g. cache-control
      notify[name] = m2.trim();
    });
  if(!notify.usn)
    return;

  console.log('notify packet', notify)

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
 * Leave groups and close any open sockets
 * @private
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
 * Gets all discovered services that we already know about.  Does not start a new discover and will
 * only return services that we've already seen and which have not expired.
 *
 * @param {string} filter Contains a string filter used to include services which match the filter, 
 * or all services if no filter is provided
 */
SSDP.prototype.getServices = function(filter) {
  if (!filter) {
    return this.services;
  } 

  // Refresh the cache before we return anything to remove anything which may have expired.
  this.updateCache();

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
 * @param {Object} service Service that should be added to the cachce
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
 * @param {Object} service Service that should be removed from the cachce 
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
 * Converts a string to an array buffer
 * @param {string} str String to e converted
 * @private 
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
 * @param {ArrayBuffer} buffer ArrayBuffer to be converted back to a string
 * @private
 */
SSDP.prototype.bufferToString = function(buffer) {
  // courtesy of Renato Mangini / HTML5Rocks
  // http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
  return String.fromCharCode.apply(null, new Uint8Array(buffer));
};

/**
 * Log a message with an appropriate prefix
 * @private
 * @param {string} message The message to log 
 */
SSDP.prototype.log = function(message) {
  console.log("SSDP: " + message);
};

