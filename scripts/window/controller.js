var crdlnaApp = angular.module('crdlnaApp', []);

crdlnaApp.controller('crdlnaController', function ($scope, $sce) {
	
	/**
	 * Handles clicks on the devices
	 */
	$scope.deviceClick = function(device) {
		$scope.currentDevice = device;
		$scope.currentContainer = device;	// initially set the device as the "selected item"

		// Create a new media server client service if we need to
		if (!$scope.mediaServerClients[device.name]) {
			console.log("New MediaServiceClient created for %s", device.name);
			$scope.mediaServerClients[device.name] = new MediaServerClient(device);
		}
		
		// Do initial browse of device to get root content items
		var client = $scope.mediaServerClients[device.name];
		client.browseFolder('0', function(data){
			$scope.$apply(function(){	
				data.parent = undefined;
				device.children = data;
			});
		});


	};

	/**
	 * Handles clicks on items within a device (e.g. folders, files)
	 */
	$scope.itemClick = function(item) {
	
		// Check what we're clicking - if it is a folder we'll need to drill-down
		if (item.type.indexOf('object.container') >= 0) {
			// folder click
			$scope.currentContainer = item;
			var client = $scope.mediaServerClients[$scope.currentDevice.name];
			client.browseFolder(item.id, function(data){
				$scope.$apply(function(){	
					data.parent = item;

					// Fetch album art for child items
					data.forEach(function(childItem) {
						if (childItem.albumArt) {
							// Get the data URL for the album art via XHR
							// TODO:  look into caching to disk using HTML5 file/local storage apis
							var xhr = new XMLHttpRequest();
							xhr.open('GET', childItem.albumArt, true);
							xhr.responseType = 'blob';
							xhr.onload = function(e) {
								$scope.$apply(function(){
							  	childItem.albumArt = window.URL.createObjectURL(xhr.response);
								});
							};
							xhr.send();
						}
					});

					item.children = data;
				});
			});
		} else {			
			// non-container click
			if ($scope.currentItem) {
				// momentarily change the type to "reset" the audio tag in the view so that if we change the src attribute of
				// the video/audio tag whilst it is playing something else, we "reset" and play the new src (otherwise it will
				// just play the previous src as if nothing changed)
				var temp = $scope.currentItem.type;
				$scope.currentItem.type = undefined;
			} 

			// Fire off the change as a timeout to give angular a chance to reset the DOM so that the audio tag can play ok
			window.setTimeout(function(){
					$scope.$apply(function(){
						// Need to tell angular to trust these URLs otherwise it blocks binding to <audio/video/webview> src 
						item.url = $sce.trustAsResourceUrl(item.url);
						$scope.currentItem = item;
					});
				}, 10);


		}

	};


	// Entry point
	// ======================================================================
	console.log("Starting Chrome DLNA...");

	// Create object to contain a media server client for each device
	$scope.mediaServerClients = {};

	// Set up SSDP & UPNP services
  $scope.ssdp = new SSDP();
  $scope.upnp = new UPNP({
		deviceCallback: function() {
			// Need to use $apply here since the SSDP & UPNP stuff is happening outside of angular
			$scope.$apply(function(){	
				console.log("Got new UPNP device.");
				$scope.devices = $scope.upnp.getDevices();
			});
		}
	});

	$scope.ssdp.init();
	$scope.upnp.init();

	// Make sure the SSDP cache resets periodically 
	window.setInterval(function(){
		$scope.$apply(function(){
			// SSDP cache update to remove anything stale
			$scope.ssdp.updateCache();

			// UPNP update to process the available services
			$scope.upnp.processServices($scope.ssdp.getServices());
		});
		

	}, 2500);

});