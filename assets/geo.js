/**
 * やどたび v0 - ジオコーディング / 周辺スポット取得 / 人気度推定
 *
 * 外部API:
 *   - Nominatim (OpenStreetMap): ホテル名・住所 → 緯度経度
 *   - Overpass API (OpenStreetMap): 周辺の観光スポット取得
 *   - Wikidata API: サイトリンク数(何言語版のWikipediaに記事があるか)
 *   - Wikimedia REST API: 日本語版Wikipediaの月間ページビュー
 * いずれもAPIキー不要・CORS対応・無料。利用規約に配慮し、リクエストは
 * ユーザー操作起点でのみ発行する(1回/秒を超えない想定)。取得結果は
 * localStorage(window.YadoCache)にキャッシュして再取得を避ける。
 *
 * window.YadoGeo / window.YadoCache として公開する。
 */
(function (global) {
  'use strict';

  var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
  var OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  var WIKIDATA_URL = 'https://www.wikidata.org/w/api.php';
  var PAGEVIEWS_URL = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ja.wikipedia/all-access/user/';

  // fetchのタイムアウト(ms)。Overpassは重いクエリだと時間がかかるため長めに取る。
  var TIMEOUT_GEOCODE_MS = 15000;
  var TIMEOUT_OVERPASS_MS = 60000;
  var TIMEOUT_FAME_MS = 12000;

  // キャッシュTTL(ms)
  var DAY_MS = 24 * 60 * 60 * 1000;
  var TTL_GEOCODE_MS = 30 * DAY_MS;
  var TTL_SPOTS_MS = 7 * DAY_MS;
  var TTL_FAME_MS = 7 * DAY_MS;

  // Wikidata wbgetentities は1リクエストあたり50IDまで
  var WIKIDATA_BATCH_SIZE = 50;
  // ページビューは1スポット1リクエストになるため、近い順に上限を設ける
  var PAGEVIEWS_MAX = 12;

  // ---------------------------------------------------------------------------
  // キャッシュ層 (window.YadoCache)
  // ---------------------------------------------------------------------------

  var CACHE_PREFIX = 'yado.cache.';

  /**
   * localStorageを取得する。プライベートブラウジングやストレージ無効環境では
   * アクセス自体が例外を投げるため、その場合は null を返して全体を no-op にする。
   */
  function getStore() {
    var s;
    try {
      s = global.localStorage;
      if (!s) return null;
    } catch (e) {
      return null; // アクセスした瞬間に例外を投げる環境(ストレージ無効など)
    }

    try {
      // 参照できても書けない環境があるので実際に触って確認する
      var probe = CACHE_PREFIX + '__probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      // 容量超過は「書けない」のではなく「今は空きが無い」だけ。ここで null を返すと
      // cacheSet の退避処理まで到達できず、二度と書けなくなるのでストアを返す。
      if (isQuotaError(e)) return s;
      return null;
    }
  }

  /** QuotaExceededError かどうか。ブラウザによって name / code が異なる。 */
  function isQuotaError(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || // Firefox
      e.code === 22 || e.code === 1014;
  }

  /** キャッシュから値を取り出す。未登録・期限切れ・壊れたJSONはすべて null。 */
  function cacheGet(key) {
    var store = getStore();
    if (!store) return null;
    var full = CACHE_PREFIX + key;
    var raw;
    try {
      raw = store.getItem(full);
    } catch (e) {
      return null;
    }
    if (raw == null) return null;

    var entry;
    try {
      entry = JSON.parse(raw);
    } catch (e) {
      // 壊れたエントリは掃除しておく
      try { store.removeItem(full); } catch (e2) { /* 無視 */ }
      return null;
    }

    if (!entry || typeof entry !== 'object' || typeof entry.exp !== 'number') return null;
    if (entry.exp <= Date.now()) {
      try { store.removeItem(full); } catch (e3) { /* 無視 */ }
      return null;
    }
    return entry.v;
  }

  /** 古い(expが小さい)エントリを count 件削除して容量を空ける。 */
  function evictOldest(store, count) {
    var entries = [];
    try {
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        if (!k || k.indexOf(CACHE_PREFIX) !== 0) continue;
        if (k === CACHE_PREFIX + '__probe__') continue;
        var exp = 0;
        try {
          var parsed = JSON.parse(store.getItem(k));
          exp = (parsed && typeof parsed.exp === 'number') ? parsed.exp : 0;
        } catch (e) {
          exp = 0; // 壊れているものは最優先で捨てる
        }
        entries.push({ key: k, exp: exp });
      }
    } catch (e) {
      return;
    }
    entries.sort(function (a, b) { return a.exp - b.exp; });
    entries.slice(0, count).forEach(function (e) {
      try { store.removeItem(e.key); } catch (err) { /* 無視 */ }
    });
  }

  /**
   * キャッシュに値を保存する。容量超過(QuotaExceededError)時は古いエントリを
   * いくつか捨てて1回だけ再試行し、それでも失敗したら黙って諦める。
   * キャッシュはあくまで高速化のためのものなので、失敗してもアプリは動き続ける。
   */
  function cacheSet(key, value, ttlMs) {
    var store = getStore();
    if (!store) return;
    var full = CACHE_PREFIX + key;
    var payload;
    try {
      payload = JSON.stringify({ exp: Date.now() + ttlMs, v: value });
    } catch (e) {
      return; // 循環参照など、そもそもシリアライズできない値
    }

    try {
      store.setItem(full, payload);
      return;
    } catch (e) {
      evictOldest(store, 5);
    }
    try {
      store.setItem(full, payload);
    } catch (e) {
      // 諦める
    }
  }

  /** やどたびが保存したキャッシュをすべて削除する。 */
  function cacheClear() {
    var store = getStore();
    if (!store) return;
    var keys = [];
    try {
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        if (k && k.indexOf(CACHE_PREFIX) === 0) keys.push(k);
      }
    } catch (e) {
      return;
    }
    keys.forEach(function (k) {
      try { store.removeItem(k); } catch (err) { /* 無視 */ }
    });
  }

  /** カテゴリ判定表: OSMタグ → 内部カテゴリ。上から順に評価する。 */
  var CATEGORY_RULES = [
    { key: 'tourism', value: 'theme_park', category: 'theme_park' },
    { key: 'tourism', value: 'museum', category: 'museum' },
    { key: 'tourism', value: 'gallery', category: 'museum' },
    { key: 'tourism', value: 'zoo', category: 'zoo' },
    { key: 'tourism', value: 'aquarium', category: 'aquarium' },
    { key: 'tourism', value: 'viewpoint', category: 'viewpoint' },
    { key: 'tourism', value: 'attraction', category: 'attraction' },
    { key: 'historic', value: 'castle', category: 'castle' },
    { key: 'historic', value: 'monument', category: 'monument' },
    { key: 'historic', value: 'memorial', category: 'memorial' },
    { key: 'historic', value: 'ruins', category: 'ruins' },
    { key: 'leisure', value: 'garden', category: 'garden' },
    { key: 'leisure', value: 'park', category: 'park' },
    { key: 'amenity', value: 'place_of_worship', category: 'place_of_worship' }
  ];

  /** カテゴリ → 画面表示用の日本語ラベル */
  var CATEGORY_LABELS = {
    theme_park: 'テーマパーク',
    museum: '美術館・博物館',
    zoo: '動物園',
    aquarium: '水族館',
    viewpoint: '展望・景観',
    attraction: '観光名所',
    castle: '城・城跡',
    monument: '記念建造物',
    memorial: '記念碑',
    ruins: '遺跡',
    garden: '庭園',
    park: '公園',
    place_of_worship: '神社・寺院',
    other: 'スポット'
  };

  /**
   * ハーバーサイン距離(メートル)。
   * 地球を半径6371kmの球とみなす概算。数km〜数十kmの範囲では十分な精度。
   */
  function haversineM(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLon = (lon2 - lon1) * toRad;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /** タイムアウト付きfetch。中断時は分かりやすい日本語Errorにして投げ直す。 */
  async function fetchWithTimeout(url, options, timeoutMs, timeoutMessage) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } catch (e) {
      if (e && e.name === 'AbortError') {
        throw new Error(timeoutMessage);
      }
      throw new Error('通信に失敗しました。ネットワーク接続を確認してもう一度お試しください。');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * ホテル名・住所から候補地点を検索する(国内限定)。
   * @param {string} query ホテル名または住所
   * @returns {Promise<Array<{name:string,lat:number,lon:number,displayName:string}>>}
   *          見つからない場合は空配列
   */
  async function geocodeHotel(query) {
    var q = (query || '').trim();
    if (!q) return [];

    // 全角空白や連続空白の違いで別キー扱いにならないよう正規化する
    var cacheKey = 'geo:' + q.replace(/[\s　]+/g, ' ').toLowerCase();
    var cached = cacheGet(cacheKey);
    if (cached) return cached;

    var params = new URLSearchParams({
      q: q,
      format: 'jsonv2',
      countrycodes: 'jp',
      limit: '5',
      'accept-language': 'ja'
    });

    var res = await fetchWithTimeout(
      NOMINATIM_URL + '?' + params.toString(),
      { method: 'GET', headers: { Accept: 'application/json' } },
      TIMEOUT_GEOCODE_MS,
      '場所の検索に時間がかかりすぎました。もう一度お試しください。'
    );

    if (!res.ok) {
      throw new Error('場所の検索に失敗しました(エラー' + res.status + ')。しばらく待ってからお試しください。');
    }

    var data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('場所の検索結果を読み取れませんでした。もう一度お試しください。');
    }

    if (!Array.isArray(data)) return [];

    var results = data
      .filter(function (item) {
        return item && item.lat && item.lon;
      })
      .map(function (item) {
        var display = item.display_name || '';
        // display_nameは「◯◯ホテル, ◯◯町, ◯◯市, ...」形式。先頭要素を短い名前として使う。
        var shortName = item.name || display.split(',')[0] || q;
        return {
          name: shortName.trim(),
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          displayName: display
        };
      })
      .filter(function (item) {
        return isFinite(item.lat) && isFinite(item.lon);
      });

    // 0件は「そのうち登録されるかも」なのでキャッシュしない
    if (results.length) cacheSet(cacheKey, results, TTL_GEOCODE_MS);
    return results;
  }

  /** Overpass QLを組み立てる。node/way/relation全部を対象にし、way/relationはcenterを取る。 */
  function buildOverpassQuery(lat, lon, radiusM) {
    var around = '(around:' + Math.round(radiusM) + ',' + lat + ',' + lon + ')';
    var clauses = [
      '["tourism"~"^(attraction|museum|viewpoint|zoo|aquarium|theme_park|gallery)$"]',
      '["historic"~"^(castle|monument|memorial|ruins)$"]',
      '["leisure"~"^(park|garden)$"]',
      '["amenity"="place_of_worship"]["name"]'
    ];

    var body = '';
    clauses.forEach(function (clause) {
      ['node', 'way', 'relation'].forEach(function (type) {
        body += '  ' + type + clause + around + ';\n';
      });
    });

    return '[out:json][timeout:50];\n(\n' + body + ');\nout center tags;\n';
  }

  /** OSMのtagsから内部カテゴリを判定する。該当なしは 'other'。 */
  function detectCategory(tags) {
    for (var i = 0; i < CATEGORY_RULES.length; i++) {
      var rule = CATEGORY_RULES[i];
      if (tags[rule.key] === rule.value) return rule.category;
    }
    return 'other';
  }

  /**
   * Wikipediaに項目があるか(=一定の知名度があるか)を判定する。
   * OSMでは wikipedia / wikidata / wikipedia:ja などのタグで紐づけられている。
   */
  function detectWikipedia(tags) {
    if (tags.wikipedia || tags.wikidata) return true;
    for (var key in tags) {
      if (Object.prototype.hasOwnProperty.call(tags, key) && key.indexOf('wikipedia') === 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * OSMの wikipedia タグから日本語版Wikipediaの記事タイトルを取り出す。
   * タグは "ja:草津温泉" のように「言語コード:記事名」形式。日本語版の記事が
   * 紐づいていない場合(例 "en:Kusatsu")はページビューを引けないので null。
   * ※ name:ja は表示名であって記事タイトルではないため使わない。
   */
  function pickWikipediaTitle(tags) {
    // "wikipedia:ja" タグは値がそのまま記事名(言語プレフィックス無し)
    var direct = tags['wikipedia:ja'];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    var raw = tags.wikipedia;
    if (typeof raw !== 'string') return null;
    raw = raw.trim();
    if (!raw) return null;

    var sep = raw.indexOf(':');
    if (sep === -1) return null; // 言語プレフィックスが無いものは言語不明なので扱わない
    var lang = raw.slice(0, sep).trim().toLowerCase();
    var title = raw.slice(sep + 1).trim();
    if (lang !== 'ja' || !title) return null;
    return title;
  }

  /** OSMの wikidata タグ(Q番号)を取り出す。形式が違うものは null。 */
  function pickWikidataId(tags) {
    var raw = tags.wikidata;
    if (typeof raw !== 'string') return null;
    raw = raw.trim();
    return /^Q\d+$/.test(raw) ? raw : null;
  }

  /** 公式サイトURL。website を優先し、無ければ contact:website を使う。 */
  function pickWebsite(tags) {
    var raw = tags.website || tags['contact:website'];
    if (typeof raw !== 'string') return null;
    raw = raw.trim();
    return raw || null;
  }

  /** 営業時間(opening_hours)。OSMの独自記法のまま返す。 */
  function pickOpeningHours(tags) {
    var raw = tags.opening_hours;
    if (typeof raw !== 'string') return null;
    raw = raw.trim();
    return raw || null;
  }

  /** 日本語名を優先して取り出す。name:ja があればそれを、無ければ name を使う。 */
  function pickName(tags) {
    var name = tags['name:ja'] || tags.name || '';
    return name.trim();
  }

  /**
   * ホテル周辺の観光スポットを取得する。
   * @param {number} lat ホテルの緯度
   * @param {number} lon ホテルの経度
   * @param {number} radiusM 検索半径(メートル)
   * @returns {Promise<Array>} Spot配列(距離の近い順)
   */
  async function fetchSpots(lat, lon, radiusM) {
    if (!isFinite(lat) || !isFinite(lon)) {
      throw new Error('ホテルの位置情報が正しくありません。もう一度検索してください。');
    }
    var radius = isFinite(radiusM) && radiusM > 0 ? radiusM : 5000;

    // 緯度経度は小数3桁(約100m)に丸めてキー化する。ホテルの位置が少し違っても
    // 同じ商圏なら同じ結果になるため、キャッシュヒット率を上げられる。
    var cacheKey = 'spots:' + lat.toFixed(3) + ',' + lon.toFixed(3) + ':' + radius;
    var cached = cacheGet(cacheKey);
    if (cached) return cached;

    var query = buildOverpassQuery(lat, lon, radius);

    var res = await fetchWithTimeout(
      OVERPASS_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      },
      TIMEOUT_OVERPASS_MS,
      'スポットの取得に時間がかかりすぎました。範囲を狭めるか、少し待ってからお試しください。'
    );

    if (res.status === 429 || res.status === 504) {
      throw new Error('地図サーバーが混雑しています。1分ほど待ってからもう一度お試しください。');
    }
    if (!res.ok) {
      throw new Error('スポットの取得に失敗しました(エラー' + res.status + ')。しばらく待ってからお試しください。');
    }

    var data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('スポット情報を読み取れませんでした。もう一度お試しください。');
    }

    var elements = (data && data.elements) || [];
    var seen = Object.create(null);
    var spots = [];

    elements.forEach(function (el) {
      var tags = el.tags || {};
      var name = pickName(tags);
      if (!name) return; // 名前のないスポットは提案しても意味がないので除外

      // way/relation は中心座標(center)を使う
      var elLat = el.lat != null ? el.lat : (el.center && el.center.lat);
      var elLon = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (elLat == null || elLon == null) return;

      // 同一スポットが node と way の両方で登録されているケースを名前で重複排除する
      var dedupeKey = name + '@' + elLat.toFixed(3) + ',' + elLon.toFixed(3);
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;

      var category = detectCategory(tags);
      spots.push({
        id: el.type + '/' + el.id,
        name: name,
        lat: elLat,
        lon: elLon,
        category: category,
        categoryLabel: CATEGORY_LABELS[category] || CATEGORY_LABELS.other,
        hasWikipedia: detectWikipedia(tags),
        distanceM: haversineM(lat, lon, elLat, elLon),
        // 人気度推定(enrichFame)や詳細表示で使う生タグ由来の情報
        wikipediaTitle: pickWikipediaTitle(tags),
        wikidataId: pickWikidataId(tags),
        website: pickWebsite(tags),
        openingHours: pickOpeningHours(tags),
        // enrichFame が埋める。未取得・取得失敗はいずれも null のまま。
        fame: { sitelinks: null, monthlyViews: null }
      });
    });

    spots.sort(function (a, b) { return a.distanceM - b.distanceM; });
    cacheSet(cacheKey, spots, TTL_SPOTS_MS);
    return spots;
  }

  // ---------------------------------------------------------------------------
  // 人気度推定 (enrichFame)
  // ---------------------------------------------------------------------------

  function pad2(n) {
    var s = String(n);
    return s.length < 2 ? '0' + s : s;
  }

  /**
   * 先月の期間を {start, end} (YYYYMMDD) で返す。
   * ページビューAPIの monthly は「まるまる1ヶ月が収まる範囲」を要求するため、
   * 開始=先月1日 / 終了=先月末日 にする。開始=終了だと 400 "no full months between dates" になる。
   */
  function lastMonthRange() {
    var now = new Date();
    // 月を1つ戻す。Dateは月が-1になると自動で前年12月に繰り下がる。
    var d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var y = d.getFullYear();
    var m = d.getMonth(); // 0始まり
    // 翌月0日 = その月の末日
    var lastDay = new Date(y, m + 1, 0).getDate();
    var ym = String(y) + pad2(m + 1);
    return { start: ym + '01', end: ym + pad2(lastDay) };
  }

  /** 配列を size 件ずつに分割する。 */
  function chunk(arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  /** キャッシュに残っている人気度を先に反映し、まだ引く必要があるスポットだけ返す。 */
  function applyFameCache(spots, keyOf, field) {
    var pending = [];
    spots.forEach(function (spot) {
      var key = keyOf(spot);
      if (!key) return;
      var cached = cacheGet('fame:' + key);
      if (cached && typeof cached[field] === 'number') {
        spot.fame[field] = cached[field];
        return;
      }
      pending.push(spot);
    });
    return pending;
  }

  /** 取得済みの値をキャッシュに書き戻す(sitelinks と monthlyViews を同じキーにマージ)。 */
  function saveFameCache(key, patch) {
    if (!key) return;
    var existing = cacheGet('fame:' + key) || {};
    cacheSet('fame:' + key, Object.assign({}, existing, patch), TTL_FAME_MS);
  }

  /**
   * Wikidataのサイトリンク数(=何言語版のWikipediaに記事があるか)を取得する。
   * 多言語で記事があるほど国際的に有名なスポット、という近似指標に使う。
   */
  async function fetchSitelinks(spots) {
    var pending = applyFameCache(spots, function (s) { return s.wikidataId; }, 'sitelinks');
    var targets = pending.filter(function (s) { return s.wikidataId; });
    if (!targets.length) return;

    // 同じQ番号が複数スポットに付くことがあるのでID単位にまとめる
    var byId = Object.create(null);
    targets.forEach(function (s) {
      if (!byId[s.wikidataId]) byId[s.wikidataId] = [];
      byId[s.wikidataId].push(s);
    });
    var ids = Object.keys(byId);

    var batches = chunk(ids, WIKIDATA_BATCH_SIZE).map(async function (batch) {
      var params = new URLSearchParams({
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'sitelinks',
        format: 'json',
        origin: '*'
      });
      var res = await fetchWithTimeout(
        WIKIDATA_URL + '?' + params.toString(),
        { method: 'GET', headers: { Accept: 'application/json' } },
        TIMEOUT_FAME_MS,
        'Wikidataの取得がタイムアウトしました。'
      );
      if (!res.ok) throw new Error('wikidata ' + res.status);
      var data = await res.json();
      var entities = (data && data.entities) || {};

      batch.forEach(function (id) {
        var entity = entities[id];
        if (!entity || !entity.sitelinks) return;
        var count = Object.keys(entity.sitelinks).length;
        byId[id].forEach(function (s) { s.fame.sitelinks = count; });
        saveFameCache(id, { sitelinks: count });
      });
    });

    // 一部のバッチが失敗しても他の結果は活かす
    await Promise.allSettled(batches);
  }

  /**
   * 日本語版Wikipediaの先月の月間ページビューを取得する。
   * 1スポット1リクエストになるので、ホテルから近い順に PAGEVIEWS_MAX 件までに絞る。
   */
  async function fetchPageviews(spots) {
    var pending = applyFameCache(spots, function (s) { return s.wikipediaTitle; }, 'monthlyViews');
    var targets = pending
      .filter(function (s) { return s.wikipediaTitle; })
      .sort(function (a, b) { return a.distanceM - b.distanceM; })
      .slice(0, PAGEVIEWS_MAX);
    if (!targets.length) return;

    var range = lastMonthRange();

    var tasks = targets.map(async function (spot) {
      // 記事タイトルの空白はアンダースコアに置き換えるのがAPIの仕様
      var title = encodeURIComponent(spot.wikipediaTitle.replace(/ /g, '_'));
      var url = PAGEVIEWS_URL + title + '/monthly/' + range.start + '/' + range.end;

      var res = await fetchWithTimeout(
        url,
        { method: 'GET', headers: { Accept: 'application/json' } },
        TIMEOUT_FAME_MS,
        'ページビューの取得がタイムアウトしました。'
      );

      // 404は「その記事に閲覧記録が無い/記事が存在しない」なので0扱いにする
      if (res.status === 404) {
        spot.fame.monthlyViews = 0;
        saveFameCache(spot.wikipediaTitle, { monthlyViews: 0 });
        return;
      }
      if (!res.ok) throw new Error('pageviews ' + res.status);

      var data = await res.json();
      var items = (data && data.items) || [];
      if (!items.length || typeof items[0].views !== 'number') return;

      spot.fame.monthlyViews = items[0].views;
      saveFameCache(spot.wikipediaTitle, { monthlyViews: items[0].views });
    });

    await Promise.allSettled(tasks);
  }

  /**
   * スポットに人気度(fame)を付与する。渡された配列をその場で書き換えて返す。
   * ネットワークが全滅しても例外は投げず、取れなかった項目は null のままにする。
   * (人気度は「定番/穴場」の判定材料であって、無くても提案自体は成立するため)
   * @param {Array} spots fetchSpots の結果
   * @returns {Promise<Array>} 同じ配列
   */
  async function enrichFame(spots) {
    if (!Array.isArray(spots) || !spots.length) return spots || [];

    // 古いキャッシュ由来のスポットには fame が無いことがあるので補う
    spots.forEach(function (s) {
      if (!s.fame) s.fame = { sitelinks: null, monthlyViews: null };
    });

    await Promise.allSettled([fetchSitelinks(spots), fetchPageviews(spots)]);
    return spots;
  }

  global.YadoCache = {
    get: cacheGet,
    set: cacheSet,
    clear: cacheClear
  };

  global.YadoGeo = {
    geocodeHotel: geocodeHotel,
    fetchSpots: fetchSpots,
    enrichFame: enrichFame,
    // プラン生成側や画面側でも使えるように距離計算とラベル表を公開しておく
    haversineM: haversineM,
    CATEGORY_LABELS: CATEGORY_LABELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
