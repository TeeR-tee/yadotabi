/**
 * やどたび v0 - ジオコーディング / 周辺スポット取得 / 人気度推定
 *
 * 外部API:
 *   - Nominatim (OpenStreetMap): ホテル名・住所 → 緯度経度 / 打鍵ごとの宿候補
 *   - Overpass API (OpenStreetMap): 周辺の観光スポット取得 / 表示範囲内の宿取得
 *   - 日本語版Wikipedia API: 座標の近くにある記事(写真・要約つき)
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
  var WIKIPEDIA_API_URL = 'https://ja.wikipedia.org/w/api.php';

  // fetchのタイムアウト(ms)。Overpassは重いクエリだと時間がかかるため長めに取る。
  var TIMEOUT_GEOCODE_MS = 15000;
  var TIMEOUT_OVERPASS_MS = 60000;
  var TIMEOUT_FAME_MS = 12000;
  var TIMEOUT_WIKI_NEARBY_MS = 15000;

  // キャッシュTTL(ms)
  var DAY_MS = 24 * 60 * 60 * 1000;
  var HOUR_MS = 60 * 60 * 1000;
  var TTL_GEOCODE_MS = 30 * DAY_MS;
  var TTL_SPOTS_MS = 7 * DAY_MS;
  var TTL_FAME_MS = 7 * DAY_MS;
  // 取得に失敗した/値が無かったものは短めに保持し、毎回の再取得を防ぎつつ復旧も待てるようにする
  var TTL_FAME_TRIED_MS = 1 * DAY_MS;
  var TTL_HOTELS_MS = 7 * DAY_MS;
  var TTL_WIKI_NEARBY_MS = 7 * DAY_MS;
  // 候補0件は「そのうち登録されるかも」なので短期だけ覚えて連打を防ぐ
  var TTL_SUGGEST_EMPTY_MS = 1 * HOUR_MS;

  // Wikidata wbgetentities は1リクエストあたり50IDまで
  var WIKIDATA_BATCH_SIZE = 50;
  // ページビューは1スポット1リクエストになるため、近い順に上限を設ける
  var PAGEVIEWS_MAX = 12;

  // 地図の表示範囲から宿を引くときの上限。これより広いと Overpass に負荷をかけるので呼ばない。
  var BBOX_MAX_DEG = 0.25;
  // 即時候補(suggestHotels)の設定
  var SUGGEST_MIN_CHARS = 2;
  var SUGGEST_LIMIT = 6;
  // Nominatim の利用規約は「1リクエスト/秒まで」。geo.js 側で必ず守る。
  var NOMINATIM_MIN_INTERVAL_MS = 1000;
  // Wikipedia の extracts は1リクエストにつき20ページ分までしか返らないので continue を追う
  var WIKI_NEARBY_MAX_CONTINUE = 3;
  var WIKI_NEARBY_MAX_RADIUS_M = 10000;
  // geosearch は ggslimit=50 が上限で、記事の密な土地では半径10kmを指定しても
  // 近い順に50件(箱根なら約3.7km)で打ち切られる。そこで同じ中心で半径を変えて
  // 3回引き、pageid で重複排除して「遠いが有名な記事」を取りこぼさないようにする。
  var WIKI_NEARBY_RING_RADII_M = [3000, 6000, 10000];
  // 1回の fetchWikiNearby が発行する外部リクエストの総上限(無料APIのマナー)。
  // 半径3段(1周目)+ continue 最大3回(2周目)。continue もこの数に含めて数える。
  // 4 にすると continue が1回しか追えず、要約(extract)の付かないカードが増えるため 6。
  var WIKI_NEARBY_MAX_CALLS = 6;

  // ---------------------------------------------------------------------------
  // 固定データモード (fixture)
  //
  // `?fixture=kusatsu` で起動すると、app.js が fixtures/*.json を読んで setFixture する。
  // 保持するのは Overpass / Wikipedia の「生レスポンス」で、整形は既存のコードを
  // そのまま通す(重複実装しない)。fixture 中は外部APIを一切叩かない。
  // 生成は `node scripts/make-fixture.mjs`。
  // ---------------------------------------------------------------------------

  var fixtureData = null;              // 読み込み済みの fixture(生レスポンス形)
  function setFixture(data) { fixtureData = data; }

  // `?simulate=overpass504` 用。真のあいだ Overpass へのリクエストは実際には飛ばさず、
  // 常に「混雑(504)」として失敗させる。混雑時の画面を外部APIを叩かずに撮影・検証するため。
  var simulateBusy = false;
  function setSimulateBusy(v) { simulateBusy = !!v; }

  // Overpass が混雑(429/504)していたときに待つ時間(ms)。再試行は1回だけ。
  var OVERPASS_RETRY_WAIT_MS = 3000;

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
    { key: 'tourism', value: 'picnic_site', category: 'picnic_site' },
    { key: 'tourism', value: 'attraction', category: 'attraction' },
    { key: 'historic', value: 'castle', category: 'castle' },
    { key: 'historic', value: 'monument', category: 'monument' },
    { key: 'historic', value: 'memorial', category: 'memorial' },
    { key: 'historic', value: 'ruins', category: 'ruins' },
    { key: 'leisure', value: 'garden', category: 'garden' },
    { key: 'leisure', value: 'park', category: 'park' },
    { key: 'amenity', value: 'place_of_worship', category: 'place_of_worship' },
    { key: 'amenity', value: 'public_bath', category: 'public_bath' },
    { key: 'natural', value: 'waterfall', category: 'waterfall' },
    { key: 'natural', value: 'spring', category: 'spring' },
    { key: 'natural', value: 'hot_spring', category: 'hot_spring' },
    { key: 'natural', value: 'cave_entrance', category: 'cave' },
    { key: 'natural', value: 'peak', category: 'peak' },
    { key: 'man_made', value: 'lighthouse', category: 'lighthouse' }
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
    public_bath: '共同浴場',
    waterfall: '滝',
    spring: '湧水',
    hot_spring: '温泉源',
    cave: '洞窟',
    peak: '山頂',
    picnic_site: '展望地',
    lighthouse: '灯台',
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

  /** 検索語を正規化する。全角空白や連続空白の違いで別キー扱いにならないようにする。 */
  function normalizeQuery(q) {
    return q.replace(/[\s　]+/g, ' ').trim().toLowerCase();
  }

  // --- Nominatim の利用マナー(1リクエスト/秒以下)を守るための簡易スロットル ---
  // 「打つそばから候補」は入力のたびに呼ばれうるので、待ち行列を1本にして間隔を空ける。
  var nominatimChain = Promise.resolve();
  var nominatimLastAt = 0;

  /** ms ミリ秒待つ。 */
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Nominatim へのリクエストを直列化し、直前の呼び出しから1秒未満なら待ってから送る。
   * @param {function():Promise<any>} task 実際の fetch を行う関数
   */
  function throttleNominatim(task) {
    var run = nominatimChain.then(async function () {
      var wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - nominatimLastAt);
      if (wait > 0) await delay(wait);
      nominatimLastAt = Date.now();
      return task();
    });
    // 失敗しても後続のリクエストが止まらないように、鎖は解決済みに戻しておく
    nominatimChain = run.then(function () { }, function () { });
    return run;
  }

  /**
   * Nominatim /search を呼び、生のJSON配列を返す。geocodeHotel と suggestHotels で共通。
   * @param {string} q 検索語
   * @param {number} limit 最大件数
   */
  async function searchNominatim(q, limit) {
    var params = new URLSearchParams({
      q: q,
      format: 'jsonv2',
      countrycodes: 'jp',
      limit: String(limit),
      'accept-language': 'ja'
    });

    var res = await throttleNominatim(function () {
      return fetchWithTimeout(
        NOMINATIM_URL + '?' + params.toString(),
        { method: 'GET', headers: { Accept: 'application/json' } },
        TIMEOUT_GEOCODE_MS,
        '場所の検索に時間がかかりすぎました。もう一度お試しください。'
      );
    });

    if (!res.ok) {
      throw new Error('場所の検索に失敗しました(エラー' + res.status + ')。しばらく待ってからお試しください。');
    }

    var data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('場所の検索結果を読み取れませんでした。もう一度お試しください。');
    }

    return Array.isArray(data) ? data : [];
  }

  /** Nominatim の1件から短い名前を取り出す。display_name は「◯◯ホテル, ◯◯町, ...」形式。 */
  function pickNominatimName(item, fallback) {
    var display = item.display_name || '';
    var shortName = item.name || display.split(',')[0] || fallback;
    return String(shortName).trim();
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

    var cacheKey = 'geo:' + normalizeQuery(q);
    var cached = cacheGet(cacheKey);
    if (cached) return cached;

    var data = await searchNominatim(q, 5);

    var results = data
      .filter(function (item) {
        return item && item.lat && item.lon;
      })
      .map(function (item) {
        return {
          name: pickNominatimName(item, q),
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          displayName: item.display_name || ''
        };
      })
      .filter(function (item) {
        return isFinite(item.lat) && isFinite(item.lon);
      });

    // 0件は「そのうち登録されるかも」なのでキャッシュしない
    if (results.length) cacheSet(cacheKey, results, TTL_GEOCODE_MS);
    return results;
  }

  // ---------------------------------------------------------------------------
  // 即時の宿候補 (suggestHotels)
  // ---------------------------------------------------------------------------

  /**
   * Nominatim の分類(jsonv2 の category / json の class と type)から宿の種別を推定する。
   * 宿でなさそうなものは null。
   * OSMの tourism=hotel には旅館も多く含まれるため、名前で旅館・温泉宿に寄せる。
   */
  function detectHotelKind(cls, type, name) {
    var kind = null;
    if (cls === 'tourism' && /^(hotel|guest_house|hostel|motel)$/.test(type)) kind = type;
    if (!kind && cls === 'building' && /^(hotel)$/.test(type)) kind = 'hotel';
    if (!kind) return null;
    if (/旅館|温泉/.test(name || '')) return 'ryokan';
    return kind;
  }

  // 同じ query の連続呼び出しを1つにまとめるための在庫(打鍵のたびに同じ語が飛んでくる)
  var suggestInflight = Object.create(null);

  /**
   * 打つそばから出す宿の候補を取得する(最大6件)。
   * @param {string} query 入力中の文字列
   * @returns {Promise<Array<{id:string,name:string,lat:number,lon:number,kind:string,displayName:string}>>}
   *          2文字未満のときはAPIを呼ばずに空配列
   */
  async function suggestHotels(query) {
    var q = (query || '').trim();
    // 短すぎる語は候補が絞れずAPIにも負荷なので、そもそも呼ばない
    if (q.length < SUGGEST_MIN_CHARS) return [];

    var norm = normalizeQuery(q);
    var cacheKey = 'suggest:' + norm;
    var cached = cacheGet(cacheKey);
    if (cached) return cached;

    // 同じ語のリクエストが飛んでいる最中なら、それに相乗りする
    if (suggestInflight[norm]) return suggestInflight[norm];

    var task = (async function () {
      var data = await searchNominatim(q, SUGGEST_LIMIT);

      var results = [];
      data.forEach(function (item) {
        if (!item || !item.lat || !item.lon) return;
        var lat = parseFloat(item.lat);
        var lon = parseFloat(item.lon);
        if (!isFinite(lat) || !isFinite(lon)) return;

        var name = pickNominatimName(item, q);
        if (!name) return;

        // jsonv2 は分類を category、jsonは class という名前で返す。どちらでも拾えるようにする。
        var cls = item.category || item.class;

        results.push({
          id: 'nominatim/' + (item.osm_type || 'node') + '/' + (item.osm_id != null ? item.osm_id : name),
          name: name,
          lat: lat,
          lon: lon,
          // 宿と判定できなければ地名・施設として扱う(地図を寄せる用途には使える)
          kind: detectHotelKind(cls, item.type, name) || 'place',
          displayName: item.display_name || ''
        });
      });

      results = results.slice(0, SUGGEST_LIMIT);
      // 0件も短期だけ覚えて、同じ語での連打がそのままAPIに流れないようにする
      cacheSet(cacheKey, results, results.length ? TTL_GEOCODE_MS : TTL_SUGGEST_EMPTY_MS);
      return results;
    })();

    suggestInflight[norm] = task;
    try {
      return await task;
    } finally {
      delete suggestInflight[norm];
    }
  }

  /**
   * Overpass QLを組み立てる。node/way/relation全部を対象にし、way/relationはcenterを取る。
   *
   * 重要: 各条件は node/way/relation を個別に書かず nwr(= 3種まとめて)を使う。
   * Overpass は文ごとに範囲検索をやり直すため、7条件×3種=21文に展開すると
   * 同じ範囲を21回走査して50秒の実行上限を超える(実測: 21文で44秒〜タイムアウト、
   * nwr 6文なら5秒前後)。amenity は place_of_worship と public_bath を
   * 1つの正規表現にまとめ、文の数自体も減らしている。
   */
  function buildOverpassQuery(lat, lon, radiusM) {
    var around = '(around:' + Math.round(radiusM) + ',' + lat + ',' + lon + ')';
    var clauses = [
      '["tourism"~"^(attraction|museum|viewpoint|zoo|aquarium|theme_park|gallery|picnic_site)$"]',
      '["historic"~"^(castle|monument|memorial|ruins)$"]',
      '["leisure"~"^(park|garden)$"]',
      // 名前のない礼拝所・浴場は提案にならないので name 必須で絞る
      '["amenity"~"^(place_of_worship|public_bath)$"]["name"]',
      // 自然物は無名のものが大量にあるため name 必須で絞る
      '["natural"~"^(waterfall|spring|hot_spring|cave_entrance|peak)$"]["name"]',
      '["man_made"="lighthouse"]'
    ];

    var body = '';
    clauses.forEach(function (clause) {
      body += '  nwr' + clause + around + ';\n';
    });

    return '[out:json][timeout:90];\n(\n' + body + ');\nout center tags;\n';
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

  /** 混雑(429/504)を表す Error を作る。呼び出し側は overpassBusy で判別する。 */
  function busyError() {
    var err = new Error('地図サーバーが混雑しています。1分ほど待ってからもう一度お試しください。');
    err.overpassBusy = true;
    return err;
  }

  /**
   * Overpass に1回だけ問い合わせて JSON を返す。
   * 混雑(429/504)のときだけ overpassBusy を立てた Error を投げる。リトライはしない
   * (再試行するかどうかは呼び出し側が決める。bbox 側は地図移動のたびに呼ばれるため
   *  無料APIのマナー上リトライしない)。
   * @param {string} query Overpass QL
   * @param {string} timeoutMessage タイムアウト時の日本語メッセージ
   */
  async function requestOverpass(query, timeoutMessage) {
    // 混雑シミュレーション。fetch そのものを行わないので外部APIは一切叩かない。
    if (simulateBusy) throw busyError();

    var res = await fetchWithTimeout(
      OVERPASS_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      },
      TIMEOUT_OVERPASS_MS,
      timeoutMessage
    );

    if (res.status === 429 || res.status === 504) throw busyError();
    if (!res.ok) {
      throw new Error('スポットの取得に失敗しました(エラー' + res.status + ')。しばらく待ってからお試しください。');
    }

    try {
      return await res.json();
    } catch (e) {
      throw new Error('スポット情報を読み取れませんでした。もう一度お試しください。');
    }
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
    // 固定データモードでは localStorage の本物データと混ざらないよう読み書きしない
    if (!fixtureData) {
      var cached = cacheGet(cacheKey);
      if (cached) return cached;
    }

    var data = null;
    // 混雑シミュレーション中は fixture の生データより先に失敗させる。
    // そうしないと「Overpassだけ落ちて Wikipedia は生きている」状態を再現できない。
    if (!simulateBusy && fixtureData && fixtureData.overpass) {
      data = fixtureData.overpass;
    }

    if (!data) {
      var query = buildOverpassQuery(lat, lon, radius);
      var timeoutMsg = 'スポットの取得に時間がかかりすぎました。範囲を狭めるか、少し待ってからお試しください。';

      try {
        data = await requestOverpass(query, timeoutMsg);
      } catch (e) {
        // 混雑のときだけ3秒待って1回だけ再試行する。タイムアウトや通信断は
        // 待っても状況が変わらない(既に60秒待っている)ので再試行しない。
        if (!e || !e.overpassBusy) throw e;
        await delay(OVERPASS_RETRY_WAIT_MS);
        data = await requestOverpass(query, timeoutMsg);
      }
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
    if (!fixtureData) cacheSet(cacheKey, spots, TTL_SPOTS_MS);
    return spots;
  }

  // ---------------------------------------------------------------------------
  // 地図の表示範囲内の宿 (fetchHotelsInBbox)
  // ---------------------------------------------------------------------------

  /**
   * 地図の表示範囲(bbox)にある宿を取得する。地図を動かすたびにピンを打ち直す用途。
   * @param {number} south 南端の緯度
   * @param {number} west 西端の経度
   * @param {number} north 北端の緯度
   * @param {number} east 東端の経度
   * @returns {Promise<Array<{id:string,name:string,lat:number,lon:number,kind:string}>>}
   * @throws {Error} 範囲が広すぎるときは tooWide:true を持つ Error
   */
  async function fetchHotelsInBbox(south, west, north, east) {
    // 固定データモードでは Overpass を叩かない(宿ピンは無しでよい)
    if (fixtureData) return [];
    if (![south, west, north, east].every(function (v) { return isFinite(v); })) {
      throw new Error('地図の表示範囲を読み取れませんでした。もう一度お試しください。');
    }

    // 南北・東西が入れ替わって渡されても動くようにしておく
    var s = Math.min(south, north);
    var n = Math.max(south, north);
    var w = Math.min(west, east);
    var e = Math.max(west, east);

    // 広い範囲を Overpass に投げると宿が数千件返って重いうえサーバーにも迷惑なので、
    // 呼ばずに「ズームしてください」と画面側に伝える。
    if ((n - s) > BBOX_MAX_DEG || (e - w) > BBOX_MAX_DEG) {
      var wide = new Error('地図の範囲が広すぎます。もう少しズームしてください。');
      wide.tooWide = true;
      throw wide;
    }

    var bbox = [s.toFixed(3), w.toFixed(3), n.toFixed(3), e.toFixed(3)].join(',');
    var cacheKey = 'hotels:' + bbox;
    var cached = cacheGet(cacheKey);
    if (cached) return cached;

    // fetchSpots と同じ理由で nwr にまとめる(文を増やすと範囲検索を繰り返して遅くなる)
    var query =
      '[out:json][timeout:90];\n(\n' +
      '  nwr["tourism"~"^(hotel|guest_house|hostel|motel)$"]["name"](' + bbox + ');\n' +
      ');\nout center tags;\n';

    // 地図を動かすたびに呼ばれるので、混雑してもリトライはしない(フラグを立てるだけ)。
    var data = await requestOverpass(query, '宿の取得に時間がかかりすぎました。少し待ってからお試しください。');

    var elements = (data && data.elements) || [];
    var seen = Object.create(null);
    var hotels = [];

    elements.forEach(function (el) {
      var tags = el.tags || {};
      var name = pickName(tags);
      if (!name) return;

      var elLat = el.lat != null ? el.lat : (el.center && el.center.lat);
      var elLon = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (elLat == null || elLon == null) return;

      // 同じ宿が node と way の両方で登録されているケースを名前+座標で重複排除する
      var dedupeKey = name + '@' + elLat.toFixed(3) + ',' + elLon.toFixed(3);
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;

      // 旅館は OSM では tourism=hotel で登録されることが多いので、名前から拾い直す
      var kind = tags.tourism;
      if (/旅館|温泉/.test(name)) kind = 'ryokan';

      hotels.push({
        id: el.type + '/' + el.id,
        name: name,
        lat: elLat,
        lon: elLon,
        kind: kind
      });
    });

    cacheSet(cacheKey, hotels, TTL_HOTELS_MS);
    return hotels;
  }

  // ---------------------------------------------------------------------------
  // Wikipedia の周辺記事 (fetchWikiNearby)
  // ---------------------------------------------------------------------------

  /** Wikipedia API を1回叩いて JSON を返す。429/5xx はリトライせず日本語Errorにする。 */
  async function callWikipediaApi(params) {
    var res = await fetchWithTimeout(
      WIKIPEDIA_API_URL + '?' + params.toString(),
      { method: 'GET', headers: { Accept: 'application/json' } },
      TIMEOUT_WIKI_NEARBY_MS,
      '周辺の記事の取得に時間がかかりすぎました。もう一度お試しください。'
    );

    if (res.status === 429) {
      throw new Error('Wikipediaが混雑しています。少し待ってからもう一度お試しください。');
    }
    if (!res.ok) {
      throw new Error('周辺の記事の取得に失敗しました(エラー' + res.status + ')。しばらく待ってからお試しください。');
    }

    try {
      return await res.json();
    } catch (e) {
      throw new Error('周辺の記事を読み取れませんでした。もう一度お試しください。');
    }
  }

  /**
   * 日本語版Wikipediaの「この座標の近くにある記事」を写真・要約つきで取得する。
   *
   * 注意: extracts(要約)は1リクエストにつき20ページ分までしか返らない(exlimit の上限)。
   * geosearch は50件返せるので、残りは continue を追いかけて埋める。
   * それでも取れなかった extract は null のままにする。
   *
   * さらに geosearch は1回あたり50件が上限なので、記事の密な土地では半径10kmでも
   * 近い順に50件で打ち切られてしまう。そこで同じ中心・異なる半径(3/6/10km)で引いて
   * pageid で重複排除する。外部リクエストは合計 WIKI_NEARBY_MAX_CALLS 回まで。
   *
   * @param {number} lat 中心の緯度
   * @param {number} lon 中心の経度
   * @param {number} radiusM 検索半径(メートル、最大10000)
   * @returns {Promise<Array<{id:string,title:string,lat:number,lon:number,distanceM:number,
   *          thumbnailUrl:(string|null),extract:(string|null),url:string}>>} 距離の近い順
   */
  async function fetchWikiNearby(lat, lon, radiusM) {
    if (!isFinite(lat) || !isFinite(lon)) {
      throw new Error('位置情報が正しくありません。もう一度お試しください。');
    }
    var radius = isFinite(radiusM) && radiusM > 0 ? Math.min(Math.round(radiusM), WIKI_NEARBY_MAX_RADIUS_M) : 5000;

    // fetchSpots と同じく小数3桁(約100m)に丸めてキャッシュヒット率を上げる
    var cacheKey = 'wikinear:' + lat.toFixed(3) + ',' + lon.toFixed(3) + ':' + radius;
    // 固定データモードでは localStorage の本物データと混ざらないよう読み書きしない
    if (!fixtureData) {
      var cached = cacheGet(cacheKey);
      if (cached) return cached;
    }

    function baseParams(r) {
      return {
        action: 'query',
        generator: 'geosearch',
        ggscoord: lat + '|' + lon,
        ggsradius: String(r),
        ggslimit: '50',
        prop: 'coordinates|pageimages|extracts',
        exintro: '1',
        explaintext: '1',
        exsentences: '2',
        exlimit: 'max',
        pithumbsize: '480',
        format: 'json',
        origin: '*'
      };
    }

    // pageid → ページ情報。半径をまたいで同じ器に溜めるので、これがそのまま重複排除になる
    // (同じ pageid は上書きマージされるだけ)。continue で少しずつ埋まるのも従来どおり。
    var pages = Object.create(null);

    /** got(query.pages)を pages にマージする。missing なページは捨てる。 */
    function mergePages(got) {
      Object.keys(got).forEach(function (pid) {
        var page = got[pid];
        if (!page || page.missing !== undefined) return;
        var prev = pages[pid] || {};
        pages[pid] = Object.assign({}, prev, page);
      });
    }

    if (fixtureData) {
      // 固定データモードは半径ループも continue も回さず、保存済みの生レスポンスを1回流すだけ
      // (外部fetch 0回。従来と完全に同じ挙動)。
      mergePages((fixtureData.wiki && fixtureData.wiki.query && fixtureData.wiki.query.pages) || {});
    } else {
      // 同心円の半径を昇順・重複なしで組み立てる。呼び出し側が radius=5000 を渡す
      // 既定経路も壊さないよう「radius 以下のリング + radius 自身」に限る。
      var radii = [];
      WIKI_NEARBY_RING_RADII_M.forEach(function (r) {
        if (r <= radius && radii.indexOf(r) < 0) radii.push(r);
      });
      if (radii.indexOf(radius) < 0) radii.push(radius);
      radii.sort(function (a, b) { return a - b; });

      var calls = 0;      // 発行した外部リクエストの総数(WIKI_NEARBY_MAX_CALLS を超えない)
      var okCount = 0;    // 成功した半径の数
      var lastError = null;
      var conts = [];     // 各半径の続き(extracts の穴埋め)。1周目が終わってから余った回数で追う

      /** 1リクエスト発行して pages に流し込み、continue があれば返す。 */
      async function runOnce(r, cont) {
        var params = new URLSearchParams(baseParams(r));
        if (cont) {
          Object.keys(cont).forEach(function (k) { params.set(k, cont[k]); });
        }
        calls++;
        var data = await callWikipediaApi(params);
        mergePages((data && data.query && data.query.pages) || {});
        return (data && data.continue) || null;
      }

      // 1周目: まず全部の半径を1回ずつ引く。continue(要約の穴埋め)より
      // 「遠いリングのページ集合そのものを取ること」を優先しないと、
      // 近い半径の continue だけで呼び出し上限を使い切ってしまう。
      for (var ri = 0; ri < radii.length; ri++) {
        if (calls >= WIKI_NEARBY_MAX_CALLS) break;
        try {
          var cont = await runOnce(radii[ri], null);
          okCount++;
          if (cont) conts.push({ r: radii[ri], cont: cont });
        } catch (e) {
          // 1つの半径が失敗しても他の半径の結果は活かす。全滅したときだけ後で throw する。
          lastError = e;
        }
      }

      if (okCount === 0 && lastError) throw lastError;

      // 2周目: 余った呼び出し回数で continue を追い、取り切れなかった extract を埋める。
      // conts は radii(昇順)を回る1周目で push しているので、並び順がそのまま
      // 「近いリングから」になる。近い記事ほどカード上位に出るので要約を優先的に埋める。
      for (var ci = 0; ci < conts.length && calls < WIKI_NEARBY_MAX_CALLS; ci++) {
        var entry = conts[ci];
        for (var i = 0; i < WIKI_NEARBY_MAX_CONTINUE && calls < WIKI_NEARBY_MAX_CALLS; i++) {
          try {
            entry.cont = await runOnce(entry.r, entry.cont);
          } catch (e) {
            entry.cont = null; // 穴埋めの失敗は致命的ではない(extract が null のままになるだけ)
          }
          if (!entry.cont) break;
        }
      }
    }

    var articles = [];
    Object.keys(pages).forEach(function (pid) {
      var page = pages[pid];
      var coord = (page.coordinates && page.coordinates[0]) || null;
      if (!coord || !isFinite(coord.lat) || !isFinite(coord.lon)) return;

      var extract = typeof page.extract === 'string' ? page.extract.trim() : '';
      var thumb = (page.thumbnail && page.thumbnail.source) || null;

      articles.push({
        id: 'wp/' + page.pageid,
        title: page.title || '',
        lat: coord.lat,
        lon: coord.lon,
        distanceM: haversineM(lat, lon, coord.lat, coord.lon),
        thumbnailUrl: thumb || null,
        extract: extract || null,
        // curid 形式ならタイトルのエスケープを気にせずリンクできる
        url: 'https://ja.wikipedia.org/?curid=' + page.pageid
      });
    });

    articles.sort(function (a, b) { return a.distanceM - b.distanceM; });
    if (!fixtureData) cacheSet(cacheKey, articles, TTL_WIKI_NEARBY_MS);
    return articles;
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

  /**
   * キャッシュ済みなら値をスポットに反映し true を返す(=もう取りに行かなくてよい)。
   * 取得を試みて失敗した記録(tried_*)が残っている場合も、値は null のまま true を返す。
   * こうしないと「Wikidataに存在しないQ番号」等を再検索のたびに引き直してしまう。
   */
  function applyFameCache(spot, key, field) {
    if (!key) return true; // そもそも引けない(IDが無い)ので対象外
    var cached = cacheGet('fame:' + key);
    if (!cached) return false;
    if (typeof cached[field] === 'number') {
      spot.fame[field] = cached[field];
      return true;
    }
    // 値は無いが「試して駄目だった」印がある間は再取得しない
    return cached['tried_' + field] === true;
  }

  /** 取得済みの値をキャッシュに書き戻す(sitelinks と monthlyViews を同じキーにマージ)。 */
  function saveFameCache(key, patch, ttlMs) {
    if (!key) return;
    var existing = cacheGet('fame:' + key) || {};
    cacheSet('fame:' + key, Object.assign({}, existing, patch), ttlMs || TTL_FAME_MS);
  }

  /**
   * 「取得を試みたが値が得られなかった」印を短めのTTLで残す。
   * 一時的な障害からは短期間で回復させたいので、成功時(7日)より短くしておく。
   */
  function markFameTried(key, field) {
    var patch = {};
    patch['tried_' + field] = true;
    saveFameCache(key, patch, TTL_FAME_TRIED_MS);
  }

  /**
   * Wikidataのサイトリンク数(=何言語版のWikipediaに記事があるか)を取得する。
   * 多言語で記事があるほど国際的に有名なスポット、という近似指標に使う。
   */
  async function fetchSitelinks(spots) {
    var targets = spots.filter(function (s) {
      if (!s.wikidataId) return false;
      // キャッシュ(取得失敗の記録を含む)で解決できたものは対象外
      return !applyFameCache(s, s.wikidataId, 'sitelinks');
    });
    if (!targets.length) return;

    // 同じQ番号が複数スポットに付くことがあるのでID単位にまとめる
    var byId = Object.create(null);
    targets.forEach(function (s) {
      if (!byId[s.wikidataId]) byId[s.wikidataId] = [];
      byId[s.wikidataId].push(s);
    });
    var ids = Object.keys(byId);

    var idBatches = chunk(ids, WIKIDATA_BATCH_SIZE);
    var batches = idBatches.map(async function (batch) {
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
        if (!entity || !entity.sitelinks) {
          // 存在しない/削除済みのQ番号。毎回問い合わせても無駄なので印を残す
          markFameTried(id, 'sitelinks');
          return;
        }
        var count = Object.keys(entity.sitelinks).length;
        byId[id].forEach(function (s) { s.fame.sitelinks = count; });
        saveFameCache(id, { sitelinks: count });
      });
    });

    // 一部のバッチが失敗しても他の結果は活かす。
    // 失敗したバッチのIDにも印を残し、再検索のたびに叩き直さないようにする。
    var results = await Promise.allSettled(batches);
    results.forEach(function (r, i) {
      if (r.status === 'rejected') {
        idBatches[i].forEach(function (id) { markFameTried(id, 'sitelinks'); });
      }
    });
  }

  /**
   * 日本語版Wikipediaの先月の月間ページビューを取得する。
   * 1スポット1リクエストになるので、ホテルから近い順に PAGEVIEWS_MAX 件までに絞る。
   *
   * 重要: 「上位PAGEVIEWS_MAX件に絞る」→「その中の未取得だけ取りに行く」の順で処理する。
   * 逆順(未取得だけ集めてから上位を取る)にすると、候補が PAGEVIEWS_MAX を超える密集エリアで
   * 毎回まだ取っていない別の12件が選ばれ、再検索のたびに新規fetchが発生し続ける。
   */
  async function fetchPageviews(spots) {
    // まず対象集合を距離だけで確定させる(キャッシュ状況に左右されないようにする)
    var candidates = spots
      .filter(function (s) { return s.wikipediaTitle; })
      .sort(function (a, b) { return a.distanceM - b.distanceM; })
      .slice(0, PAGEVIEWS_MAX);

    // 確定した集合のうち、キャッシュで解決できないものだけを実際に取りに行く
    var targets = candidates.filter(function (s) {
      return !applyFameCache(s, s.wikipediaTitle, 'monthlyViews');
    });
    if (!targets.length) return;

    var range = lastMonthRange();

    var tasks = targets.map(async function (spot) {
      // 記事タイトルの空白はアンダースコアに置き換えるのがAPIの仕様
      var title = encodeURIComponent(spot.wikipediaTitle.replace(/ /g, '_'));
      var url = PAGEVIEWS_URL + title + '/monthly/' + range.start + '/' + range.end;

      try {
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
        if (!items.length || typeof items[0].views !== 'number') {
          markFameTried(spot.wikipediaTitle, 'monthlyViews');
          return;
        }

        spot.fame.monthlyViews = items[0].views;
        saveFameCache(spot.wikipediaTitle, { monthlyViews: items[0].views });
      } catch (e) {
        // 通信断・タイムアウト・5xxなど。再検索のたびに叩き直さないよう印を残す
        markFameTried(spot.wikipediaTitle, 'monthlyViews');
      }
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
    // 固定データモードでは Wikidata / pageviews を叩かない(fixture に含めていないため)
    if (fixtureData) return spots || [];
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
    suggestHotels: suggestHotels,
    fetchHotelsInBbox: fetchHotelsInBbox,
    fetchSpots: fetchSpots,
    fetchWikiNearby: fetchWikiNearby,
    enrichFame: enrichFame,
    // 固定データモード(?fixture=kusatsu)の差し込み口
    setFixture: setFixture,
    isFixture: function () { return !!fixtureData; },
    // 混雑シミュレーション(?simulate=overpass504)の差し込み口
    setSimulateBusy: setSimulateBusy,
    // プラン生成側や画面側でも使えるように距離計算とラベル表を公開しておく
    haversineM: haversineM,
    CATEGORY_LABELS: CATEGORY_LABELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
