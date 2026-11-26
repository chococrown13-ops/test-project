// 도시 구경 between copies of the Unity game: one player shows their city under a five-letter code, friends who type
// it see it and get fresh copies while they watch. Browsers talk directly (WebRTC through PeerJS); a free public
// broker only introduces them. The ids use their own prefix, so Unity copies only meet Unity copies.
mergeInto(LibraryManager.library, {
  $VisitState: { go: '', peer: null, conns: [], last: null, vpeer: null, loading: null },

  $VisitLib__deps: ['$VisitState'],
  $VisitLib: {
    send: function (method, arg) { SendMessage(VisitState.go, method, arg === undefined ? '' : String(arg)); },
    load: function () {
      if (window.Peer) return Promise.resolve();
      if (VisitState.loading) return VisitState.loading;
      VisitState.loading = new Promise(function (ok, fail) {
        var s = document.createElement('script');
        s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
        s.onload = function () { ok(); }; s.onerror = function () { VisitState.loading = null; fail(); };
        document.head.appendChild(s);
      });
      return VisitState.loading;
    },
    opts: function () { return { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } }; },
    err: function (type) {
      return type === 'peer-unavailable' ? '그 코드로 열린 도시가 없어요. 코드를 다시 확인해 주세요.'
        : type === 'network' || type === 'server-error' || type === 'socket-error' ? '연결 서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.'
        : type === 'browser-incompatible' ? '이 브라우저는 친구와 연결할 수 없어요.'
        : '연결하지 못했어요. 잠시 후 다시 해 주세요.';
    },
  },

  VisitInit__deps: ['$VisitState'],
  VisitInit: function (go) { VisitState.go = UTF8ToString(go); },

  VisitShowOpen__deps: ['$VisitState', '$VisitLib'],
  VisitShowOpen: function () {
    var CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    VisitLib.load().then(function () {
      var tryOpen = function (left) {
        var code = '';
        for (var k = 0; k < 5; k++) code += CH[(Math.random() * CH.length) | 0];
        var peer = new window.Peer('naedosi-unity-' + code, VisitLib.opts());
        peer.on('open', function () { VisitState.peer = peer; VisitLib.send('OnShowCode', code); });
        peer.on('error', function (e) {
          if (e.type === 'unavailable-id' && left > 0) { peer.destroy(); tryOpen(left - 1); return; }
          if (!VisitState.peer) VisitLib.send('OnShowError', VisitLib.err(e.type));
        });
        peer.on('connection', function (c) {
          c.on('open', function () {
            VisitState.conns.push(c);
            VisitLib.send('OnShowCount', VisitState.conns.length);
            if (VisitState.last) c.send(VisitState.last);
          });
          var gone = function () { var i = VisitState.conns.indexOf(c); if (i >= 0) { VisitState.conns.splice(i, 1); VisitLib.send('OnShowCount', VisitState.conns.length); } };
          c.on('close', gone); c.on('error', gone);
        });
      };
      tryOpen(3);
    }, function () { VisitLib.send('OnShowError', '연결 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); });
  },

  VisitShowPush__deps: ['$VisitState'],
  VisitShowPush: function (z, host) {
    VisitState.last = { t: 'city', z: UTF8ToString(z), host: UTF8ToString(host) };
    VisitState.conns.forEach(function (c) { if (c.open) c.send(VisitState.last); });
  },

  VisitShowClose__deps: ['$VisitState'],
  VisitShowClose: function () {
    VisitState.conns.forEach(function (c) { try { c.send({ t: 'bye' }); } catch (e) {} });
    var p = VisitState.peer;
    setTimeout(function () { if (p) p.destroy(); }, 300);
    VisitState.peer = null; VisitState.conns = []; VisitState.last = null;
  },

  VisitJoin__deps: ['$VisitState', '$VisitLib'],
  VisitJoin: function (codePtr) {
    var code = UTF8ToString(codePtr).trim().toUpperCase();
    VisitLib.load().then(function () {
      var peer = new window.Peer(VisitLib.opts());
      VisitState.vpeer = peer;
      var got = false;
      var stop = function () { try { peer.destroy(); } catch (e) {} };
      peer.on('error', function (e) { if (!got) { stop(); VisitLib.send('OnVisitError', VisitLib.err(e.type)); } });
      peer.on('open', function () {
        var c = peer.connect('naedosi-unity-' + code, { reliable: true });
        var timer = setTimeout(function () { if (!got) { stop(); VisitLib.send('OnVisitError', '친구 도시에서 답이 없어요. 코드를 다시 확인해 주세요.'); } }, 20000);
        c.on('data', function (m) {
          if (m && m.t === 'city') { got = true; clearTimeout(timer); VisitLib.send('OnVisitCity', m.z); }
          if (m && m.t === 'bye') { stop(); VisitLib.send('OnVisitEnd', '친구가 도시 보여주기를 끝냈어요.'); }
        });
        c.on('close', function () { if (got) VisitLib.send('OnVisitEnd', '친구 도시와 연결이 끊겼어요.'); });
      });
    }, function () { VisitLib.send('OnVisitError', '연결 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); });
  },

  VisitStop__deps: ['$VisitState'],
  VisitStop: function () { if (VisitState.vpeer) { try { VisitState.vpeer.destroy(); } catch (e) {} VisitState.vpeer = null; } },
});
