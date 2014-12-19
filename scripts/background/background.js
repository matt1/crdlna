chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('html/window.html', {
    'bounds': {
      'width': 700,
      'height': 400
    }
  });
});