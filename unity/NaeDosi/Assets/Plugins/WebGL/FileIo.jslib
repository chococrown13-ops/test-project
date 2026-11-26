mergeInto(LibraryManager.library, {
  // A city file to the player's downloads.
  FileIoDownload: function (name, text) {
    var n = UTF8ToString(name), t = UTF8ToString(text);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' }));
    a.download = n;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  },
  // A file picker; the chosen file's text goes back to the game object's method.
  FileIoPick: function (target, method) {
    var go = UTF8ToString(target), m = UTF8ToString(method);
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.city,text/plain';
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      f.text().then(function (t) { SendMessage(go, m, t); });
    };
    input.click();
  },
});
