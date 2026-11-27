mergeInto(LibraryManager.library, {
  // The page's localStorage, where the web version of the game keeps its saved cities (about 5 MB, against 1 MB for Unity's PlayerPrefs).
  LsGet: function (key) {
    var v = null;
    try { v = localStorage.getItem(UTF8ToString(key)); } catch (e) { v = null; }
    if (v === null) return 0;
    var n = lengthBytesUTF8(v) + 1, p = _malloc(n);
    stringToUTF8(v, p, n);
    return p;
  },
  LsSet: function (key, value) {
    try { localStorage.setItem(UTF8ToString(key), UTF8ToString(value)); return 1; } catch (e) { return 0; }
  },
  LsRemove: function (key) {
    try { localStorage.removeItem(UTF8ToString(key)); } catch (e) { }
  },
});
