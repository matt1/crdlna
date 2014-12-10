var CrDlna = function() {

};

document.addEventListener("DOMContentLoaded", function() {
	console.log("Starting Chrome DLNA...");
	
	CrDlna.ssdp = new SSDP();
	CrDlna.upnp = new UPNP();

	CrDlna.ssdp.init();
	CrDlna.upnp.init();


	// Make sure the SSDP cache resets periodically (doing it here as we have
	// access to window.setInterval)
	window.setInterval(function(){CrDlna.ssdp.updateCache();}, 5000);
	window.setInterval(function(){
		CrDlna.upnp.processServices(CrDlna.ssdp.getMediaServers());
	}, 5000);
});
