/**
 * やどたび v3.0 — 画面本体
 *
 * ゴールはただ1つ「宿を選んだら提案が出る」。ユーザーに入力させる要素は置かない。
 * 画面は1つ、状態は2つだけ。
 *   状態A(select) … 地図＋検索＋エリアチップ。宿を「選ぶ」だけの面。
 *   状態B(feed)   … 選んだ宿の周辺提案フィード。スクロールして眺めるだけの面。
 *
 * 状態は state に集約し、描画は render() 経由に一本化する。
 * DOM文字列を組み立てる箇所は必ず escapeHtml を通す。
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 定数
  // ---------------------------------------------------------------------------

  /** 初期位置(草津温泉)。位置情報の許可ダイアログは「操作」になるので使わない。 */
  var DEFAULT_VIEW = { lat: 36.6226, lon: 138.5960, zoom: 14 };

  /** エリアチップ。座標は直書き(ジオコーディングのAPI呼び出しを増やさないため)。 */
  var AREAS = [
    { label: '登別', lat: 42.4917, lon: 141.1500 },
    { label: '定山渓', lat: 42.9683, lon: 141.1653 },
    { label: '銀山', lat: 38.5750, lon: 140.5344 },
    { label: '鬼怒川', lat: 36.8144, lon: 139.7086 },
    { label: '日光', lat: 36.7539, lon: 139.5989 },
    { label: '草津', lat: 36.6226, lon: 138.5960 },
    { label: '伊香保', lat: 36.4886, lon: 138.9200 },
    { label: '軽井沢', lat: 36.3486, lon: 138.6360 },
    { label: '箱根', lat: 35.2324, lon: 139.1069 },
    { label: '熱海', lat: 35.0959, lon: 139.0717 },
    { label: '修善寺', lat: 34.9702, lon: 138.9264 },
    { label: '下呂', lat: 35.8058, lon: 137.2436 },
    { label: '有馬', lat: 34.7981, lon: 135.2478 },
    { label: '城崎', lat: 35.6247, lon: 134.8055 },
    { label: '白浜', lat: 33.6853, lon: 135.3403 },
    { label: '道後', lat: 33.8521, lon: 132.7861 },
    { label: '別府', lat: 33.2794, lon: 131.5006 },
    { label: '由布院', lat: 33.2647, lon: 131.3870 },
    { label: '黒川', lat: 32.9853, lon: 131.1461 },
    { label: '指宿', lat: 31.2286, lon: 130.6331 }
  ];

  /** この倍率より引いた地図では宿を取りに行かない(Overpassに広い範囲を投げないため)。 */
  var MIN_HOTEL_ZOOM = 13;

  /**
   * 「次の0件合流点で1回だけ自動ズームアウトしてよい」券。
   * flyTo() 経由(=?q=ジャンプ・検索候補・エリアチップ)のときだけ立てる。
   * 使ったら(0件で1段引いたら)必ず false に戻すので多重発火は構造的に起きない。
   */
  var autoZoomArmed = false;

  var DEBOUNCE_SEARCH_MS = 500;
  var DEBOUNCE_MOVE_MS = 600;

  var SKELETON_COUNT = 4;
  var RECENT_MAX = 5;

  var LS_RECENT = 'yado.recent.v3';
  var LS_MAPVIEW = 'yado.mapview.v3';

  var TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  /**
   * カテゴリラベル → 絵文字。
   * Card には category が無く categoryLabel しか入らないので、ラベル文字列で引く。
   * engine.js 独自の「自然・景勝」も含める。
   */
  var CATEGORY_EMOJI = {
    'テーマパーク': '🎡',
    '美術館・博物館': '🖼',
    '動物園': '🦁',
    '水族館': '🐟',
    '展望・景観': '🔭',
    '観光名所': '📷',
    '城・城跡': '🏯',
    '記念建造物': '🗿',
    '記念碑': '🗿',
    '遺跡': '🏛',
    '庭園': '🌸',
    '公園': '🌳',
    '神社・寺院': '⛩',
    '共同浴場': '♨',
    '滝': '💧',
    '湧水': '💧',
    '温泉': '♨',
    '温泉源': '♨',
    '洞窟': '🕳',
    '山頂': '⛰',
    '展望地': '🔭',
    '灯台': '🗼',
    '自然・景勝': '🏞',
    'スポット': '📍'
  };

  // ---------------------------------------------------------------------------
  // 状態
  // ---------------------------------------------------------------------------

  var state = {
    view: 'select',   // "select" | "feed"
    hotel: null,      // {id?, name, lat, lon}
    cards: [],
    more: [],         // 31〜60件目(「もっと見る」で展開する分)
    moreOpen: false,  // 「もっと見る」を展開済みか
    far: [],
    stage: null,      // null | "loading" | "osm" | "wiki" | "done" | "error"
    osmFailed: false, // Overpass が混雑して Wikipedia だけで提案したか
    embed: false      // ?embed=1 で他サイトの iframe に埋め込まれているか
  };

  /** 提案リクエストの世代番号。戻る→別の宿、の取り違えを防ぐ。 */
  var requestSeq = 0;

  /** 状態Bへの pushState を済ませたか。二重 push 防止のためのフラグ。 */
  var historyPushed = false;

  var els = {};
  var map = null;            // 状態Aの地図(1回だけ生成して使い回す)
  var hotelLayer = null;     // 宿ピンのレイヤ
  var feedMap = null;        // 状態Bの小さい地図
  var feedMarkers = [];
  var feedSpotMarkers = [];  // 番号バッジ→ピンを引くための配列(state.cardsと同じ順)
  var flashTimer = null;     // ピン点滅の連打対策(1本だけ持つ)
  var suggestItems = [];
  var lastSuggestQuery = '';

  // 受動ログ用: 多重記録・スクロール到達位置の追跡に使うモジュール変数
  var passiveViewedKey = null;
  var cardObserver = null;
  var maxSeenIndex = -1;

  /**
   * 撮影・目視QA専用のフラグ。URLパラメータが無ければ全て false のままで、
   * 通常動作には一切影響しない(データ層ではなく表示層だけを差し替える)。
   */
  var demoEmpty = false;      // ?simulate=empty  … 提案0件の画面を再現
  var demoFar = false;        // ?demo=far        … 「もっと遠く」を開いた状態
  var demoStateA = false;     // ?demo=suggest|recent|zoomout … 状態Aの撮影中
  var demoNoSaveView = false; // ?demo=zoomout    … 撮影用の地図位置を localStorage に残さない
  var demoPassive = false;    // ?demo=passive     … 受動ログの中身をその場で目視する
  var demoImgFail = false;    // ?demo=imgfail     … 先頭3枚のカード画像を強制的に読み込み失敗させる
  var demoPortrait = false;   // ?demo=portrait    … 先頭3枚を縦長ダミー画像に差し替える
  var demoNoHotels = false;   // ?demo=nohotels    … 宿が0件の画面を外部APIなしで再現する
  var debugRank = false;      // ?debug=1          … rank のスコア内訳をカードに淡色表示(fixture 必須)
  var isFixtureMode = false;  // ?fixture=…        … 固定データ読み込み成功時のバッジ表示フラグ
  var fixtureGeneratedAt = ''; // fixture の meta.generatedAt をローカル日付(YYYY-MM-DD)にした文字列

  // ---------------------------------------------------------------------------
  // 計測(?perf=1 のときだけ動く)
  //
  // 「宿を選んでから最初のカードが出るまで」を数値で見るためだけの仕掛け。
  // perfOn が false のときは perfMark が即 return するので、通常動作・DOM は一切変わらない。
  // ---------------------------------------------------------------------------

  var perfOn = false;
  var perfT0 = 0;
  var perfFirstCardDone = false;  // first-card-painted は1回だけ
  var perfLines = [];
  var perfBox = null;

  function perfNow() {
    return (global.performance && typeof global.performance.now === 'function')
      ? global.performance.now()
      : Date.now();
  }

  /** 計測の起点(状態Bに入った瞬間)を置き直す。 */
  function perfReset() {
    if (!perfOn) return;
    perfT0 = perfNow();
    perfFirstCardDone = false;
    perfLines = [];
    if (perfBox) perfBox.textContent = '';
  }

  function perfMark(label) {
    if (!perfOn) return;
    var ms = Math.round(perfNow() - perfT0);
    var line = '[perf] ' + label + ' ' + ms + 'ms';
    if (global.console && global.console.log) global.console.log(line);
    perfLines.push(label + ' ' + ms + 'ms');
    if (!perfBox) {
      perfBox = document.createElement('div');
      perfBox.id = 'perf-box';
      perfBox.setAttribute('style',
        'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:4px 6px;' +
        'background:rgba(0,0,0,.8);color:#fff;font:11px/1.4 monospace;' +
        'white-space:pre-wrap;pointer-events:none;');
      document.body.appendChild(perfBox);
    }
    perfBox.textContent = perfLines.join(' | ');
  }

  /** 実カードが1枚でも描けた最初の1回だけ、実際に塗られた時刻を打つ。 */
  function perfMarkFirstCard() {
    if (!perfOn || perfFirstCardDone || !state.cards.length) return;
    perfFirstCardDone = true;
    var raf = global.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    raf(function () { perfMark('first-card-painted'); });
  }

  // ---------------------------------------------------------------------------
  // 受動ログの目視ボックス(?demo=passive のときだけ動く)
  //
  // perfBox と同じ「フラグが無ければ何も作らない」方式。記録が増えるたびに更新する。
  // ---------------------------------------------------------------------------

  var passiveBox = null;

  function passiveSummaryLine(entry) {
    if (entry.type === 'view') return 'view ' + (entry.hotel && entry.hotel.name || '') + ' top' + ((entry.topIds && entry.topIds.length) || 0) + ' n' + entry.n;
    if (entry.type === 'tap') return 'tap #' + entry.index + ' ' + (entry.cardName || '');
    if (entry.type === 'link') return 'link ' + (entry.label || '') + ' #' + entry.index + ' ' + (entry.cardName || '');
    if (entry.type === 'seen') return 'seen max=' + entry.maxIndex;
    return entry.type;
  }

  function updatePassiveBox() {
    if (!demoPassive) return;
    var list = lsGet(PASSIVE_KEY);
    if (!Array.isArray(list)) list = [];
    if (!passiveBox) {
      passiveBox = document.createElement('pre');
      passiveBox.className = 'passivebox';
      document.body.appendChild(passiveBox);
    }
    var last = list.slice(-10);
    var lines = last.map(function (e) { return e.type + ' / ' + passiveSummaryLine(e); });
    passiveBox.textContent = '[passive] 総件数 ' + list.length + '\n' + lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // 小物
  // ---------------------------------------------------------------------------

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** http/https だけをリンクとして通す。javascript: 等を href に出さない。 */
  function safeUrl(url) {
    if (typeof url !== 'string') return null;
    var s = url.trim();
    return /^https?:\/\//i.test(s) ? s : null;
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fn.apply(self, args);
      }, ms);
    };
  }

  /** localStorage はプライベートモード等で例外を投げるので、読み書きとも黙って諦める。 */
  function lsGet(key) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function lsSet(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // 保存できなくても体験は続く
    }
  }

  // ---------------------------------------------------------------------------
  // 受動ログ(送信なし・端末内だけ)。詳細は docs/passive-log.md 参照。
  // ---------------------------------------------------------------------------

  var PASSIVE_KEY = 'yado.passive.v1';
  var PASSIVE_MAX = 200;
  var PASSIVE_MAX_AGE_DAYS = 90;
  var PASSIVE_MAX_AGE_MS = PASSIVE_MAX_AGE_DAYS * 86400000;

  /** type: 'view' | 'tap' | 'link' | 'seen'。lsGet/lsSet 経由で例外を握りつぶす。 */
  function passivePush(type, data) {
    var list = lsGet(PASSIVE_KEY);
    if (!Array.isArray(list)) list = [];
    var cutoff = Date.now() - PASSIVE_MAX_AGE_MS;
    list = list.filter(function (e) { return e && (typeof e.t !== 'number' || e.t >= cutoff); });
    var entry = { t: Date.now(), type: type };
    for (var k in data) { if (data.hasOwnProperty(k)) entry[k] = data[k]; }
    list.push(entry);
    if (list.length > PASSIVE_MAX) list = list.slice(-PASSIVE_MAX);
    lsSet(PASSIVE_KEY, list);
    updatePassiveBox();
  }

  function emojiFor(categoryLabel) {
    return CATEGORY_EMOJI[categoryLabel] || '📍';
  }

  /** 宿の種別で絵文字を変える。旅館・温泉宿は ♨。 */
  function hotelEmoji(hotel) {
    var kind = hotel && hotel.kind;
    if (kind === 'ryokan') return '♨';
    if (/旅館|温泉/.test((hotel && hotel.name) || '')) return '♨';
    return '🏨';
  }

  // ---------------------------------------------------------------------------
  // 最近選んだ宿
  // ---------------------------------------------------------------------------

  function getRecent() {
    var list = lsGet(LS_RECENT);
    return Array.isArray(list) ? list : [];
  }

  function pushRecent(hotel) {
    if (!hotel || !isFinite(hotel.lat) || !isFinite(hotel.lon)) return;
    var entry = { name: hotel.name, lat: hotel.lat, lon: hotel.lon, kind: hotel.kind || null };
    var list = getRecent().filter(function (r) {
      if (!r) return false;
      // 同じ宿を別の入口(ピン/検索/URL)から選ぶと座標が微妙に違うことがあるので、
      // 名前が同じならまず同一とみなす。名前が無いものだけ座標で見る。
      if (r.name && entry.name) return r.name !== entry.name;
      return !(Math.abs(r.lat - entry.lat) < 0.0005 && Math.abs(r.lon - entry.lon) < 0.0005);
    });
    list.unshift(entry);
    lsSet(LS_RECENT, list.slice(0, RECENT_MAX));
  }

  // ---------------------------------------------------------------------------
  // 状態A: 地図
  // ---------------------------------------------------------------------------

  function saveMapView() {
    if (!map || demoNoSaveView) return;
    var c = map.getCenter();
    lsSet(LS_MAPVIEW, { lat: c.lat, lon: c.lng, zoom: map.getZoom() });
  }

  function initialView() {
    var saved = lsGet(LS_MAPVIEW);
    if (saved && isFinite(saved.lat) && isFinite(saved.lon) && isFinite(saved.zoom)) {
      return { lat: saved.lat, lon: saved.lon, zoom: saved.zoom };
    }
    // R61: 地図位置の保存が無ければ「最近見た宿」の先頭にフォールバックする
    // (一度使った人が前回の続きから始まる体験改善。ズームは既定のまま)。
    var recent = getRecent();
    var latest = recent && recent[0];
    if (latest && isFinite(latest.lat) && isFinite(latest.lon)) {
      return { lat: latest.lat, lon: latest.lon, zoom: DEFAULT_VIEW.zoom };
    }
    return { lat: DEFAULT_VIEW.lat, lon: DEFAULT_VIEW.lon, zoom: DEFAULT_VIEW.zoom };
  }

  function ensureMap() {
    if (map) return map;
    var view = initialView();
    map = L.map(els.map, { zoomControl: true }).setView([view.lat, view.lon], view.zoom);
    // タイルレイヤは1回だけ足す(状態を行き来しても重複追加しない)
    var tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
    tiles.on('tileerror', function () {
      if (tileErrorNoticed) return;
      var now = Date.now();
      if (now - tileErrorWindowStart > TILE_ERROR_WINDOW_MS) {
        tileErrorWindowStart = now;
        tileErrorCount = 0;
      }
      tileErrorCount += 1;
      if (tileErrorCount >= TILE_ERROR_THRESHOLD) {
        tileErrorNoticed = true;
        setMapNote(TILE_ERROR_TEXT);
      }
    });
    hotelLayer = L.layerGroup().addTo(map);

    map.on('moveend', onMapMoved);
    return map;
  }

  function setMapNote(text) {
    if (!text) {
      els.mapNote.hidden = true;
      els.mapNote.textContent = '';
      return;
    }
    els.mapNote.hidden = false;
    els.mapNote.textContent = text;
  }

  // 自動ズーム(setZoom)は moveend を発火させるが、その場で loadHotelsInView を
  // 直接呼んでいるので、debounce 後の onMapMoved による再取得は無駄な二重発火になる。
  // 1回だけ吸収して構造的に防ぐ(立てたら必ず消費する)。
  var suppressNextMoveEnd = false;

  // R101: 1枚のタイル読み込み失敗はよくある一過性ノイズなので即表示しない。
  // 短時間(3秒以内)に複数枚(4枚以上)失敗したときだけ「壊れているらしい」と判断して1回だけ出す。
  var tileErrorNoticed = false;
  var tileErrorCount = 0;
  var tileErrorWindowStart = 0;
  var TILE_ERROR_WINDOW_MS = 3000;
  var TILE_ERROR_THRESHOLD = 4;
  var TILE_ERROR_TEXT = '地図の背景画像を読み込めませんでした。ピンと提案はそのまま使えます。';

  var onMapMoved = debounce(function () {
    if (suppressNextMoveEnd) { suppressNextMoveEnd = false; return; }
    if (state.view !== 'select' || !map) return;
    saveMapView();
    loadHotelsInView();
  }, DEBOUNCE_MOVE_MS);

  // A/Bで共有する0件文言(二重管理を避けるため定数化)
  var NO_HOTEL_TEXT = 'この範囲には宿のデータがありません。エリアチップか検索から選べます。';

  // R108: 案内文に出す入力値の上限(20字で .mapnote が 114px/地図の18%に収まる実測値)
  var QUERY_ECHO_MAX = 20;

  // R105: ?q= の地名が1件も見つからないときの案内(R94 の「状況。次にできること。」形式)
  function noQueryHitText(q) {
    var shown = q.length > QUERY_ECHO_MAX ? q.slice(0, QUERY_ECHO_MAX) + '…' : q;
    return '「' + shown + '」は見つかりませんでした。エリアチップか検索から選べます。';
  }

  function loadHotelsInView() {
    if (!map) return;
    // 状態Aの撮影中は宿ピンを取りに行かない(外部APIを叩かずに素の画面を撮るため)
    if (demoStateA) {
      hotelLayer.clearLayers();
      if (demoNoHotels) {
        setMapNote(NO_HOTEL_TEXT);
        return;
      }
      if (map.getZoom() < MIN_HOTEL_ZOOM) setMapNote('ズームすると宿が出ます');
      return;
    }

    if (map.getZoom() < MIN_HOTEL_ZOOM) {
      hotelLayer.clearLayers();
      setMapNote('ズームすると宿が出ます');
      return;
    }

    var b = map.getBounds();
    setMapNote('宿を探しています…');

    YadoGeo.fetchHotelsInBbox(b.getSouth(), b.getWest(), b.getNorth(), b.getEast())
      .then(function (hotels) {
        // 待っている間に状態Bへ移っていたら描かない
        if (state.view !== 'select') return;
        renderHotelPins(hotels);
        if (hotels.length) {
          autoZoomArmed = false;
          setMapNote('');
          return;
        }
        // エリアへ飛んだ直後の0件なら、下限を割らない範囲で1回だけ引いて探し直す
        if (autoZoomArmed && map.getZoom() - 1 >= MIN_HOTEL_ZOOM) {
          autoZoomArmed = false; // 先に落とす(再入しても2回目は発動しない)
          suppressNextMoveEnd = true; // この setZoom による moveend では再取得しない
          map.setZoom(map.getZoom() - 1, { animate: false });
          saveMapView();
          setMapNote('もう少し広い範囲で探しています…');
          loadHotelsInView(); // Overpass 追加1回・キャッシュがあれば0回
          return;
        }
        autoZoomArmed = false;
        setMapNote(NO_HOTEL_TEXT);
      })
      .catch(function (err) {
        if (state.view !== 'select') return;
        hotelLayer.clearLayers();
        // 混雑時は自動ズームしない(無料APIへの追加リクエストを増やさないため)
        autoZoomArmed = false;
        // 範囲が広すぎるときはズーム不足と同じ案内にする(利用者にとっては同じこと)
        if (err && err.tooWide) {
          setMapNote('ズームすると宿が出ます');
        } else if (err && err.overpassBusy) {
          // 「1分待て」で終わらせず、待たずに進める道(検索・エリアチップ)を案内する
          setMapNote('宿ピンの取得が混雑中です。検索やエリアチップから選べます。');
        } else {
          setMapNote((err && err.message) || '宿を取得できませんでした');
        }
      });
  }

  function renderHotelPins(hotels) {
    hotelLayer.clearLayers();
    hotels.forEach(function (h) {
      var icon = L.divIcon({
        className: 'pin pin--hotel',
        html: '<span role="img" aria-label="' + escapeHtml('宿 ' + h.name) + '">' + hotelEmoji(h) + '</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      var marker = L.marker([h.lat, h.lon], { icon: icon }).addTo(hotelLayer);
      marker.bindTooltip(h.name, { direction: 'top', offset: [0, -14], className: 'hoteltip', permanent: false });
      marker.on('click', function () { selectHotel(h); });
    });
  }

  function flyTo(lat, lon, zoom, force) {
    ensureMap();
    var z = zoom || DEFAULT_VIEW.zoom;
    // 直前と同じ座標・同じズームなら何もしない(無駄な再取得を防ぐ)。
    // force=true は ?demo=autozoom 専用: 初期位置と同じ座標へわざと飛んで0件合流を再現するため。
    if (!force) {
      var c = map.getCenter();
      if (map.getZoom() === z && Math.abs(c.lat - lat) < 1e-6 && Math.abs(c.lng - lon) < 1e-6) {
        return;
      }
    }
    map.setView([lat, lon], z);
    saveMapView();
    // エリアへ飛んだ直後の0件だけ、1回だけ自動でズームアウトしてよい券を立てる
    // (ドラッグ由来の onMapMoved 経由では立てない)。
    autoZoomArmed = true;
    // setView 直後の moveend は debounce 待ちなので、ここでは待たずに取得を始める
    loadHotelsInView();
  }

  // ---------------------------------------------------------------------------
  // 状態A: 検索候補
  // ---------------------------------------------------------------------------

  function hideSuggest() {
    els.suggest.hidden = true;
    els.suggest.innerHTML = '';
    suggestItems = [];
  }

  // 検索欄に入力があるときだけ×ボタンを見せる(空白1文字でも「入力あり」扱い)。
  function syncSearchClear() {
    els.searchClear.hidden = !(els.searchInput.value.length > 0);
  }

  /**
   * 候補と「最近」をまとめて描く。行の種類は data-act で区別する。
   * `act === 'head'` の行はセクション見出しで、ボタンではなく押せない要素として描く
   * (data-index を振らないので、クリック委譲の `closest('.suggest__item')` に当たらず、
   * rows 配列の添字ロジックも壊れない)。
   */
  function renderSuggest(rows) {
    if (!rows.length) {
      hideSuggest();
      return;
    }
    suggestItems = rows;
    var html = rows.map(function (row, i) {
      if (row.act === 'head') {
        return '<div class="suggest__head" role="presentation">' + escapeHtml(row.name) + '</div>';
      }
      var sub = row.sub ? '<span class="suggest__sub">' + escapeHtml(row.sub) + '</span>' : '';
      return '<button type="button" class="suggest__item" role="option" data-index="' + i + '">' +
        '<span class="suggest__icon" aria-hidden="true">' + escapeHtml(row.icon) + '</span>' +
        '<span class="suggest__text">' +
          '<span class="suggest__name">' + escapeHtml(row.name) + '</span>' + sub +
        '</span>' +
      '</button>';
    }).join('');
    els.suggest.innerHTML = html;
    els.suggest.hidden = false;
  }

  /** 最近見た宿を最大 limit 件、候補行の形に変換する純粋関数。 */
  function recentRows(limit) {
    return getRecent().slice(0, limit).map(function (r) {
      return {
        act: 'hotel',
        icon: '🕘',
        name: r.name,
        hotel: { name: r.name, lat: r.lat, lon: r.lon, kind: r.kind }
      };
    });
  }

  function showRecent() {
    var rows = recentRows(RECENT_MAX);
    if (!rows.length) {
      hideSuggest();
      return;
    }
    renderSuggest(rows);
  }

  /**
   * 検索候補(2文字以上)の rows に、名前が一致する「最近見た宿」を先頭に差し込む。
   * 候補側に同名の宿が既にあれば最近側は落とす(重複表示の防止)。
   * 一致が1件も無ければ見出しを出さず rows をそのまま返す(見出しだけ浮くのを避ける)。
   */
  function mergeWithRecent(rows, q) {
    var candidateNames = {};
    rows.forEach(function (row) {
      if (row.act === 'hotel' && row.name) candidateNames[row.name] = true;
    });

    var matches = recentRows(RECENT_MAX).filter(function (r) {
      return r.name && r.name.indexOf(q) >= 0 && !candidateNames[r.name];
    }).slice(0, 3);

    if (!matches.length) return rows;

    return [{ act: 'head', name: '最近見た宿' }]
      .concat(matches)
      .concat([{ act: 'head', name: '検索結果' }])
      .concat(rows);
  }

  var runSuggest = debounce(function (query) {
    var q = (query || '').trim();
    if (q.length < 2) {
      // 消しきったらフォーカス中は「最近」に戻す
      if (document.activeElement === els.searchInput) showRecent();
      else hideSuggest();
      return;
    }
    lastSuggestQuery = q;

    YadoGeo.suggestHotels(q)
      .then(function (results) {
        // 打ち続けて別の語になっていたら、古い応答は捨てる
        if (q !== lastSuggestQuery || state.view !== 'select') return;

        var rows = [];
        var places = [];
        results.forEach(function (r) {
          if (r.kind === 'place') places.push(r);
          else rows.push({
            act: 'hotel',
            icon: hotelEmoji(r),
            name: r.name,
            sub: r.displayName,
            hotel: r
          });
        });

        // 地名・バス停は宿ではないので候補には混ぜず、地図ジャンプ用に末尾へ1件だけ添える
        if (places.length) {
          rows.push({
            act: 'jump',
            icon: '📍',
            name: 'このあたりを見る（' + places[0].name + '）',
            sub: places[0].displayName,
            hotel: places[0]
          });
        }

        if (!rows.length) {
          rows = [{ act: 'none', icon: '🔍', name: '見つかりませんでした', sub: '別の名前で探してみてください' }];
        }
        renderSuggest(mergeWithRecent(rows, q));
      })
      .catch(function () {
        if (q !== lastSuggestQuery) return;
        var fallback = [{ act: 'none', icon: '⚠️', name: '検索できませんでした', sub: '少し待ってからお試しください' }];
        renderSuggest(mergeWithRecent(fallback, q));
      });
  }, DEBOUNCE_SEARCH_MS);

  // ---------------------------------------------------------------------------
  // 宿を選ぶ → 状態B
  // ---------------------------------------------------------------------------

  /**
   * 撮影用の差し替え(表示層だけ)。フラグが立っていなければ何もしない。
   * `simulate=empty` は提案を空にして emptyHtml を、`demo=far` は
   * 固定データでは必ず0件になる far にダミーを入れて farHtml を目視できるようにする。
   */
  function applyDemoOverrides(hotel) {
    if (demoEmpty) {
      state.cards = [];
      state.more = [];
      state.far = [];
      return;
    }
    if (demoFar && !state.far.length && state.stage === 'done') {
      state.far = demoFarCards(hotel);
    }
  }

  /** `demo=far` 用のダミー。長い名前と3桁の分数を混ぜて折り返し限界を見る。 */
  function demoFarCards(hotel) {
    var base = hotel || { lat: DEFAULT_VIEW.lat, lon: DEFAULT_VIEW.lon };
    var names = [
      '軽井沢プリンスショッピングプラザ',
      '国営アルプスあづみの公園（堀金・穂高地区）',
      '志賀高原横手山ドライブイン展望台',
      '善光寺',
      '上田城跡公園'
    ];
    return names.map(function (name, i) {
      var lat = base.lat + 0.3 + i * 0.05;
      var lon = base.lon + 0.3 + i * 0.05;
      return {
        name: name,
        lat: lat,
        lon: lon,
        categoryLabel: '観光名所',
        walkMin: 999,
        driveMin: 62 + i * 23,
        links: { gmap: 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon }
      };
    });
  }

  function selectHotel(hotel) {
    if (!hotel || !isFinite(hotel.lat) || !isFinite(hotel.lon)) return;

    // ドラッグ直後にピンをタップすると moveend の debounce が間に合わないので、
    // 宿を選ぶ瞬間の位置を確実に残す。
    saveMapView();

    hideSuggest();
    if (els.searchInput) els.searchInput.blur();

    state.view = 'feed';
    state.hotel = hotel;
    state.cards = [];
    state.more = [];
    state.moreOpen = false;
    state.far = [];
    state.stage = 'loading';
    state.osmFailed = false;
    passiveViewedKey = null;
    maxSeenIndex = -1;
    pushRecent(hotel);
    render();
    // 状態Bへ入ったことを履歴に積む(埋め込み時と二重push時は何もしない)
    if (!state.embed && !historyPushed) {
      global.history.pushState({ yado: 'feed' }, '', global.location.href);
      historyPushed = true;
    }
    // 状態Bに入った瞬間を計測の起点にする
    perfReset();

    var seq = ++requestSeq;

    YadoEngine.suggest(hotel, {}, function (stage, partial, meta) {
      if (seq !== requestSeq || state.view !== 'feed') return;
      perfMark('stage:' + stage);
      state.stage = stage;
      state.cards = (partial && partial.cards) || [];
      state.more = (partial && partial.more) || [];
      state.far = (partial && partial.far) || [];
      applyDemoOverrides(hotel);
      if (meta && meta.osmFailed) state.osmFailed = true;
      render();
    }).then(function (result) {
      if (seq !== requestSeq || state.view !== 'feed') return;
      state.stage = 'done';
      state.cards = (result && result.cards) || [];
      state.more = (result && result.more) || [];
      state.far = (result && result.far) || [];
      applyDemoOverrides(hotel);
      if (result && result.osmFailed) state.osmFailed = true;
      render();
    }).catch(function () {
      if (seq !== requestSeq || state.view !== 'feed') return;
      state.stage = 'error';
      render();
    });
  }

  function goBack() {
    // 進行中の提案があっても、戻った先の画面には描かせない
    requestSeq++;
    state.view = 'select';
    state.hotel = null;
    state.cards = [];
    state.more = [];
    state.moreOpen = false;
    state.far = [];
    state.stage = null;
    state.osmFailed = false;
    render();
    historyPushed = false;
  }

  /** UI(戻るボタン)からの戻る操作。history の辻褄を合わせるための入口を分ける。 */
  function goBackFromUi() {
    if (historyPushed) {
      // 実際の画面遷移は popstate ハンドラに任せる
      global.history.back();
    } else {
      goBack();
    }
  }

  // ---------------------------------------------------------------------------
  // 状態B: 描画
  // ---------------------------------------------------------------------------

  function skeletonHtml() {
    var one =
      '<article class="card feedcard feedcard--skeleton" aria-hidden="true">' +
        '<div class="feedcard__media skel"></div>' +
        '<div class="feedcard__body">' +
          '<div class="skel skel--line skel--w70"></div>' +
          '<div class="skel skel--line skel--w40"></div>' +
          '<div class="skel skel--line"></div>' +
        '</div>' +
      '</article>';
    var out = '';
    for (var i = 0; i < SKELETON_COUNT; i++) out += one;
    return out;
  }

  function linkRowHtml(card) {
    var links = card.links || {};
    var rows = [];
    var gmap = safeUrl(links.gmap);
    if (gmap) rows.push({ url: gmap, label: '行き方' });
    var official = safeUrl(links.official);
    // official は無いことが多いので、そのときは行ごと省く
    if (official) rows.push({ url: official, label: '公式' });
    var ig = safeUrl(links.instagram);
    if (ig) rows.push({ url: ig, label: 'Instagram' });
    var tt = safeUrl(links.tiktok);
    if (tt) rows.push({ url: tt, label: 'TikTok' });
    var yt = safeUrl(links.youtube);
    if (yt) rows.push({ url: yt, label: 'YouTube' });

    if (!rows.length) return '';
    return '<div class="feedcard__links">' + rows.map(function (r) {
      return '<a class="feedcard__link" href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener">' +
        escapeHtml(r.label) + '</a>';
    }).join('') + '</div>';
  }

  // R62: ?demo=portrait 用の縦長ダミー画像(400x800、外部リクエスト0回)。
  // 上部60pxの位置に横線と「ここが頭」の目印を描き、object-fit:cover で
  // 上部が切れているかどうかを撮影画像だけで判別できるようにする。
  var PORTRAIT_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800">' +
      '<rect width="400" height="800" fill="#7aa6c2"/>' +
      '<rect y="0" width="400" height="60" fill="#2f5d7c"/>' +
      '<line x1="0" y1="60" x2="400" y2="60" stroke="#ff3b30" stroke-width="6"/>' +
      '<text x="200" y="40" font-size="28" fill="#ffffff" text-anchor="middle">▲ ここが頭</text>' +
      '<text x="200" y="400" font-size="24" fill="#ffffff" text-anchor="middle">縦長ダミー</text>' +
      '<text x="200" y="760" font-size="20" fill="#ffffff" text-anchor="middle">ここが足元</text>' +
    '</svg>'
  );

  function placeholderHtml(card, emoji) {
    return '<div class="feedcard__ph" data-cat="' + escapeHtml(card.categoryLabel || '') + '">' +
      '<span aria-hidden="true">' + escapeHtml(emoji) + '</span></div>';
  }

  // R54: 距離(m)を表示用テキストに整形する。
  // 1000m未満は整数m(例 850m)、1000m以上は小数第1位でkm(例 1.2km)、
  // ちょうど整数kmになる場合は小数点を出さない(例 2km)。
  function distanceText(m) {
    if (!isFinite(m) || m < 0) return '';
    if (m < 1000) return Math.round(m) + 'm';
    if (m >= 10000) return Math.round(m / 1000) + 'km';
    var km = Math.round(m / 100) / 10;
    if (Math.round(km) === km) return Math.round(km) + 'km';
    return km.toFixed(1) + 'km';
  }

  // R83: Wikipedia記事が紐づかないカードに出す代替文(事実のみ・推測や謝罪を書かない)
  var NO_SUMMARY_TEXT = 'Wikipediaに記事がありません。地図の情報だけで表示しています。';
  // R123: 記事の存在(wikipedia/wikidataタグ)は確認できるが本文を取得できていないカード用
  var HAS_ARTICLE_NO_SUMMARY_TEXT = 'Wikipediaに記事はありますが、要約をここに出せていません。';

  /**
   * R84: rank のスコア内訳を1行にする(`?fixture=…&debug=1` のときだけ呼ばれる)。
   * 09_研究ノートの「なぜこの順位か」を dump-rank.mjs を回さずに画面で追うためのもの。
   * 0 の項目は出さない(行が伸びるだけで読みにくくなる)。
   */
  function debugHtml(d) {
    var head = '#' + d.rank + ' · ' + (d.source || 'osm') + ' · ' + (d.category || 'other') +
      ' · ' + Math.round(d.distanceM || 0) + 'm · 合計 ' + (d.total || 0).toFixed(1);
    var parts = [];
    if (d.image) parts.push('写真+' + d.image);
    if (d.summary) parts.push('要約+' + d.summary);
    if (d.official) parts.push('公式+' + d.official);
    if (d.both) parts.push('両ソース+' + d.both);
    if (d.distance) parts.push('距離' + d.distance.toFixed(1));
    if (d.season) parts.push('季節+' + d.season);
    if (d.categoryPenalty) parts.push('カテゴリ' + d.categoryPenalty);
    return '<p class="dbg">' + escapeHtml(head) +
      ' <span class="dbg__b">' + escapeHtml(parts.join(' ')) + '</span></p>';
  }

  function cardHtml(card, index) {
    var emoji = emojiFor(card.categoryLabel);
    var isPortraitDemo = demoPortrait && index < 3;
    var imgSrc = demoImgFail && index < 3 ? './__imgfail_test__.png' : card.imageUrl;
    // R62: data: URI は safeUrl() の対象外(https? のみ許可)なので、
    // safeUrl の許可スキームは広げずに portrait 専用の分岐で直接 img を組む。
    var media = isPortraitDemo
      ? '<button type="button" class="feedcard__imgbtn"><img class="feedcard__img" src="' + PORTRAIT_DATA_URI + '" alt="' + escapeHtml(card.name || 'スポット') + 'の写真(縦長ダミー)" loading="lazy" ' +
          'data-cat="' + escapeHtml(card.categoryLabel || '') + '" data-emoji="' + escapeHtml(emoji) + '"></button>'
      : (imgSrc && safeUrl(imgSrc)
        ? '<button type="button" class="feedcard__imgbtn"><img class="feedcard__img" src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(card.name || 'スポット') + 'の写真" loading="lazy" ' +
            'data-cat="' + escapeHtml(card.categoryLabel || '') + '" data-emoji="' + escapeHtml(emoji) + '"></button>'
        : placeholderHtml(card, emoji));

    // R123: 要約が無い場合、記事の存在(wikipedia/wikidataタグ)の有無で文言を分ける
    // (記事はあるのに「記事がありません」と嘘をつかない。card.wikipediaTitle 自体は画面に出さない)
    var hasArticle = !card.summary && (card.wikipediaTitle || card.wikidataId);
    var wikipediaUrl = card.wikipediaTitle
      ? safeUrl('https://ja.wikipedia.org/wiki/' + encodeURIComponent(card.wikipediaTitle.replace(/ /g, '_')))
      : null;
    var summary = card.summary
      ? '<p class="feedcard__summary">' + escapeHtml(card.summary) + '</p>'
      : hasArticle
      ? '<p class="feedcard__summary feedcard__summary--none">' + escapeHtml(HAS_ARTICLE_NO_SUMMARY_TEXT) +
          (wikipediaUrl
            ? ' <a href="' + escapeHtml(wikipediaUrl) + '" target="_blank" rel="noopener">Wikipediaで見る</a>'
            : '') +
        '</p>'
      : '<p class="feedcard__summary feedcard__summary--none">' + escapeHtml(NO_SUMMARY_TEXT) + '</p>';

    return '<article class="card feedcard" data-index="' + index + '">' +
      '<div class="feedcard__media">' + media +
        '<button type="button" class="feedcard__no" data-no="' + (index + 1) + '" aria-label="' + (index + 1) + '番のピンを地図で光らせる">' + (index + 1) + '</button>' +
      '</div>' +
      '<div class="feedcard__body">' +
        '<h2 class="feedcard__name">' + escapeHtml(card.name) + '</h2>' +
        '<p class="feedcard__meta">' +
          '<span class="feedcard__cat">' + escapeHtml(emoji) + ' ' + escapeHtml(card.categoryLabel || '') + '</span>' +
          '<span class="feedcard__times">🚶徒歩' + escapeHtml(String(card.walkMin)) + '分 · 🚗車' +
            escapeHtml(String(card.driveMin)) + '分' +
            (distanceText(card.distanceM) ? ' · ' + escapeHtml(distanceText(card.distanceM)) : '') +
            '</span>' +
        '</p>' +
        summary +
        linkRowHtml(card) +
        (debugRank && card._debug ? debugHtml(card._debug) : '') +
      '</div>' +
    '</article>';
  }

  // R66: カード写真タップの簡易ライトボックス。history は一切触らない(R58と衝突するため)。
  // overlay はJSで都度生成し、閉じたら DOM から除去する。
  var lightboxEl = null;
  var lightboxKeyHandler = null;
  var lightboxReturnFocusEl = null;

  // R69: 開いたときはR13のフォーカスリングが当たる閉じるボタンへ、
  // 閉じたときは元の写真ボタンへフォーカスを戻す(キーボード利用者が迷子にならないため)。
  function openLightbox(img, returnFocusEl) {
    closeLightbox();
    var overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML =
      '<button type="button" class="lightbox__close" aria-label="閉じる">&times;</button>' +
      '<img class="lightbox__img" src="' + escapeHtml(img.getAttribute('src') || '') + '" alt="' +
        escapeHtml(img.getAttribute('alt') || '') + '">';
    overlay.addEventListener('click', function () {
      closeLightbox();
    });
    document.body.appendChild(overlay);
    document.body.classList.add('is-lightbox');
    // 描画後にopacityを上げてフェードインさせる(reduced-motionはCSS側で無効化済み)
    requestAnimationFrame(function () {
      overlay.classList.add('is-open');
    });
    lightboxEl = overlay;
    lightboxReturnFocusEl = returnFocusEl || null;

    var closeBtn = overlay.querySelector('.lightbox__close');
    if (closeBtn) closeBtn.focus();

    // R96: 開いている間はフォーカスをoverlay内に閉じ込める(フォーカストラップ)。
    // 暗幕で隠れた背後のカードへTabで抜けると、キーボード利用者が迷子になるため。
    lightboxKeyHandler = function (e) {
      if (e.key === 'Escape') { closeLightbox(); return; }
      if (e.key === 'Tab') {
        // overlay内のフォーカス可能要素は現状 .lightbox__close の1つだけなので、
        // Tab / Shift+Tab とも既定動作を止めてそこへ留める。
        // 将来フォーカス可能要素が増えたら、ここを先頭/末尾の循環に書き換えること。
        e.preventDefault();
        var btn = lightboxEl && lightboxEl.querySelector('.lightbox__close');
        if (btn) btn.focus();
      }
    };
    document.addEventListener('keydown', lightboxKeyHandler);
  }

  function closeLightbox() {
    if (!lightboxEl) return;
    lightboxEl.remove();
    lightboxEl = null;
    document.body.classList.remove('is-lightbox');
    if (lightboxKeyHandler) {
      document.removeEventListener('keydown', lightboxKeyHandler);
      lightboxKeyHandler = null;
    }
    if (lightboxReturnFocusEl) {
      lightboxReturnFocusEl.focus();
      lightboxReturnFocusEl = null;
    }
  }

  function emptyHtml(hotel) {
    var url = 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(hotel.lat + ',' + hotel.lon);
    return '<div class="card empty">' +
      '<p class="empty__title">この周辺ではまだ提案を作れませんでした</p>' +
      '<p class="empty__note">この辺りはデータが少なめです。地図で直接探せます。</p>' +
      '<a class="btn btn--secondary" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
        'Googleマップで周辺を見る</a>' +
    '</div>';
  }

  /**
   * フィード末尾の「もっと見る」行。展開済みならボタンは出さない
   * (カード本体は renderFeed 側で state.more を連結して描く)。
   */
  function moreHtml(more, open, startNo) {
    if (!more.length) return '';
    if (open) {
      return '<p class="morenote">' + escapeHtml(String(startNo)) + '番以降は地図に表示していません。</p>';
    }
    return '<button type="button" class="morebtn" id="more-btn">もっと見る（残り' + more.length + '件）</button>';
  }

  function farHtml(far) {
    if (!far.length) return '';
    var items = far.map(function (c) {
      var gmap = safeUrl(c.links && c.links.gmap);
      var name = escapeHtml(c.name) + ' <span class="far__time">🚗' + escapeHtml(String(c.driveMin)) + '分</span>';
      return '<li class="far__item">' +
        (gmap ? '<a href="' + escapeHtml(gmap) + '" target="_blank" rel="noopener">' + name + '</a>' : name) +
      '</li>';
    }).join('');
    return '<details class="far">' +
      '<summary class="far__summary">もっと遠く（車1時間以上）' + far.length + '件</summary>' +
      '<ul class="far__list">' + items + '</ul>' +
    '</details>';
  }

  /**
   * フィード末尾の注記。順位の作り方を隠さず正直に1行で明かす。
   * スポットが0件のときは付けない(「提案を作れませんでした」の下に不要)。
   */
  function noteHtml(cardCount) {
    if (!cardCount) return '';
    return '<p class="feednote">この提案は、周辺の地図情報（OpenStreetMap）とWikipediaから、' +
      '宿からの距離と種類の多様性で並べた暫定版です。有名な場所が下に来ることがあります。' +
      ' <a href="https://github.com/TeeR-tee/yadotabi#仕組みかんたん解説" target="_blank" rel="noopener">くわしい仕組み</a></p>';
  }

  /**
   * フィード上部の1行。読み込み中は進捗、読み込み後は Overpass が混雑していた
   * ことだけを正直に伝える(隠すと「なぜ少ないのか」が分からなくなるため)。
   */
  /**
   * fixture の meta.generatedAt(ISO文字列)を、ローカル時刻の YYYY-MM-DD にする。
   * 空・不正な日付なら '' を返す(バッジには「固定データ」だけが出る)。
   * toISOString() はUTCに寄ってしまうため使わず、ローカルの年月日を組み立てる。
   */
  function formatFixtureDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function statusText(stage, osmFailed) {
    if (stage === 'loading' || stage === 'osm') return '周辺を集めています…';
    if (stage === 'wiki') return 'Wikipediaで補強しています…';
    if (stage === 'done' && osmFailed) {
      return '周辺の宿情報だけ混雑中。Wikipediaの情報で提案しています。';
    }
    return '';
  }

  function renderFeed() {
    var hotel = state.hotel;
    if (!hotel) return;

    els.feedTitle.textContent = hotel.name || '';
    els.feedBadge.hidden = !isFixtureMode;
    if (els.feedBadgeDate) {
      var hasDate = isFixtureMode && !!fixtureGeneratedAt;
      els.feedBadgeDate.hidden = !hasDate;
      els.feedBadgeDate.textContent = hasDate ? fixtureGeneratedAt + ' 取得' : '';
      if (hasDate) els.feedBadgeDate.title = fixtureGeneratedAt + ' 取得';
    }

    var status = statusText(state.stage, state.osmFailed);
    els.feedStatus.hidden = !status;
    els.feedStatus.textContent = status;
    // 混雑の告知は進捗表示より目立たせたいので、見た目を分ける
    els.feedStatus.classList.toggle('feedstatus--warn', state.stage === 'done' && !!state.osmFailed);

    var loading = state.stage === 'loading' || state.stage === 'osm' || state.stage === 'wiki';

    if (state.stage === 'error') {
      els.feedList.innerHTML = '<div class="card empty">' +
        '<p class="empty__title">提案を作れませんでした</p>' +
        '<p class="empty__note">通信が不安定かもしれません。戻ってもう一度お試しください。</p>' +
      '</div>';
      els.feedFar.hidden = true;
      if (els.feedNote) els.feedNote.hidden = true;
      return;
    }

    var html = state.cards.map(cardHtml).join('');
    if (state.moreOpen) {
      html += state.more.map(function (c, i) { return cardHtml(c, i + state.cards.length); }).join('');
    }
    // スケルトンは「まだ増える」ことを示すので、読み込み中は実カードの後ろに残す
    if (loading) html += skeletonHtml();
    if (!loading && !state.cards.length) html = emptyHtml(hotel);

    els.feedList.innerHTML = html;
    // 実カードが入った最初の描画だけ計測する(?perf=1 のとき以外は何もしない)
    perfMarkFirstCard();

    // 「もっと見る」は読み込み中は出さない(スケルトンと並ぶと意味が分からないため)
    var more = loading ? '' : moreHtml(state.more, state.moreOpen, state.cards.length + 1);
    if (els.feedMore) {
      els.feedMore.hidden = !more;
      els.feedMore.innerHTML = more;
    }

    var far = farHtml(state.far);
    els.feedFar.hidden = !far;
    els.feedFar.innerHTML = far;
    // 撮影用: 閉じている <details> を開いて中身を目視できるようにする
    if (demoFar) {
      var details = els.feedFar.querySelector('.far');
      if (details) details.setAttribute('open', '');
    }

    var note = loading ? '' : noteHtml(state.cards.length);
    if (els.feedNote) { els.feedNote.hidden = !note; els.feedNote.innerHTML = note; }

    // 表示した宿と上位カードの記録。段階描画で renderFeed が複数回走るので done の1回だけに絞る
    if (state.stage === 'done') {
      var viewedKey = hotel.id + '@' + state.cards.length;
      if (passiveViewedKey !== viewedKey) {
        passiveViewedKey = viewedKey;
        passivePush('view', {
          hotel: { id: hotel.id, name: hotel.name, lat: hotel.lat, lon: hotel.lon },
          topIds: state.cards.slice(0, 10).map(function (c) { return c.id; }),
          n: state.cards.length
        });
      }
    }

    observeCards();
    updatePassiveBox();

    renderFeedMap();
    postHeightToParent();
  }

  /**
   * スクロール到達位置の記録。renderFeed が DOM を作り直すたびに observer も作り直す。
   * 最大値が更新されたら1秒 debounce して1件だけ passivePush する(連打防止)。
   */
  var pushSeenDebounced = debounce(function (hotelId) {
    passivePush('seen', { hotelId: hotelId, maxIndex: maxSeenIndex });
  }, 1000);

  function observeCards() {
    if (typeof IntersectionObserver === 'undefined') return;
    if (cardObserver) cardObserver.disconnect();
    var hotel = state.hotel;
    if (!hotel) return;
    cardObserver = new IntersectionObserver(function (entries) {
      var updated = false;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var idx = Number(entry.target.dataset.index);
        if (isFinite(idx) && idx > maxSeenIndex) {
          maxSeenIndex = idx;
          updated = true;
        }
      });
      if (updated) pushSeenDebounced(hotel.id);
    });
    var cards = els.feedList.querySelectorAll('.feedcard[data-index]');
    cards.forEach(function (el) { cardObserver.observe(el); });
  }

  function ensureFeedMap() {
    if (feedMap) return feedMap;
    feedMap = L.map(els.feedMap, {
      zoomControl: false,
      // 小さい地図なので、指が取られないようスクロールズームは切る
      scrollWheelZoom: false
    }).setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lon], DEFAULT_VIEW.zoom);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(feedMap);
    // 右下は番号ピンが密集しやすいため、帰属表示は右上へ逃がして重なりを避ける
    feedMap.attributionControl.setPosition('topright');
    return feedMap;
  }

  // ピン同士に確保する最小距離(px)。ピンの見た目の直径から決めている
  var TOP_DIST = 34;    // 1〜5番(24px + scale1.12 + 白フチ)
  var SUB_DIST = 26;    // 6番以降(scale0.72 に縮めるので少し詰めてよい)
  var HOTEL_DIST = 36;  // 宿ピン(30px)。番号ピンに潜られないよう広めに取る

  // ピンの実寸(px)。中心から上下左右にこの半分だけ矩形が広がる
  var PIN_BOX = 24;        // 番号ピン(6番以降)
  var PIN_BOX_TOP = 27;    // 1〜5番(scale1.12)
  var BOX_PAD = 4;         // 障害物の矩形との間に必ず空ける見た目の余白

  // 中心 p と一辺 size から、地図コンテナ座標の矩形を作る
  function pinRectOf(p, size) {
    var h = size / 2;
    return { left: p.x - h, top: p.y - h, right: p.x + h, bottom: p.y + h };
  }
  // 矩形どうしが pad だけ膨らませても重ならないか(true = 重なる)
  function rectsOverlap(a, b, pad) {
    var m = pad || 0;
    return a.left - m < b.right && a.right + m > b.left &&
      a.top - m < b.bottom && a.bottom + m > b.top;
  }

  /**
   * 画面上で近すぎる上位ピンを、表示位置だけ円状にずらして分離する。
   * `fixedPoints` は動かさない基準点(宿ピン)の containerPoint 配列。
   * `obstacles` は絶対に乗ってはいけない矩形の配列(OSM帰属表示。地図コンテナ座標)。
   *   帰属表示は OSM タイル利用規約上の必須表示で消せないため、点近似(R117)ではなく
   *   矩形そのもので判定する。点近似は箱の幅・高さを1点で代用するため、
   *   提案順位が変わって箱の端にピンが来ると穴が開き、逆に箱の上下では過剰に退避していた。
   * `markerPoints` は { marker, point, minDist } の配列で、呼び出し側で先頭から重要度順に並べる。
   * 緯度経度(state.cards / fitBounds 用の points)は書き換えず、marker の見た目位置だけ setLatLng する。
   * ピン同士は空きが見つからない密集地でも「最も空いている候補」へ逃がす(同一座標に積まない)が、
   * `obstacles` との重なりだけはベストエフォートの対象外(絶対制約)にする。
   */
  function nudgeOverlaps(markerPoints, fixedPoints, obstacles) {
    var NUDGE = 16;
    var RINGS = 6;          // 最大 96px まで退避できる
    var DIRS = 8;
    var MARGIN = 20;        // 地図コンテナの縁からこれだけ内側に収める(ピン半径+余白)
    var size = feedMap.getSize();
    var boxes = obstacles || [];
    var placed = fixedPoints.map(function (p) { return { p: p, d: HOTEL_DIST }; });

    // コンテナからはみ出さないよう座標を丸める
    var clamp = function (p) {
      var x = Math.min(Math.max(p.x, MARGIN), Math.max(MARGIN, size.x - MARGIN));
      var y = Math.min(Math.max(p.y, MARGIN), Math.max(MARGIN, size.y - MARGIN));
      return (x === p.x && y === p.y) ? p : L.point(x, y);
    };
    // 帰属表示の矩形に1pxでも乗っていたら false。順位に依存しない絶対条件
    var clearsBoxes = function (p, myBox) {
      var r = pinRectOf(p, myBox);
      for (var i = 0; i < boxes.length; i++) {
        if (rectsOverlap(r, boxes[i], BOX_PAD)) return false;
      }
      return true;
    };
    // 既に置いたピンとの「余裕」。正なら十分離れている
    var clearance = function (p, myDist) {
      var min = Infinity;
      placed.forEach(function (q) {
        var need = Math.max(myDist, q.d);
        var slack = p.distanceTo(q.p) - need;
        if (slack < min) min = slack;
      });
      return min;
    };
    // リング探索を使い切っても空きが無いときの、必ず解がある決定的な逃がし先。
    // 箱の下端 + ピン半径 + PAD へ真下に落とす(縦に積んでも箱には乗らない)
    var escapeBelowBoxes = function (p, myBox) {
      var q = p;
      for (var i = 0; i < boxes.length; i++) {
        var r = pinRectOf(q, myBox);
        if (rectsOverlap(r, boxes[i], BOX_PAD)) {
          q = L.point(q.x, boxes[i].bottom + BOX_PAD + myBox / 2);
        }
      }
      return q;
    };

    markerPoints.forEach(function (mp) {
      var myDist = mp.minDist;
      var myBox = mp.box;
      var origin = clamp(mp.point);
      var originOk = clearsBoxes(origin, myBox);
      var best = originOk ? origin : null;
      var bestClear = originOk ? clearance(origin, myDist) : -Infinity;
      if (!originOk || bestClear < 0) {
        // 8方向 x 6リング。リングごとに角度をずらして格子状の詰まりを解く
        outer:
        for (var ring = 1; ring <= RINGS; ring++) {
          for (var dir = 0; dir < DIRS; dir++) {
            var angle = dir * (Math.PI * 2 / DIRS) + (Math.PI / DIRS) * ring;
            var candidate = clamp(mp.point.add(
              L.point(Math.cos(angle) * NUDGE * ring, Math.sin(angle) * NUDGE * ring)
            ));
            // 帰属表示に乗る候補は、ベストエフォートの比較対象にも入れない
            if (!clearsBoxes(candidate, myBox)) continue;
            var clear = clearance(candidate, myDist);
            if (clear >= 0) {
              best = candidate;
              bestClear = clear;
              break outer;
            }
            // 空きが無かった場合に備えて、いちばんマシな候補を覚えておく
            if (clear > bestClear) {
              best = candidate;
              bestClear = clear;
            }
          }
        }
      }
      // どの候補も帰属表示を避けられなかったときの最終退避(箱の真下)
      if (best === null) best = clamp(escapeBelowBoxes(origin, myBox));
      // clamp で縁に張り付いた結果として箱に乗ることがあるので、最後にもう一度通す
      if (!clearsBoxes(best, myBox)) best = escapeBelowBoxes(best, myBox);
      if (best !== mp.point) {
        mp.marker.setLatLng(feedMap.containerPointToLatLng(best));
      }
      placed.push({ p: best, d: myDist });
    });
  }

  function renderFeedMap() {
    var hotel = state.hotel;
    if (!hotel) return;
    ensureFeedMap();
    els.feedMap.classList.toggle('feedmap--tall', state.cards.length >= 25);

    feedMarkers.forEach(function (m) { feedMap.removeLayer(m); });
    feedMarkers = [];
    feedSpotMarkers = [];

    var hotelIcon = L.divIcon({
      className: 'pin pin--hotel',
      html: '<span role="img" aria-label="' + escapeHtml('宿 ' + hotel.name) + '">' + hotelEmoji(hotel) + '</span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    var hm = L.marker([hotel.lat, hotel.lon], { icon: hotelIcon, zIndexOffset: 2000 }).addTo(feedMap);
    hm.on('click', function () { feedMap.panTo([hotel.lat, hotel.lon]); });
    feedMarkers.push(hm);

    var points = [[hotel.lat, hotel.lon]];
    var spotMarkers = [];
    state.cards.forEach(function (c, i) {
      var icon = L.divIcon({
        className: 'pin pin--spot' + (i < 5 ? ' pin--top' : ''),
        html: '<span role="img" aria-label="' + escapeHtml((i + 1) + '番 ' + c.name) + '">' + (i + 1) + '</span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      var m = L.marker([c.lat, c.lon], { icon: icon, title: c.name, zIndexOffset: 1000 - i }).addTo(feedMap);
      feedMarkers.push(m);
      spotMarkers.push(m);
      feedSpotMarkers.push(m);
      points.push([c.lat, c.lon]);
    });

    // 非表示から表示に切り替えた直後はコンテナ寸法が0なので、測り直してから枠合わせする
    setTimeout(function () {
      if (!feedMap) return;
      feedMap.invalidateSize();
      // animate: false にしないと、ずらした直後にアニメ完了で元の投影に戻されて重なりが復活する
      if (points.length > 1) {
        feedMap.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 14, animate: false });
      } else {
        feedMap.setView([hotel.lat, hotel.lon], 14, { animate: false });
      }
      // ズーム・中心が確定してからでないと containerPoint が正しく取れない
      var fixedPoints = [feedMap.latLngToContainerPoint(L.latLng(hotel.lat, hotel.lon))];
      // OSM帰属表示(右上)は消せない必須表示なので、ピン側を避けさせる。
      // 位置は setPosition('topright') 済みだが、どのピンがそこに来るかは
      // 提案結果しだいで変わる(R114/R117 で並びが1つ繰り上がった際に実際に重なった)。
      // R118: 点の集まりで近似するのをやめ、getBoundingClientRect() で実測した
      // **矩形そのもの**を絶対に乗ってはいけない障害物として渡す。
      // 1行/2行(高さ14/28px)のどちらでも自動追従し、順位が変わっても穴が開かない。
      var obstacles = [];
      var attribEl = feedMap.getContainer().querySelector('.leaflet-control-attribution');
      if (attribEl) {
        var mapRect = feedMap.getContainer().getBoundingClientRect();
        var aRect = attribEl.getBoundingClientRect();
        if (aRect.width > 0 && aRect.height > 0) {
          obstacles.push({
            left: aRect.left - mapRect.left,
            top: aRect.top - mapRect.top,
            right: aRect.right - mapRect.left,
            bottom: aRect.bottom - mapRect.top
          });
        }
      }
      // marker は setLatLng で動かすので、元の緯度経度(state.cards)を基準に計算する
      var markerPoints = spotMarkers.map(function (m, i) {
        var c = state.cards[i];
        return {
          marker: m,
          point: feedMap.latLngToContainerPoint(L.latLng(c.lat, c.lon)),
          minDist: i < 5 ? TOP_DIST : SUB_DIST,
          box: i < 5 ? PIN_BOX_TOP : PIN_BOX
        };
      });
      nudgeOverlaps(markerPoints, fixedPoints, obstacles);
    }, 0);
  }

  // 番号バッジタップ時、小地図の該当ピンを1秒だけ光らせる(CSSアニメのみ)
  function flashPin(i) {
    var m = feedSpotMarkers[i];
    if (!m || !m.getElement) return;
    var el = m.getElement();
    if (!el) return;
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }
    var prev = feedMap ? feedMap.getContainer().querySelector('.pin--flash') : null;
    if (prev) prev.classList.remove('pin--flash');
    el.classList.add('pin--flash');
    flashTimer = setTimeout(function () {
      el.classList.remove('pin--flash');
      flashTimer = null;
    }, 1200);
  }

  // ---------------------------------------------------------------------------
  // render: 状態 → 画面
  // ---------------------------------------------------------------------------

  function render() {
    var isFeed = state.view === 'feed';
    // 埋め込みでは状態A(検索・チップ・地図)を絶対に出さない
    els.viewSelect.hidden = isFeed || state.embed;
    els.viewFeed.hidden = !isFeed;
    // 戻る先が無いので隠すだけ。DOM も goBack も残す(非埋め込みでは必要)
    els.backBtn.hidden = state.embed;

    if (isFeed) {
      renderFeed();
    } else {
      // 地図は使い回しなので、表示が戻ったタイミングで寸法を測り直す
      if (map) setTimeout(function () { map.invalidateSize(); }, 0);
      window.scrollTo(0, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // 入口(URL)
  // ---------------------------------------------------------------------------

  /** `?hotel=<lat>,<lon>,<名前>` を読む。読めなければ null。 */
  function hotelFromUrl(params) {
    var raw = params.get('hotel');
    if (!raw) return null;
    var parts = raw.split(',');
    if (parts.length < 2) return null;
    var lat = parseFloat(parts[0]);
    var lon = parseFloat(parts[1]);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    // 地球上に無い座標(?hotel=999,999 など)は ?hotel= 無しと同じ扱いにして
    // 状態Aへ黙ってフォールバックする(?bg= の厳格検証と同じ方針。R99)
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    var name = parts.slice(2).join(',').trim();
    return { id: 'url/' + lat + ',' + lon, name: name || 'この宿の周辺', lat: lat, lon: lon };
  }

  /**
   * `?fixture=<名前>` を読む。使えない名前は null(=通常動作に戻す)。
   * 固定データは撮影・検証用で、外部APIを叩かずに状態Bを再現するためのもの。
   * `random` は SAMPLE_LINKS からランダムに1つ選ぶ(R70)。呼び出しごとに結果が
   * ぶれるとヘッダー表示とfetch対象がずれるので、1回解決した結果をキャッシュする。
   */
  var resolvedRandomFixture;
  function fixtureNameFromUrl(params) {
    var raw = (params.get('fixture') || '').trim();
    if (!raw || !/^[a-z0-9_-]+$/.test(raw)) return null;
    if (raw === 'random') {
      if (resolvedRandomFixture === undefined) {
        resolvedRandomFixture = SAMPLE_LINKS.length
          ? SAMPLE_LINKS[Math.floor(Math.random() * SAMPLE_LINKS.length)].fixture
          : null;
      }
      return resolvedRandomFixture;
    }
    return raw;
  }

  /**
   * `?slow=osm800,wiki1500` を読む。撮影・目視QA専用で、段階描画(OSM先出し→Wikipedia後乗せ)
   * をわざと見えやすくするための遅延指定。不正な片は黙って無視し、通常動作にフォールバックする。
   */
  function slowDelaysFromUrl(params) {
    var raw = (params.get('slow') || '').trim();
    if (!raw) return null;
    var result = { osm: 0, wiki: 0 };
    var found = false;
    raw.split(',').forEach(function (piece) {
      var m = /^(osm|wiki)(\d{1,5})$/.exec(piece.trim());
      if (!m) return;
      var ms = Math.min(parseInt(m[2], 10), 10000);
      result[m[1]] = ms;
      found = true;
    });
    return found ? result : null;
  }

  /** `?embed=1` を読む。宿の指定(hotel / fixture)と併用したときだけ意味を持つ。 */
  function isEmbedFromUrl(params) {
    return params.get('embed') === '1';
  }

  // 相対輝度がこの値未満の bg は既定地色にフォールバックする。
  // 根拠: 地色に直接乗る `.feednote`/`.morenote`(色 --c-text-faint #9494a3)が
  // 黒地(L=0)付近で白カードとの明暗差が極端になり画面がちらつくため、
  // #fff7e6(L≈0.93)は通し #333333(L≈0.033)は弾く境界として 0.5 を採用。
  var BG_MIN_LUMINANCE = 0.5;

  /** `?bg=<6桁HEX>` を読む。3桁/7桁/色名/CSS混入および暗すぎる色は黙って無視して null を返す。 */
  function bgFromUrl(params) {
    var raw = params.get('bg');
    if (!raw) return null;
    var hex = raw.charAt(0) === '#' ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    // 暗すぎる地色は淡色テキスト(.feednote/.morenote)が読みづらくなるため既定色に戻す。
    var r = parseInt(hex.slice(0, 2), 16) / 255;
    var g = parseInt(hex.slice(2, 4), 16) / 255;
    var b = parseInt(hex.slice(4, 6), 16) / 255;
    var toLinear = function (c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    var L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    if (L < BG_MIN_LUMINANCE) return null;
    return '#' + hex;
  }

  /** 埋め込みの入り切り。クラスは CSS 側の出し分けに使う。bg は embed 時のみ反映する。 */
  function setEmbed(on, bg) {
    state.embed = !!on;
    document.body.classList.toggle('is-embed', !!on);
    if (state.embed && bg) {
      document.documentElement.style.setProperty('--c-bg', bg);
    } else {
      document.documentElement.style.removeProperty('--c-bg');
    }
    if (state.embed) {
      startHeightObserver();
    } else if (heightObserver) {
      heightObserver.disconnect();
      heightObserver = null;
    }
  }

  var heightObserver = null;
  var lastSentHeight = 0;
  var heightRaf = null;

  /**
   * `?embed=1` のときだけ、親ウィンドウへ現在の高さを知らせる。
   * 受信側は origin を検証した上で iframe の高さを伸ばす想定(demo/hotel-page.html 参照)。
   */
  function postHeightToParent() {
    if (!state.embed) return;
    if (!global.parent || global.parent === global) return;
    if (heightRaf) return;
    heightRaf = global.requestAnimationFrame(function () {
      heightRaf = null;
      var height = Math.ceil(Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement.scrollHeight
      ));
      if (height === lastSentHeight) return;
      lastSentHeight = height;
      global.parent.postMessage({ type: 'yadotabi:height', height: height }, '*');
    });
  }

  /** embed 中だけ body の変化を監視し、高さ変化を親へ伝える。 */
  function startHeightObserver() {
    if (heightObserver) return;
    if (typeof ResizeObserver !== 'function') return;
    heightObserver = new ResizeObserver(function () {
      postHeightToParent();
    });
    heightObserver.observe(document.body);
    postHeightToParent();
  }

  function applyEntryPoint() {
    var params = new URLSearchParams(global.location.search);

    // `?simulate=overpass504` で Overpass だけ混雑している状態を再現する。
    // fixture と併用すると「Overpassは死んでWikipediaは生きている」を外部APIなしで撮れる。
    if (params.get('simulate') === 'overpass504' && typeof YadoGeo.setSimulateBusy === 'function') {
      YadoGeo.setSimulateBusy(true);
    }

    // ここから下は撮影・目視QA専用の入口。パラメータが無ければ全て素通りする。
    var slow = slowDelaysFromUrl(params);
    if (slow && typeof YadoGeo.setSlowDelays === 'function') YadoGeo.setSlowDelays(slow);
    if (params.get('perf') === '1') perfOn = true;
    if (params.get('simulate') === 'empty') demoEmpty = true;
    var demo = params.get('demo') || '';
    if (demo === 'far') demoFar = true;
    if (demo === 'zoomout' || demo === 'initpos') demoNoSaveView = true;
    if (demo === 'suggest' || demo === 'recent' || demo === 'recentmix' || demo === 'zoomout' || demo === 'initpos') demoStateA = true;
    if (demo === 'passive') demoPassive = true;
    if (demo === 'imgfail') demoImgFail = true;
    if (demo === 'portrait') demoPortrait = true;
    // R84: rank の内訳表示。開発者・研究向けなので `?fixture=` 併用時のみ立てる。
    // 本番URL(実データ)で一般の人に内訳が見えてはいけない。
    if (params.get('debug') === '1' && fixtureNameFromUrl(params)) debugRank = true;
    if (demo === 'nohotels') { demoStateA = true; demoNoHotels = true; }
    // ?demo=autozoom: demoStateA は立てず、fetchHotelsInBbox を回数で差し替える
    // (外部APIを叩かずに「0件→自動で1段引く→2回目で宿が出る」経路を再現する)。
    // 1回目(初期 flyTo)=0件、2回目(自動ズーム後)=宿1件、3回目以降(ドラッグ等)=0件
    // にして、「ドラッグ起点の0件では自動ズームが起きない」ことも同じ仕掛けで検証できるようにする。
    if (demo === 'autozoom') {
      var autoZoomFetchCount = 0;
      YadoGeo.fetchHotelsInBbox = function (south, west, north, east) {
        autoZoomFetchCount++;
        if (autoZoomFetchCount === 2) {
          // 自動ズーム後(2回目)だけ、範囲の中心にダミーの宿を1件返す
          var lat = (south + north) / 2;
          var lon = (west + east) / 2;
          return Promise.resolve([
            { id: 'demo-autozoom-1', name: '自動ズームで見つかった宿', lat: lat, lon: lon, kind: 'hotel' }
          ]);
        }
        return Promise.resolve([]);
      };
    }

    // ?demo=hoteltip: demoStateA は立てず、fetchHotelsInBbox を密集した宿データに差し替える
    // (状態Aの宿名ツールチップの見た目確認用。外部APIは叩かない)。
    if (demo === 'hoteltip') {
      YadoGeo.fetchHotelsInBbox = function (south, west, north, east) {
        var lat = (south + north) / 2;
        var lon = (west + east) / 2;
        var dLat = (north - south) / 6;
        var dLon = (east - west) / 6;
        return Promise.resolve([
          { id: 'demo-hoteltip-1', name: '草津温泉 ホテル紅葉亭', lat: lat, lon: lon, kind: 'hotel' },
          { id: 'demo-hoteltip-2', name: '湯畑前旅館', lat: lat + dLat, lon: lon + dLon, kind: 'hotel' },
          { id: 'demo-hoteltip-3', name: '湯畑前旅館別館', lat: lat + dLat * 1.05, lon: lon + dLon * 1.05, kind: 'hotel' },
          { id: 'demo-hoteltip-4', name: '西の河原ホテル', lat: lat - dLat, lon: lon - dLon, kind: 'hotel' },
          { id: 'demo-hoteltip-5', name: '草津温泉 ホテルきよさと', lat: lat - dLat * 2, lon: lon + dLon * 2, kind: 'hotel' },
          { id: 'demo-hoteltip-6', name: '光泉寺前の宿', lat: lat + dLat * 2, lon: lon - dLon * 2, kind: 'hotel' }
        ]);
      };
    }

    var fixtureName = fixtureNameFromUrl(params);

    // 埋め込みは「宿が決まっている」ことが前提。どちらも無ければ通常動作(状態A)に落とす。
    var hasTarget = !!hotelFromUrl(params) || !!fixtureName;
    if (isEmbedFromUrl(params) && hasTarget) setEmbed(true, bgFromUrl(params));

    if (fixtureName) {
      // fixture の読み込みは撮影用の事情で、本番の通常動作には無い工程。
      // 状態Bの計測(t0)と混ざらないよう、ここだけ別の起点で測って先に出す。
      var fixtureStart = perfNow();
      // GitHub Pages のサブパス(/yadotabi/)でも動くよう相対パスで読む
      fetch('fixtures/' + fixtureName + '.json')
        .then(function (res) {
          if (!res.ok) throw new Error('fixture ' + res.status);
          return res.json();
        })
        .then(function (json) {
          if (!json || !json.meta) throw new Error('fixture broken');
          if (perfOn && global.console && global.console.log) {
            global.console.log('[perf] fixture-loaded ' + Math.round(perfNow() - fixtureStart) + 'ms');
          }
          YadoGeo.setFixture(json);
          isFixtureMode = true;
          fixtureGeneratedAt = formatFixtureDate(json.meta && json.meta.generatedAt);
          // ?hotel= が同時にあるならそちらの座標を優先する(fixture はデータ源だけ差し替える)
          var hotel = hotelFromUrl(params) || {
            id: 'fixture/' + fixtureName,
            name: (json.meta && json.meta.label ? json.meta.label : fixtureName),
            lat: json.meta.lat,
            lon: json.meta.lon
          };
          selectHotel(hotel);
        })
        .catch(function () {
          // 読めなければ黙って通常動作へ。画面は絶対に空白にしない。
          // R84: fixture が読めなかった＝本番データを見ている状態なので、内訳表示は必ず降ろす。
          debugRank = false;
          // ?hotel= も無いなら状態Aに戻るので、埋め込みの隠しも解除する。
          if (state.embed && !hotelFromUrl(params)) {
            setEmbed(false);
            ensureMap(); // 埋め込み前提で作っていなかったので、ここで立ち上げる
            render();
          }
          applyNormalEntryPoint(params);
        });
      return;
    }

    if (demo === 'autozoom') {
      // ?q= ジャンプ等の外部APIを介さず、flyTo() 経由の0件合流だけを再現する
      // (Nominatim を叩かずに済ませるため、初期位置への flyTo で代用する)。
      ensureMap();
      flyTo(DEFAULT_VIEW.lat, DEFAULT_VIEW.lon, DEFAULT_VIEW.zoom, true);
      return;
    }

    applyNormalEntryPoint(params);
    applyDemoStateA(demo);
  }

  /**
   * 状態Aの「操作しないと見られない画面」を撮影するための差し替え。
   * 入力もクリックもできない撮影ツール向けなので、描画関数を直接呼ぶ。
   * localStorage は汚さない(demo=recent も保存された履歴を読まない)。
   */
  function applyDemoStateA(demo) {
    if (demo === 'suggest') {
      els.searchInput.value = '草津';
      syncSearchClear();
      renderSuggest([
        { act: 'hotel', icon: '♨', name: '草津温泉 湯畑の宿 佳乃や',
          sub: '日本、〒377-1711 群馬県吾妻郡草津町草津123-4' },
        { act: 'hotel', icon: '♨', name: 'ホテルヴィレッジ 草津温泉 ベルツの森リゾートアネックス館',
          sub: '日本、〒377-1711 群馬県吾妻郡草津町大字草津618番地 西の河原通り沿い' },
        { act: 'hotel', icon: '🏨', name: '草津ナウリゾートホテル', sub: '群馬県吾妻郡草津町草津' },
        { act: 'hotel', icon: '♨', name: '旅館 たむら', sub: '群馬県吾妻郡草津町' },
        { act: 'jump', icon: '📍', name: 'このあたりを見る（草津温泉）',
          sub: '日本、群馬県吾妻郡草津町（温泉地）' }
      ]);
      return;
    }
    if (demo === 'recent') {
      els.searchInput.value = '';
      syncSearchClear();
      renderSuggest([
        { act: 'hotel', icon: '🕘', name: '草津温泉 湯畑の宿 佳乃や' },
        { act: 'hotel', icon: '🕘', name: 'ホテルヴィレッジ 草津温泉 ベルツの森リゾートアネックス館' },
        { act: 'hotel', icon: '🕘', name: '別府温泉 杉乃井ホテル' }
      ]);
      return;
    }
    if (demo === 'recentmix') {
      // 統合後の姿(入力あり+最近の一致+候補)を撮るための固定配列。
      // 候補行は実クリックでも状態Bへ遷移できるよう hotel 座標を持たせる。
      els.searchInput.value = '草津';
      syncSearchClear();
      renderSuggest([
        { act: 'head', name: '最近見た宿' },
        { act: 'hotel', icon: '🕘', name: '草津温泉 湯畑の宿 佳乃や',
          hotel: { name: '草津温泉 湯畑の宿 佳乃や', lat: 36.6226, lon: 138.5960 } },
        { act: 'hotel', icon: '🕘', name: '草津ナウリゾートホテル',
          hotel: { name: '草津ナウリゾートホテル', lat: 36.6230, lon: 138.5965 } },
        { act: 'head', name: '検索結果' },
        { act: 'hotel', icon: '♨', name: '旅館 たむら', sub: '群馬県吾妻郡草津町',
          hotel: { name: '旅館 たむら', lat: 36.6235, lon: 138.5970 } },
        { act: 'hotel', icon: '🏨', name: '草津温泉 ホテル一井', sub: '群馬県吾妻郡草津町草津',
          hotel: { name: '草津温泉 ホテル一井', lat: 36.6240, lon: 138.5975 } },
        { act: 'hotel', icon: '♨', name: '西の河原の宿 松むら', sub: '群馬県吾妻郡草津町大字草津',
          hotel: { name: '西の河原の宿 松むら', lat: 36.6245, lon: 138.5980 } },
        { act: 'jump', icon: '📍', name: 'このあたりを見る（草津温泉）',
          sub: '日本、群馬県吾妻郡草津町（温泉地）',
          hotel: { name: '草津温泉', lat: 36.6226, lon: 138.5960 } }
      ]);
      return;
    }
    if (demo === 'zoomout') {
      // ズーム不足バナーは「引きすぎた地図」でしか出ないので、撮影時だけ引いて再取得する。
      // 保存済みの地図位置(localStorage)は書き換えない。
      ensureMap();
      map.setZoom(8, { animate: false });
      loadHotelsInView();
    }
  }

  function applyNormalEntryPoint(params) {
    var urlHotel = hotelFromUrl(params);
    if (urlHotel) {
      // 状態Aを飛ばして即フィードへ
      selectHotel(urlHotel);
      return;
    }

    var q = (params.get('q') || '').trim();
    if (q.length >= 2) {
      els.searchInput.value = q;
      syncSearchClear();
      setCurrentChip(currentAreaIndex(q));
      YadoGeo.suggestHotels(q).then(function (results) {
        if (state.view !== 'select') return;
        if (!results.length) { setMapNote(noQueryHitText(q)); return; }
        flyTo(results[0].lat, results[0].lon, DEFAULT_VIEW.zoom);
      }).catch(function () { /* 失敗しても初期位置のままでよい */ });
      return;
    }

    // ?q も ?hotel も無いときは、保存済み or 既定位置のまま宿を取りに行く
    loadHotelsInView();
  }

  // ---------------------------------------------------------------------------
  // 組み立て
  // ---------------------------------------------------------------------------

  function renderChips() {
    els.chips.innerHTML = AREAS.map(function (a, i) {
      return '<button type="button" class="chip" data-index="' + i + '">' + escapeHtml(a.label) + '</button>';
    }).join('');
  }

  /**
   * R63: 初見の人が宿を選ばなくても状態Bを体験できる「サンプルを見る」導線。
   * fixture 中(既に固定データを見ている)や embed 中は不要なので出さない。
   * ロジック変更はせず素の <a href="?fixture=..."> の遷移に任せる。
   */
  var SAMPLE_LINKS = [
    { fixture: 'kusatsu', label: '草津の例' },
    { fixture: 'hakone', label: '箱根の例' },
    { fixture: 'dogo', label: '道後の例' },
    { fixture: 'beppu', label: '別府の例' }
  ];
  function renderSampleLinks() {
    if (!els.samples) return;
    var params = new URLSearchParams(global.location.search);
    var hideSamples = state.embed || !!fixtureNameFromUrl(params);
    els.samples.hidden = hideSamples;
    if (hideSamples) return;
    els.samples.innerHTML = '<span class="samples__label">サンプル:</span>' +
      SAMPLE_LINKS.map(function (s) {
        return '<a href="?fixture=' + s.fixture + '">' + escapeHtml(s.label) + '</a>';
      }).join('') +
      '<a href="?fixture=random">おまかせ</a>';
  }

  /**
   * 文字列が AREAS のどのチップに該当するかを判定する。
   * チップのラベルで前方一致(「草津温泉」→「草津」)する最初の index を返す。該当なしは -1。
   */
  function currentAreaIndex(text) {
    var t = (text || '').trim();
    if (!t) return -1;
    for (var i = 0; i < AREAS.length; i++) {
      if (t.indexOf(AREAS[i].label) === 0) return i;
    }
    return -1;
  }

  /**
   * エリアチップの強調表示を更新する。該当が無ければ全て無強調にする。
   * 該当チップは画面内(横スクロール範囲内)に来るようスクロールする。
   */
  function setCurrentChip(index) {
    if (!els.chips) return;
    var buttons = els.chips.querySelectorAll('.chip');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (i === index) {
        btn.classList.add('chip--current');
        btn.setAttribute('aria-current', 'true');
        btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
      } else {
        btn.classList.remove('chip--current');
        btn.removeAttribute('aria-current');
      }
    }
  }

  function bindEvents() {
    // --- 検索欄 ---
    els.searchInput.addEventListener('input', function () {
      runSuggest(els.searchInput.value);
      syncSearchClear();
    });
    els.searchInput.addEventListener('focus', function () {
      if (els.searchInput.value.trim().length < 2) showRecent();
    });
    els.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        hideSuggest();
        els.searchInput.blur();
      }
    });
    els.searchClear.addEventListener('click', function () {
      els.searchInput.value = '';
      hideSuggest();
      syncSearchClear();
      els.searchInput.focus();
    });

    // 候補の外をタップしたら閉じる(候補内のタップより後に走らないよう mousedown は使わない)
    document.addEventListener('click', function (e) {
      if (els.suggest.hidden) return;
      if (els.suggest.contains(e.target) || e.target === els.searchInput || e.target === els.searchClear) return;
      hideSuggest();
    });

    els.suggest.addEventListener('click', function (e) {
      var btn = e.target.closest('.suggest__item');
      if (!btn) return;
      var row = suggestItems[Number(btn.dataset.index)];
      if (!row) return;

      if (row.act === 'hotel') {
        selectHotel(row.hotel);
      } else if (row.act === 'jump') {
        // 地名は宿ではないので、選ぶのではなく地図を寄せるだけ
        hideSuggest();
        setCurrentChip(currentAreaIndex(row.hotel.name));
        flyTo(row.hotel.lat, row.hotel.lon, DEFAULT_VIEW.zoom);
      }
    });

    // --- エリアチップ ---
    els.chips.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      var area = AREAS[Number(btn.dataset.index)];
      if (!area) return;
      hideSuggest();
      setCurrentChip(Number(btn.dataset.index));
      flyTo(area.lat, area.lon, DEFAULT_VIEW.zoom);
    });

    // --- 状態B ---
    els.backBtn.addEventListener('click', goBackFromUi);

    // 画像読み込み失敗時は画像なしカードと同じプレースホルダに差し替える。
    // error イベントは <img> からバブリングしないため、capture=true が必須。
    els.feedList.addEventListener('error', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG' || !img.classList.contains('feedcard__img')) return;
      var ph = document.createElement('div');
      ph.innerHTML = placeholderHtml(
        { categoryLabel: img.dataset.cat || '' },
        img.dataset.emoji || emojiFor(img.dataset.cat || '')
      );
      img.replaceWith(ph.firstChild);
    }, true);

    els.feedList.addEventListener('click', function (e) {
      var hotel = state.hotel;
      var badge = e.target.closest('.feedcard__no');
      if (badge) {
        var badgeArticle = badge.closest('.feedcard');
        var badgeCard = badgeArticle ? state.cards[Number(badgeArticle.dataset.index)] : null;
        if (badgeCard && feedMap) {
          if (hotel) {
            passivePush('tap', {
              hotelId: hotel.id,
              cardId: badgeCard.id,
              cardName: badgeCard.name,
              index: Number(badgeArticle.dataset.index)
            });
          }
          feedMap.panTo([badgeCard.lat, badgeCard.lon]);
          els.feedMap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          flashPin(Number(badge.dataset.no) - 1);
        }
        return;
      }
      var imgBtn = e.target.closest('.feedcard__imgbtn');
      if (imgBtn) {
        var btnImg = imgBtn.querySelector('.feedcard__img');
        if (btnImg) openLightbox(btnImg, imgBtn);
        return;
      }
      var a = e.target.closest('a');
      if (a) {
        var art = a.closest('.feedcard');
        if (art && hotel) {
          var linkedCard = state.cards[Number(art.dataset.index)];
          if (linkedCard) {
            passivePush('link', {
              hotelId: hotel.id,
              cardId: linkedCard.id,
              cardName: linkedCard.name,
              index: Number(art.dataset.index),
              label: a.textContent.trim(),
              url: a.href
            });
          }
        }
        // リンクのタップは素通しする(地図を動かさない)
        return;
      }
      var article = e.target.closest('.feedcard');
      if (!article || article.classList.contains('feedcard--skeleton')) return;
      var card = state.cards[Number(article.dataset.index)];
      if (!card || !feedMap) return;
      if (hotel) {
        passivePush('tap', {
          hotelId: hotel.id,
          cardId: card.id,
          cardName: card.name,
          index: Number(article.dataset.index)
        });
      }
      feedMap.panTo([card.lat, card.lon]);
      els.feedMap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    if (els.feedMore) {
      els.feedMore.addEventListener('click', function (e) {
        if (!e.target.closest('#more-btn')) return;
        state.moreOpen = true;
        renderFeed();
        postHeightToParent();
      });
    }

    // --- ブラウザの「戻る」 ---
    global.addEventListener('popstate', function () {
      if (state.embed) return;
      if (state.view === 'feed') goBack();
      // 既に状態Aならブラウザが勝手に離脱するのが正しい挙動
    });
  }

  function init() {
    els = {
      viewSelect: document.getElementById('view-select'),
      viewFeed: document.getElementById('view-feed'),
      searchInput: document.getElementById('search-input'),
      searchClear: document.getElementById('search-clear'),
      suggest: document.getElementById('suggest-list'),
      chips: document.getElementById('area-chips'),
      samples: document.getElementById('sample-links'),
      map: document.getElementById('map'),
      mapNote: document.getElementById('map-note'),
      backBtn: document.getElementById('back-btn'),
      feedTitle: document.getElementById('feed-title'),
      feedBadge: document.getElementById('feed-badge'),
      feedBadgeDate: document.getElementById('feed-badge-date'),
      feedMap: document.getElementById('feed-map'),
      feedStatus: document.getElementById('feed-status'),
      feedList: document.getElementById('feed-list'),
      feedMore: document.getElementById('feed-more'),
      feedFar: document.getElementById('feed-far'),
      feedNote: document.getElementById('feed-note')
    };

    renderChips();
    bindEvents();
    // 埋め込みかどうかは地図を作る前に決める(状態Aの地図を無駄に立ち上げないため)。
    // 実際の入口処理は applyEntryPoint() に任せる。
    var initialParams = new URLSearchParams(global.location.search);
    if (isEmbedFromUrl(initialParams) &&
        (hotelFromUrl(initialParams) || fixtureNameFromUrl(initialParams))) {
      setEmbed(true, bgFromUrl(initialParams));
    }
    renderSampleLinks();
    if (!state.embed) ensureMap();
    render();
    applyEntryPoint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // デバッグ・検証用に状態を覗けるようにしておく
  global.YadoApp = {
    getState: function () { return state; },
    selectHotel: selectHotel,
    goBack: goBack,
    getMap: function () { return map; },
    // R118: 小地図のピン配置が「提案順位」に依存しないことを検査するための再描画フック。
    // rank の計算には一切触れず、既に確定した state.cards の**並びだけ**を入れ替えて
    // renderFeedMap() をやり直す(scripts/check-attrib.mjs が使う)。
    reorderCardsForTest: function (order) {
      if (!Array.isArray(order) || order.length !== state.cards.length) return false;
      state.cards = order.map(function (i) { return state.cards[i]; });
      renderFeedMap();
      return true;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
