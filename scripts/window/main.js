var CrDlna = function() {

};

document.addEventListener("DOMContentLoaded", function() {
	console.log("Starting Chrome DLNA...");
	CrDlna.ssdp = new SSDP();
	CrDlna.ssdp.init();
});
