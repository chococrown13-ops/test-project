mergeInto(LibraryManager.library, {
  // The phone's safe-area insets in CSS pixels (notch or Dynamic Island, rounded corners, home bar), side: 0 top, 1 right, 2 bottom, 3 left.
  // Read from a hidden element padded with env(safe-area-inset-*); ?safe=t,r,b,l in the address overrides them for testing.
  SafeInset: function (side) {
    var q = /[?&]safe=([\d.,]+)/.exec(location.search);
    if (q) { var v = q[1].split(','); return parseFloat(v[side] || '0') || 0; }
    var d = document.getElementById('safe-probe');
    if (!d) return 0;
    var s = getComputedStyle(d);
    return parseFloat([s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft][side]) || 0;
  },
});
