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
    { label: '草津', lat: 36.6226, lon: 138.5960 },
    { label: '伊香保', lat: 36.4886, lon: 138.9200 },
    { label: '箱根', lat: 35.2324, lon: 139.1069 },
    { label: '熱海', lat: 35.0959, lon: 139.0717 },
    { label: '別府', lat: 33.2794, lon: 131.5006 },
    { label: '由布院', lat: 33.2647, lon: 131.3870 },
    { label: '城崎', lat: 35.6247, lon: 134.8055 },
    { label: '道後', lat: 33.8521, lon: 132.7861 }
  ];

  /** この倍率より引いた地図では宿を取りに行かない(Overpassに広い範囲を投げないため)。 */
  var MIN_HOTEL_ZOOM = 13;

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
    far: [],
    stage: null       // null | "loading" | "osm" | "wiki" | "done" | "error"
  };

  /** 提案リクエストの世代番号。戻る→別の宿、の取り違えを防ぐ。 */
  var requestSeq = 0;

  var els = {};
  var map = null;            // 状態Aの地図(1回だけ生成して使い回す)
  var hotelLayer = null;     // 宿ピンのレイヤ
  var feedMap = null;        // 状態Bの小さい地図
  var feedMarkers = [];
  var suggestItems = [];
  var lastSuggestQuery = '';

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
    if (!map) return;
    var c = map.getCenter();
    lsSet(LS_MAPVIEW, { lat: c.lat, lon: c.lng, zoom: map.getZoom() });
  }

  function initialView() {
    var saved = lsGet(LS_MAPVIEW);
    if (saved && isFinite(saved.lat) && isFinite(saved.lon) && isFinite(saved.zoom)) {
      return { lat: saved.lat, lon: saved.lon, zoom: saved.zoom };
    }
    return { lat: DEFAULT_VIEW.lat, lon: DEFAULT_VIEW.lon, zoom: DEFAULT_VIEW.zoom };
  }

  function ensureMap() {
    if (map) return map;
    var view = initialView();
    map = L.map(els.map, { zoomControl: true }).setView([view.lat, view.lon], view.zoom);
    // タイルレイヤは1回だけ足す(状態を行き来しても重複追加しない)
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
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

  var onMapMoved = debounce(function () {
    if (state.view !== 'select' || !map) return;
    saveMapView();
    loadHotelsInView();
  }, DEBOUNCE_MOVE_MS);

  function loadHotelsInView() {
    if (!map) return;

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
        setMapNote(hotels.length ? '' : 'この範囲には宿が見つかりませんでした');
      })
      .catch(function (err) {
        if (state.view !== 'select') return;
        hotelLayer.clearLayers();
        // 範囲が広すぎるときはズーム不足と同じ案内にする(利用者にとっては同じこと)
        setMapNote(err && err.tooWide ? 'ズームすると宿が出ます' : (err && err.message) || '宿を取得できませんでした');
      });
  }

  function renderHotelPins(hotels) {
    hotelLayer.clearLayers();
    hotels.forEach(function (h) {
      var icon = L.divIcon({
        className: 'pin pin--hotel',
        html: '<span>' + hotelEmoji(h) + '</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      var marker = L.marker([h.lat, h.lon], { icon: icon, title: h.name }).addTo(hotelLayer);
      marker.on('click', function () { selectHotel(h); });
    });
  }

  function flyTo(lat, lon, zoom) {
    ensureMap();
    map.setView([lat, lon], zoom || DEFAULT_VIEW.zoom);
    saveMapView();
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

  /** 候補と「最近」をまとめて描く。行の種類は data-act で区別する。 */
  function renderSuggest(rows) {
    if (!rows.length) {
      hideSuggest();
      return;
    }
    suggestItems = rows;
    var html = rows.map(function (row, i) {
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

  function showRecent() {
    var recent = getRecent();
    if (!recent.length) {
      hideSuggest();
      return;
    }
    renderSuggest(recent.map(function (r) {
      return {
        act: 'hotel',
        icon: '🕘',
        name: r.name,
        sub: '最近見た宿',
        hotel: { name: r.name, lat: r.lat, lon: r.lon, kind: r.kind }
      };
    }));
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
          renderSuggest([{ act: 'none', icon: '🔍', name: '見つかりませんでした', sub: '別の名前で探してみてください' }]);
          return;
        }
        renderSuggest(rows);
      })
      .catch(function () {
        if (q !== lastSuggestQuery) return;
        renderSuggest([{ act: 'none', icon: '⚠️', name: '検索できませんでした', sub: '少し待ってからお試しください' }]);
      });
  }, DEBOUNCE_SEARCH_MS);

  // ---------------------------------------------------------------------------
  // 宿を選ぶ → 状態B
  // ---------------------------------------------------------------------------

  function selectHotel(hotel) {
    if (!hotel || !isFinite(hotel.lat) || !isFinite(hotel.lon)) return;

    hideSuggest();
    if (els.searchInput) els.searchInput.blur();

    state.view = 'feed';
    state.hotel = hotel;
    state.cards = [];
    state.far = [];
    state.stage = 'loading';
    pushRecent(hotel);
    render();

    var seq = ++requestSeq;

    YadoEngine.suggest(hotel, {}, function (stage, partial) {
      if (seq !== requestSeq || state.view !== 'feed') return;
      state.stage = stage;
      state.cards = (partial && partial.cards) || [];
      state.far = (partial && partial.far) || [];
      render();
    }).then(function (result) {
      if (seq !== requestSeq || state.view !== 'feed') return;
      state.stage = 'done';
      state.cards = (result && result.cards) || [];
      state.far = (result && result.far) || [];
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
    state.far = [];
    state.stage = null;
    render();
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
    if (gmap) rows.push({ url: gmap, label: 'Googleマップ' });
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

  function cardHtml(card, index) {
    var emoji = emojiFor(card.categoryLabel);
    var media = card.imageUrl && safeUrl(card.imageUrl)
      ? '<img class="feedcard__img" src="' + escapeHtml(card.imageUrl) + '" alt="" loading="lazy">'
      : '<div class="feedcard__ph" data-cat="' + escapeHtml(card.categoryLabel || '') + '">' +
          '<span aria-hidden="true">' + escapeHtml(emoji) + '</span></div>';

    var summary = card.summary
      ? '<p class="feedcard__summary">' + escapeHtml(card.summary) + '</p>'
      : '';

    return '<article class="card feedcard" data-index="' + index + '">' +
      '<div class="feedcard__media">' + media +
        '<span class="feedcard__no" aria-hidden="true">' + (index + 1) + '</span>' +
      '</div>' +
      '<div class="feedcard__body">' +
        '<h2 class="feedcard__name">' + escapeHtml(card.name) + '</h2>' +
        '<p class="feedcard__meta">' +
          '<span class="feedcard__cat">' + escapeHtml(emoji) + ' ' + escapeHtml(card.categoryLabel || '') + '</span>' +
          '<span class="feedcard__times">🚶徒歩' + escapeHtml(String(card.walkMin)) + '分 · 🚗車' +
            escapeHtml(String(card.driveMin)) + '分</span>' +
        '</p>' +
        summary +
        linkRowHtml(card) +
      '</div>' +
    '</article>';
  }

  function emptyHtml(hotel) {
    var url = 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(hotel.lat + ',' + hotel.lon);
    return '<div class="card empty">' +
      '<p class="empty__title">この周辺ではまだ提案を作れませんでした</p>' +
      '<p class="empty__note">データが少ないエリアのようです。地図で直接探してみてください。</p>' +
      '<a class="btn btn--secondary" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
        'Googleマップで周辺を見る</a>' +
    '</div>';
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

  function statusText(stage) {
    if (stage === 'loading' || stage === 'osm') return '周辺を集めています…';
    if (stage === 'wiki') return 'Wikipediaで補強しています…';
    return '';
  }

  function renderFeed() {
    var hotel = state.hotel;
    if (!hotel) return;

    els.feedTitle.textContent = hotel.name || '';

    var status = statusText(state.stage);
    els.feedStatus.hidden = !status;
    els.feedStatus.textContent = status;

    var loading = state.stage === 'loading' || state.stage === 'osm' || state.stage === 'wiki';

    if (state.stage === 'error') {
      els.feedList.innerHTML = '<div class="card empty">' +
        '<p class="empty__title">提案を作れませんでした</p>' +
        '<p class="empty__note">通信が不安定かもしれません。戻ってもう一度お試しください。</p>' +
      '</div>';
      els.feedFar.hidden = true;
      return;
    }

    var html = state.cards.map(cardHtml).join('');
    // スケルトンは「まだ増える」ことを示すので、読み込み中は実カードの後ろに残す
    if (loading) html += skeletonHtml();
    if (!loading && !state.cards.length) html = emptyHtml(hotel);

    els.feedList.innerHTML = html;

    var far = farHtml(state.far);
    els.feedFar.hidden = !far;
    els.feedFar.innerHTML = far;

    renderFeedMap();
  }

  function ensureFeedMap() {
    if (feedMap) return feedMap;
    feedMap = L.map(els.feedMap, {
      zoomControl: false,
      attributionControl: false,
      // 小さい地図なので、指が取られないようスクロールズームは切る
      scrollWheelZoom: false
    }).setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lon], DEFAULT_VIEW.zoom);
    L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(feedMap);
    return feedMap;
  }

  /**
   * 画面上で近すぎる上位ピンを、表示位置だけ円状にずらして分離する。
   * `fixed` は動かさない基準点(宿ピン)の layerPoint 配列。
   * `points` は [marker, layerPoint] の配列で、呼び出し側で先頭から重要度順に並べる。
   * 緯度経度(state.cards / fitBounds 用の points)は書き換えず、marker の見た目位置だけ setLatLng する。
   */
  function nudgeOverlaps(markerPoints, fixedPoints) {
    var MIN_DIST = 28;
    var NUDGE = 16;
    var placed = fixedPoints.slice();
    markerPoints.forEach(function (mp) {
      var best = mp.point;
      var isTooClose = function (p) {
        return placed.some(function (q) { return p.distanceTo(q) < MIN_DIST; });
      };
      if (isTooClose(best)) {
        // 8方向 x 3リング(半径を広げながら)試して、最初に空いた場所を採用する
        outer:
        for (var ring = 1; ring <= 3; ring++) {
          for (var dir = 0; dir < 8; dir++) {
            var angle = dir * (Math.PI / 4);
            var candidate = mp.point.add([Math.cos(angle) * NUDGE * ring, Math.sin(angle) * NUDGE * ring]);
            if (!isTooClose(candidate)) {
              best = candidate;
              break outer;
            }
          }
        }
      }
      if (best !== mp.point) {
        mp.marker.setLatLng(feedMap.layerPointToLatLng(best));
      }
      placed.push(best);
    });
  }

  function renderFeedMap() {
    var hotel = state.hotel;
    if (!hotel) return;
    ensureFeedMap();

    feedMarkers.forEach(function (m) { feedMap.removeLayer(m); });
    feedMarkers = [];

    var hotelIcon = L.divIcon({
      className: 'pin pin--hotel',
      html: '<span>' + hotelEmoji(hotel) + '</span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    var hm = L.marker([hotel.lat, hotel.lon], { icon: hotelIcon, zIndexOffset: 2000 }).addTo(feedMap);
    feedMarkers.push(hm);

    var points = [[hotel.lat, hotel.lon]];
    var spotMarkers = [];
    state.cards.forEach(function (c, i) {
      var icon = L.divIcon({
        className: 'pin pin--spot' + (i < 5 ? ' pin--top' : ''),
        html: '<span>' + (i + 1) + '</span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      var m = L.marker([c.lat, c.lon], { icon: icon, title: c.name, zIndexOffset: 1000 - i }).addTo(feedMap);
      feedMarkers.push(m);
      spotMarkers.push(m);
      points.push([c.lat, c.lon]);
    });

    if (points.length > 1) {
      feedMap.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 14 });
    } else {
      feedMap.setView([hotel.lat, hotel.lon], 14);
    }
    // 非表示から表示に切り替えた直後はコンテナ寸法が0なので測り直す
    setTimeout(function () {
      if (!feedMap) return;
      feedMap.invalidateSize();
      // ズーム・中心が確定してからでないと layerPoint が正しく取れない
      var fixedPoints = [feedMap.latLngToLayerPoint(hm.getLatLng())];
      var markerPoints = spotMarkers.map(function (m) {
        return { marker: m, point: feedMap.latLngToLayerPoint(m.getLatLng()) };
      });
      nudgeOverlaps(markerPoints, fixedPoints);
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // render: 状態 → 画面
  // ---------------------------------------------------------------------------

  function render() {
    var isFeed = state.view === 'feed';
    els.viewSelect.hidden = isFeed;
    els.viewFeed.hidden = !isFeed;

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
    var name = parts.slice(2).join(',').trim();
    return { id: 'url/' + lat + ',' + lon, name: name || 'この宿', lat: lat, lon: lon };
  }

  /**
   * `?fixture=<名前>` を読む。使えない名前は null(=通常動作に戻す)。
   * 固定データは撮影・検証用で、外部APIを叩かずに状態Bを再現するためのもの。
   */
  function fixtureNameFromUrl(params) {
    var raw = (params.get('fixture') || '').trim();
    if (!raw || !/^[a-z0-9_-]+$/.test(raw)) return null;
    return raw;
  }

  function applyEntryPoint() {
    var params = new URLSearchParams(global.location.search);

    var fixtureName = fixtureNameFromUrl(params);
    if (fixtureName) {
      // GitHub Pages のサブパス(/yadotabi/)でも動くよう相対パスで読む
      fetch('fixtures/' + fixtureName + '.json')
        .then(function (res) {
          if (!res.ok) throw new Error('fixture ' + res.status);
          return res.json();
        })
        .then(function (json) {
          if (!json || !json.meta) throw new Error('fixture broken');
          YadoGeo.setFixture(json);
          // ?hotel= が同時にあるならそちらの座標を優先する(fixture はデータ源だけ差し替える)
          var hotel = hotelFromUrl(params) || {
            id: 'fixture/' + fixtureName,
            name: '草津温泉(固定データ)',
            lat: json.meta.lat,
            lon: json.meta.lon
          };
          selectHotel(hotel);
        })
        .catch(function () {
          // 読めなければ黙って通常動作へ。画面は絶対に空白にしない。
          applyNormalEntryPoint(params);
        });
      return;
    }

    applyNormalEntryPoint(params);
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
      YadoGeo.suggestHotels(q).then(function (results) {
        if (!results.length || state.view !== 'select') return;
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

  function bindEvents() {
    // --- 検索欄 ---
    els.searchInput.addEventListener('input', function () {
      runSuggest(els.searchInput.value);
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

    // 候補の外をタップしたら閉じる(候補内のタップより後に走らないよう mousedown は使わない)
    document.addEventListener('click', function (e) {
      if (els.suggest.hidden) return;
      if (els.suggest.contains(e.target) || e.target === els.searchInput) return;
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
      flyTo(area.lat, area.lon, DEFAULT_VIEW.zoom);
    });

    // --- 状態B ---
    els.backBtn.addEventListener('click', goBack);

    els.feedList.addEventListener('click', function (e) {
      // リンクのタップは素通しする(地図を動かさない)
      if (e.target.closest('a')) return;
      var article = e.target.closest('.feedcard');
      if (!article || article.classList.contains('feedcard--skeleton')) return;
      var card = state.cards[Number(article.dataset.index)];
      if (!card || !feedMap) return;
      feedMap.panTo([card.lat, card.lon]);
      els.feedMap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function init() {
    els = {
      viewSelect: document.getElementById('view-select'),
      viewFeed: document.getElementById('view-feed'),
      searchInput: document.getElementById('search-input'),
      suggest: document.getElementById('suggest-list'),
      chips: document.getElementById('area-chips'),
      map: document.getElementById('map'),
      mapNote: document.getElementById('map-note'),
      backBtn: document.getElementById('back-btn'),
      feedTitle: document.getElementById('feed-title'),
      feedMap: document.getElementById('feed-map'),
      feedStatus: document.getElementById('feed-status'),
      feedList: document.getElementById('feed-list'),
      feedFar: document.getElementById('feed-far')
    };

    renderChips();
    bindEvents();
    ensureMap();
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
    getMap: function () { return map; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
