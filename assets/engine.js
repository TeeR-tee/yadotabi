/**
 * やどたび v3 - 提案エンジン
 *
 * ホテルを1つ選んだだけで提案カードが出てくる、という v3 のゴールを担う部品。
 * 「集める(collect) → 並べる(rank) → 整形する(present)」の3段に分け、
 * 将来は予約サイトに埋め込んで売る想定なので、画面(app.js)から独立させてある。
 *
 * ★ rank() は暫定実装。裏付け(Wikipedia記事・公式サイト)を加点するため、
 *   結果は有名どころ・記事のある場所に偏る。「認知外の穴場を出す」アルゴリズムは
 *   計画書 09_研究ノート 側の継続課題であり、ここは差し替え前提の1関数として
 *   閉じ込めてある。UI は rank の中身に依存しないこと。
 *
 * 依存: window.YadoGeo(fetchSpots / fetchWikiNearby / haversineM)。
 *       fetchWikiNearby が未実装の環境でも OSM だけで動くよう存在チェックする。
 * window.YadoEngine として公開する。
 */
(function (global) {
  'use strict';

  // 収集半径。OSM は広めに、Wikipedia geosearch は API 上限の 10km に合わせる。
  var OSM_RADIUS_M = 15000;
  var WIKI_RADIUS_M = 10000;

  // 移動速度の概算(直線距離ベースの目安)。徒歩は道なり80m/分、車は500m/分。
  var WALK_M_PER_MIN = 80;
  var DRIVE_M_PER_MIN = 500;

  // カードの上限。far は「もっと遠く」を開いたときに出す分。
  var MAX_CARDS = 30;
  var MAX_FAR = 10;
  // 車でこれを超えるものは cards から外して far に回す
  var FAR_DRIVE_MIN = 60;

  // 要約(Wikipedia extract)の表示上限。超えたら「…」で切る。
  var SUMMARY_MAX_CHARS = 120;

  // 同一視の判定: これ以内で名前の一方が他方を含めば同じ場所とみなす
  var DEDUPE_NEAR_M = 150;
  // ホテル自身とみなす距離
  var HOTEL_SELF_M = 50;

  // ---------------------------------------------------------------------------
  // 除外ルール(信頼の最低ライン)
  //
  // Wikipedia の周辺記事には観光の対象になりにくいもの(学校・企業・駅・地名・人物・
  // 河川全体・道路)が大量に混ざる。ここは簡易な語のルールで落とす。
  // 取りこぼし(落とし損ね)は許容する方針。厳密化は研究ノート側の課題。
  // ---------------------------------------------------------------------------

  /** タイトルの末尾がこれらで終わる記事は落とす */
  var TITLE_SUFFIX_NG = [
    '駅', '停留所', 'インターチェンジ', 'ジャンクション',
    '小学校', '中学校', '高等学校', '大学', '短期大学', '専門学校', '幼稚園', '保育園',
    '株式会社', '有限会社', '合同会社',
    '郡', '町', '市', '村', '区', '丁目',
    '川', '街道', '線', '空港', '病院', '郵便局', '警察署', '消防署'
  ];

  /** タイトルにこれらを含む記事は落とす */
  var TITLE_KEYWORD_NG = ['国道', '県道', '道府県道', '市道', '一覧', '曖昧さ回避'];

  /**
   * extract(冒頭文)にこれらが出てきたら落とす。
   * 「〜は、日本の政治家」のような人物記事、行政区画の記事などが対象。
   */
  var EXTRACT_KEYWORD_NG = [
    '日本の政治家', '日本の実業家', '日本の俳優', '日本の歌手', '日本の作家',
    '日本の武将', '日本の官僚', '日本の学者', '日本のアイドル', '日本のプロ野球',
    '生まれの', '氏である', 'であった人物',
    'に所在する日本の鉄道駅', '鉄道駅である', '日本の鉄道路線',
    'に本社を置く', '株式会社である',
    '地方公共団体', 'にある地名', 'の大字', 'の地名である',
    '学校法人', '公立学校', '私立学校',
    '一級水系', '二級水系', '一級河川', '二級河川',
    '国道である', '都道府県道である'
  ];

  /**
   * Wikipedia 単独候補のカテゴリ推定表。
   *
   * Wikipedia 記事には OSM のようなタグが無いため、そのままだと全部 'other' になり、
   * カテゴリ多様性の判定にも表示ラベルにも使えない。そこで extract / title の語から
   * ざっくり推定する。上から順に評価し、最初に当たったものを採る。
   * 推定できなければ 'other' のまま(無理に当てない)。
   */
  var WIKI_CATEGORY_HINTS = [
    { category: 'waterfall', label: '滝', words: ['滝'] },
    { category: 'hot_spring', label: '温泉', words: ['温泉'] },
    { category: 'castle', label: '城・城跡', words: ['城跡', '城址', '城'] },
    { category: 'place_of_worship', label: '神社・寺院', words: ['神社', '寺院', '大社', '神宮', '寺'] },
    { category: 'museum', label: '美術館・博物館', words: ['美術館', '博物館', '資料館', '記念館'] },
    { category: 'nature', label: '自然・景勝', words: ['湖', '渓谷', '峠', '高原', '湿原', '鍾乳洞', '洞窟'] },
    { category: 'park', label: '公園', words: ['公園', '庭園'] }
  ];

  /**
   * 季節ヒント。context.now の月に合う語をカテゴリ/名前に含むものを少し加点する。
   * 「少し」なので順位をひっくり返すほどの重みは持たせない。
   */
  var SEASON_HINTS = [
    { months: [6, 7, 8], categories: ['waterfall', 'spring', 'cave'], words: ['滝', '湧水', '洞窟', '鍾乳洞'], bonus: 12 },
    { months: [11, 12, 1, 2], categories: ['hot_spring', 'public_bath'], words: ['温泉', '共同浴場', '湯'], bonus: 12 }
  ];

  // rank の重み。差し替えやすいよう1箇所にまとめる。
  var WEIGHT = {
    WIKI_IMAGE: 25,       // Wikipedia の写真がある(カードの見栄えに直結)
    WIKI_SUMMARY: 15,     // 要約がある(一行説明を書ける)
    OFFICIAL_SITE: 12,    // 公式サイトがある(実在・営業の裏付け)
    SOURCE_BOTH: 20,      // OSM と Wikipedia の両方に載っている(独立2ソースの裏付け)
    DISTANCE_PER_KM: 6,   // 距離減衰(1kmあたり)
    CATEGORY_PENALTY: 18  // 同カテゴリが上位に2件を超えたときの減点
  };
  /** 同カテゴリを無条件で許す件数。これを超えると CATEGORY_PENALTY が累積する。 */
  var CATEGORY_FREE_SLOTS = 2;

  // ---------------------------------------------------------------------------
  // 小道具
  // ---------------------------------------------------------------------------

  /** 距離計算。geo.js があればそちらを使い、無ければ自前で計算する。 */
  function distanceBetween(lat1, lon1, lat2, lon2) {
    if (global.YadoGeo && typeof global.YadoGeo.haversineM === 'function') {
      return global.YadoGeo.haversineM(lat1, lon1, lat2, lon2);
    }
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

  /**
   * 名前の正規化。空白・「・」「=」などの区切り、全角英数、大文字小文字の揺れを
   * 吸収して、OSM 名と Wikipedia 記事名を突き合わせられるようにする。
   */
  function normalizeName(name) {
    if (typeof name !== 'string') return '';
    var s = name;
    // 全角英数字・全角記号 → 半角(コードポイントが 0xFEE0 ずれている)
    s = s.replace(/[！-～]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    s = s.replace(/　/g, ' ');           // 全角スペース
    s = s.replace(/[・･・]/g, '');        // 中黒
    s = s.replace(/[\s\-‐‑‒–—―ー_=～~]/g, ''); // 空白・各種ハイフン・波ダッシュ
    // 記事名の曖昧さ回避カッコ「(群馬県)」等は落とす
    s = s.replace(/[（(][^）)]*[）)]/g, '');
    return s.toLowerCase();
  }

  /**
   * Wikipedia extract 先頭の座標表記を落とす。
   *
   * 記事によっては extract が「北緯35度13分48.3秒 東経139度6分13.2秒 早雲寺（そううんじ）は、…」
   * のように座標から始まり、120字の要約枠が座標だけで潰れてしまう。
   * 本文の頭に出る度分秒表記・「座標: …」だけを落とし、それ以外は触らない。
   * 落とした結果が空になる場合は、安全側に倒して元の文字列を返す。
   */
  var COORD_PREFIX_RE =
    /^(?:座標\s*[:：]?\s*)?(?:北緯|南緯)\s*[\d.]+\s*度(?:\s*[\d.]+\s*分)?(?:\s*[\d.]+\s*秒)?\s*(?:東経|西経)\s*[\d.]+\s*度(?:\s*[\d.]+\s*分)?(?:\s*[\d.]+\s*秒)?\s*/;

  function stripCoordPrefix(text) {
    if (typeof text !== 'string') return text;
    var stripped = text.replace(/^[\s　]+/, '').replace(COORD_PREFIX_RE, '');
    stripped = stripped.replace(/^[\s　/、,]+/, '');
    // 座標しか書かれていなかった記事は、消すと何も残らない。そのときは元のまま出す。
    return stripped ? stripped : text;
  }

  /** 文字列を最大長で切って「…」を付ける。null/空文字は null。 */
  function truncate(text, maxChars) {
    if (typeof text !== 'string') return null;
    var s = text.trim();
    if (!s) return null;
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + '…';
  }

  /** http/https の URL だけを通す。javascript: 等を公式サイトとして出さないため。 */
  function safeUrl(url) {
    if (typeof url !== 'string') return null;
    var s = url.trim();
    if (!s) return null;
    return /^https?:\/\//i.test(s) ? s : null;
  }

  /** 分数の目安。切り上げ・最低1分。 */
  function minutesFor(distanceM, metersPerMin) {
    var d = isFinite(distanceM) && distanceM > 0 ? distanceM : 0;
    return Math.max(1, Math.ceil(d / metersPerMin));
  }

  /** SNS等の外部検索リンクをまとめて作る。名前は必ずエンコードする。 */
  function buildLinks(item) {
    var q = encodeURIComponent(item.name || '');
    var coords = encodeURIComponent(item.lat + ',' + item.lon);
    return {
      gmap: 'https://www.google.com/maps/search/?api=1&query=' + coords,
      official: safeUrl(item.website),
      instagram: 'https://www.instagram.com/explore/search/keyword/?q=' + q,
      tiktok: 'https://www.tiktok.com/search?q=' + q,
      youtube: 'https://www.youtube.com/results?search_query=' + q
    };
  }

  /** context を正規化する。無指定なら今の時刻・日本語。 */
  function normalizeContext(context) {
    var ctx = context || {};
    var now = ctx.now instanceof Date && !isNaN(ctx.now.getTime()) ? ctx.now : new Date();
    return { now: now, lang: ctx.lang || 'ja' };
  }

  // ---------------------------------------------------------------------------
  // 除外判定
  // ---------------------------------------------------------------------------

  /**
   * Wikipedia 記事が観光の対象になりにくいものかどうか。
   * true なら候補から落とす。判定は語の簡易ルールで、取りこぼしは許容する。
   */
  function isExcludedArticle(title, extract) {
    var t = typeof title === 'string' ? title.trim() : '';
    if (!t) return true;

    var i;
    for (i = 0; i < TITLE_KEYWORD_NG.length; i++) {
      if (t.indexOf(TITLE_KEYWORD_NG[i]) !== -1) return true;
    }
    for (i = 0; i < TITLE_SUFFIX_NG.length; i++) {
      var suffix = TITLE_SUFFIX_NG[i];
      if (t.length > suffix.length && t.slice(-suffix.length) === suffix) return true;
    }

    var e = typeof extract === 'string' ? extract : '';
    if (e) {
      for (i = 0; i < EXTRACT_KEYWORD_NG.length; i++) {
        if (e.indexOf(EXTRACT_KEYWORD_NG[i]) !== -1) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // collect: 候補を集めて統合する
  // ---------------------------------------------------------------------------

  /** OSM スポットを内部の候補形式にそろえる。名前の無いものは呼び出し側で落とす。 */
  function fromOsmSpot(spot, hotel) {
    var name = typeof spot.name === 'string' ? spot.name.trim() : '';
    var distanceM = isFinite(spot.distanceM)
      ? spot.distanceM
      : distanceBetween(hotel.lat, hotel.lon, spot.lat, spot.lon);
    return {
      id: spot.id != null ? String(spot.id) : 'osm/' + name,
      name: name,
      lat: spot.lat,
      lon: spot.lon,
      category: spot.category || 'other',
      categoryLabel: spot.categoryLabel || 'スポット',
      distanceM: distanceM,
      website: spot.website || null,
      imageUrl: null,
      summary: null,
      source: 'osm'
    };
  }

  /**
   * Wikipedia 記事のカテゴリを title / extract の語から推定する。
   * タイトルを先に見るのは、extract には周辺地名など無関係な語が混ざりやすいため。
   * 当たらなければ {category:'other', label:'スポット'}。
   */
  function guessWikiCategory(title, extract) {
    var t = typeof title === 'string' ? title : '';
    var e = typeof extract === 'string' ? extract : '';
    var i, j, hint;
    for (i = 0; i < WIKI_CATEGORY_HINTS.length; i++) {
      hint = WIKI_CATEGORY_HINTS[i];
      for (j = 0; j < hint.words.length; j++) {
        if (t.indexOf(hint.words[j]) !== -1) return hint;
      }
    }
    for (i = 0; i < WIKI_CATEGORY_HINTS.length; i++) {
      hint = WIKI_CATEGORY_HINTS[i];
      for (j = 0; j < hint.words.length; j++) {
        if (e.indexOf(hint.words[j]) !== -1) return hint;
      }
    }
    return { category: 'other', label: 'スポット' };
  }

  /** Wikipedia 周辺記事を内部の候補形式にそろえる。 */
  function fromWikiArticle(article, hotel) {
    var title = typeof article.title === 'string' ? article.title.trim() : '';
    var distanceM = isFinite(article.distanceM)
      ? article.distanceM
      : distanceBetween(hotel.lat, hotel.lon, article.lat, article.lon);
    // OSM のようなタグが無いので、語からカテゴリを推定する(外しても 'other' に戻るだけ)
    var guessed = guessWikiCategory(title, article.extract);
    return {
      id: article.id != null ? String(article.id) : 'wp/' + title,
      name: title,
      lat: article.lat,
      lon: article.lon,
      category: guessed.category,
      categoryLabel: guessed.label,
      distanceM: distanceM,
      // Wikipedia 記事の url は「公式サイト」ではないので official には使わない
      website: null,
      imageUrl: article.thumbnailUrl || null,
      summary: article.extract || null,
      source: 'wiki'
    };
  }

  /** ホテル自身かどうか(名前一致、または 50m 以内で名前が近い)。 */
  function isHotelItself(item, hotel) {
    if (!hotel) return false;
    var hn = normalizeName(hotel.name);
    var inName = normalizeName(item.name);
    if (hn && inName && hn === inName) return true;
    if (!isFinite(hotel.lat) || !isFinite(hotel.lon)) return false;
    var d = isFinite(item.distanceM)
      ? item.distanceM
      : distanceBetween(hotel.lat, hotel.lon, item.lat, item.lon);
    if (d > HOTEL_SELF_M) return false;
    // 50m以内でも、名前がまったく無関係なら別のスポット(ホテル敷地内の庭園など)。
    // ホテル名を含む/含まれる関係のときだけ同一とみなす。
    if (!hn || !inName) return false;
    return hn.indexOf(inName) !== -1 || inName.indexOf(hn) !== -1;
  }

  /**
   * 同じ場所かどうか。
   * (1) 正規化した名前が一致する、または
   * (2) 150m 以内で、一方の名前が他方を含む(「草津温泉」と「草津温泉 湯畑」など)
   */
  function isSamePlace(a, b) {
    var na = normalizeName(a.name);
    var nb = normalizeName(b.name);
    if (!na || !nb) return false;
    if (na === nb) return true;
    var d = distanceBetween(a.lat, a.lon, b.lat, b.lon);
    if (d > DEDUPE_NEAR_M) return false;
    return na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1;
  }

  /**
   * OSM 側に Wikipedia 側の写真・要約を合体させる。
   * 座標とカテゴリは OSM(現地の実体)を、写真と要約は Wikipedia を採る。
   */
  function mergeIntoOsm(osmItem, wikiItem) {
    osmItem.imageUrl = osmItem.imageUrl || wikiItem.imageUrl || null;
    osmItem.summary = osmItem.summary || wikiItem.summary || null;
    osmItem.source = 'both';
    return osmItem;
  }

  /**
   * ホテル周辺の候補を集めて1本のリストにする。
   * OSM と Wikipedia を並行取得し、片方が落ちても取れた方だけで返す。
   *
   * @param {{name:string,lat:number,lon:number}} hotel
   * @param {Function} [onStage] (stage, items, meta) OSM 取得直後に "osm"、統合後に "wiki" を渡す。
   *        meta は {osmFailed:boolean} で、OSM 側だけ落ちたことを画面に伝えるために使う。
   * @returns {Promise<Array>} 統合済み候補(順序は未確定。rank で並べる)
   */
  async function collect(hotel, onStage) {
    var h = hotel || {};
    if (!isFinite(h.lat) || !isFinite(h.lon)) {
      throw new Error('ホテルの位置情報が正しくありません。もう一度選び直してください。');
    }

    var geo = global.YadoGeo || {};
    var canOsm = typeof geo.fetchSpots === 'function';
    var canWiki = typeof geo.fetchWikiNearby === 'function';

    if (!canOsm && !canWiki) {
      throw new Error('周辺情報を取得する仕組みが読み込まれていません。ページを再読み込みしてください。');
    }

    var osmTask = canOsm
      ? geo.fetchSpots(h.lat, h.lon, OSM_RADIUS_M)
      : Promise.reject(new Error('osm unavailable'));
    var wikiTask = canWiki
      ? geo.fetchWikiNearby(h.lat, h.lon, WIKI_RADIUS_M)
      : Promise.reject(new Error('wiki unavailable'));

    // OSM の候補づくりと "osm" 段の通知。OSM が解決した時点で先に1回だけ呼び、
    // Wikipedia の完了を待たせない(待つと段階描画が意味を失う)。
    // 統合処理でも同じリストを使うので、作った結果を覚えておいて使い回す。
    var osmItems = null;
    var osmStageSent = false;

    function buildOsmItems(value) {
      var items = [];
      if (Array.isArray(value)) {
        value.forEach(function (spot) {
          if (!spot || !isFinite(spot.lat) || !isFinite(spot.lon)) return;
          // 名前の無い OSM 要素は提案しても意味がないので落とす
          if (typeof spot.name !== 'string' || !spot.name.trim()) return;
          var item = fromOsmSpot(spot, h);
          if (isHotelItself(item, h)) return;
          items.push(item);
        });
      }
      return items;
    }

    /**
     * "osm" 段を1回だけ通知する。osmFailed は OSM が落ちたときだけ true になるが、
     * 早出しの時点では「OSM は成功している」ので常に false でよい。
     */
    function sendOsmStage(items, meta) {
      if (osmStageSent) return;
      osmStageSent = true;
      if (typeof onStage === 'function') onStage('osm', items.slice(), meta);
    }

    // 早出し。ここで throw すると allSettled の外で未処理拒否になるので握りつぶす
    // (エラーの扱いは下の allSettled 側に一本化する)。
    osmTask.then(function (value) {
      osmItems = buildOsmItems(value);
      sendOsmStage(osmItems, { osmFailed: false });
    }, function () { /* 失敗時は allSettled 側で扱う */ });

    var settled = await Promise.allSettled([osmTask, wikiTask]);
    var osmResult = settled[0];
    var wikiResult = settled[1];

    // 片方でも取れていればそれで進む。両方駄目なときだけ諦める。
    if (osmResult.status === 'rejected' && wikiResult.status === 'rejected') {
      // geo.js のエラーは日本語で書かれている前提。そうでない(通信層の生の
      // メッセージ等)ときは、利用者に出せる既定の日本語文言に置き換える。
      var reason = canOsm && osmResult.reason ? osmResult.reason.message : '';
      var readable = typeof reason === 'string' && /[ぁ-んァ-ヶ一-龥]/.test(reason);
      throw new Error(readable
        ? reason
        : '周辺の情報を取得できませんでした。通信状況を確認してもう一度お試しください。');
    }

    // OSM だけ落ちた場合も Wikipedia の結果で提案は成立する。ただし「宿周辺の
    // 情報が欠けている」ことは利用者に正直に伝えたいので、印を上まで運ぶ。
    var meta = { osmFailed: osmResult.status === 'rejected' };

    // 早出しが済んでいればその結果を使う。OSM が落ちた場合はここで空リストになる。
    if (!osmItems) {
      osmItems = osmResult.status === 'fulfilled' ? buildOsmItems(osmResult.value) : [];
    }

    // OSM が落ちていて早出しできなかったときも、段の順序(osm → wiki)は必ず守る
    sendOsmStage(osmItems, meta);

    var wikiItems = [];
    if (wikiResult.status === 'fulfilled' && Array.isArray(wikiResult.value)) {
      wikiResult.value.forEach(function (article) {
        if (!article || !isFinite(article.lat) || !isFinite(article.lon)) return;
        if (isExcludedArticle(article.title, article.extract)) return;
        var item = fromWikiArticle(article, h);
        if (!item.name) return;
        if (isHotelItself(item, h)) return;
        wikiItems.push(item);
      });
    }

    // --- 統合(dedupe) ---------------------------------------------------
    // Wikipedia 側を OSM 側に寄せる。一致しなかった記事だけ単独候補として残す。
    var merged = osmItems.slice();
    wikiItems.forEach(function (wikiItem) {
      for (var i = 0; i < merged.length; i++) {
        if (isSamePlace(merged[i], wikiItem)) {
          mergeIntoOsm(merged[i], wikiItem);
          return;
        }
      }
      merged.push(wikiItem);
    });

    if (typeof onStage === 'function') onStage('wiki', merged.slice(), meta);
    // suggest 側が最終結果にも印を付けられるよう、列挙されない形で持たせる
    // (カードの配列として素直に map/forEach できる性質は壊さない)
    Object.defineProperty(merged, 'osmFailed', { value: meta.osmFailed, enumerable: false });
    return merged;
  }

  // ---------------------------------------------------------------------------
  // rank: 並べる(★暫定・差し替え口)
  // ---------------------------------------------------------------------------

  /** 季節ヒントの加点。今月に合う語・カテゴリなら少しだけ足す。 */
  function seasonBonus(item, now) {
    var month = now.getMonth() + 1;
    var bonus = 0;
    SEASON_HINTS.forEach(function (hint) {
      if (hint.months.indexOf(month) === -1) return;
      if (hint.categories.indexOf(item.category) !== -1) {
        bonus += hint.bonus;
        return;
      }
      for (var i = 0; i < hint.words.length; i++) {
        if (item.name && item.name.indexOf(hint.words[i]) !== -1) {
          bonus += hint.bonus;
          return;
        }
      }
    });
    return bonus;
  }

  /** 裏付け + 距離減衰 + 季節ヒントの基礎スコア。カテゴリ多様性は後段で引く。 */
  function baseScore(item, now) {
    var score = 0;
    if (item.imageUrl) score += WEIGHT.WIKI_IMAGE;
    if (item.summary) score += WEIGHT.WIKI_SUMMARY;
    if (safeUrl(item.website)) score += WEIGHT.OFFICIAL_SITE;
    if (item.source === 'both') score += WEIGHT.SOURCE_BOTH;
    score -= (item.distanceM || 0) / 1000 * WEIGHT.DISTANCE_PER_KM;
    score += seasonBonus(item, now);
    return score;
  }

  /**
   * 候補を並べる。★暫定実装(有名どころ・記事のある場所に偏る)。
   *
   * (1) 裏付け: Wikipedia の写真・要約、公式サイト、2ソース一致を加点
   * (2) 距離減衰: 遠いほど減点
   * (3) カテゴリ多様性: 同カテゴリは上位2件まで。以降は順に減点して分散させる
   * (4) 季節ヒント: 夏は滝・湧水・洞窟、冬は温泉・共同浴場を少しだけ加点
   *
   * 差し替えるときはこの関数だけを入れ替えればよい(入出力は候補の配列)。
   *
   * @param {Array} items collect の結果
   * @param {Object} hotel ホテル(現状は未使用。差し替え時の判断材料として受け取る)
   * @param {Object} context {now, lang}
   * @returns {Array} スコア降順に並べた新しい配列
   */
  function rank(items, hotel, context) {
    var list = Array.isArray(items) ? items.slice() : [];
    var ctx = normalizeContext(context);

    // まず基礎スコアで仮並べし、その順にカテゴリの出現数を数えながら減点する。
    // (先に多様性を計算しないと「何件目か」が決まらないため2段階にする)
    var scored = list.map(function (item) {
      return { item: item, score: baseScore(item, ctx.now) };
    });
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.item.distanceM || 0) - (b.item.distanceM || 0);
    });

    var categoryCount = Object.create(null);
    scored.forEach(function (entry) {
      var cat = entry.item.category || 'other';
      // 'other' は「カテゴリが分からなかった」だけで、中身が似ているとは限らない。
      // (Wikipedia 単独候補は推定が外れると全部ここに落ちる)
      // 同一カテゴリとして数えると、それらが不当に沈むので減点対象から外す。
      if (cat === 'other') return;
      var seen = categoryCount[cat] || 0;
      categoryCount[cat] = seen + 1;
      if (seen >= CATEGORY_FREE_SLOTS) {
        // 3件目以降は出るほど重く減点し、同じカテゴリが延々と続くのを防ぐ
        entry.score -= WEIGHT.CATEGORY_PENALTY * (seen - CATEGORY_FREE_SLOTS + 1);
      }
    });

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.item.distanceM || 0) - (b.item.distanceM || 0);
    });

    return scored.map(function (entry) { return entry.item; });
  }

  // ---------------------------------------------------------------------------
  // present: カードに整形する
  // ---------------------------------------------------------------------------

  /** 候補1件を Card にする。 */
  function toCard(item, hotel) {
    var distanceM = isFinite(item.distanceM)
      ? Math.round(item.distanceM)
      : distanceBetween(hotel.lat, hotel.lon, item.lat, item.lon);
    return {
      id: item.id,
      name: item.name,
      lat: item.lat,
      lon: item.lon,
      imageUrl: item.imageUrl || null,
      summary: truncate(stripCoordPrefix(item.summary), SUMMARY_MAX_CHARS),
      categoryLabel: item.categoryLabel || 'スポット',
      distanceM: distanceM,
      walkMin: minutesFor(distanceM, WALK_M_PER_MIN),
      driveMin: minutesFor(distanceM, DRIVE_M_PER_MIN),
      links: buildLinks(item),
      source: item.source || 'osm'
    };
  }

  /**
   * 並んだ候補をカードにして、近いもの(cards)と遠いもの(far)に分ける。
   * 車で60分を超えるものは「もっと遠く」側に静かに回す(v3では×表示をしない)。
   *
   * @param {Array} items rank 済みの候補
   * @param {Object} hotel
   * @returns {{cards:Array, far:Array}}
   */
  function present(items, hotel) {
    var h = hotel || {};
    var list = Array.isArray(items) ? items : [];
    var cards = [];
    var far = [];

    list.forEach(function (item) {
      if (!item || !isFinite(item.lat) || !isFinite(item.lon)) return;
      var card = toCard(item, h);
      if (card.driveMin > FAR_DRIVE_MIN) {
        far.push(card);
      } else {
        cards.push(card);
      }
    });

    return {
      cards: cards.slice(0, MAX_CARDS),
      far: far.slice(0, MAX_FAR)
    };
  }

  // ---------------------------------------------------------------------------
  // suggest: 3段をつないだ公開エントリポイント
  // ---------------------------------------------------------------------------

  /**
   * ホテルを1つ渡すと提案カードを返す。v3 の唯一の入口。
   *
   * onProgress は画面を段階的に埋めるためのもので、
   *   "osm"  … OSM が取れた時点の暫定カード
   *   "wiki" … Wikipedia を統合した時点のカード
   *   "done" … 最終結果
   * の順に呼ばれる。片方のAPIが失敗しても、取れた方だけで結果を返す。
   *
   * @param {{id?:string,name:string,lat:number,lon:number}} hotel
   * @param {{now?:Date,lang?:string}} [context] 端末から自動取得する想定。無指定なら現在時刻
   * @param {Function} [onProgress] (stage, partial, meta) partial は {cards, far, osmFailed}、
   *        meta は {osmFailed:boolean}(OSM だけ落ちて Wikipedia で補った、の意)
   * @returns {Promise<{cards:Array, far:Array, osmFailed:boolean}>}
   */
  async function suggest(hotel, context, onProgress) {
    var h = hotel || {};
    var ctx = normalizeContext(context);

    function emit(stage, items, meta) {
      if (typeof onProgress !== 'function') return;
      try {
        var partial = present(rank(items, h, ctx), h);
        partial.osmFailed = !!(meta && meta.osmFailed);
        onProgress(stage, partial, meta || {});
      } catch (e) {
        // 画面側の描画エラーで提案そのものを落とさない
      }
    }

    var items = await collect(h, function (stage, partial, meta) {
      emit(stage, partial, meta);
    });

    var osmFailed = !!(items && items.osmFailed);
    var result = present(rank(items, h, ctx), h);
    result.osmFailed = osmFailed;
    if (typeof onProgress === 'function') {
      try {
        onProgress('done', result, { osmFailed: osmFailed });
      } catch (e) {
        // 同上
      }
    }
    return result;
  }

  global.YadoEngine = {
    suggest: suggest,
    // テスト・差し替え用に3段を個別に公開する
    collect: collect,
    rank: rank,
    present: present
  };
})(typeof window !== 'undefined' ? window : globalThis);
