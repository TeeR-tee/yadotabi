/**
 * やどたび v0 - プラン生成
 *
 * ホテルの位置・スポット一覧・泊数・移動手段から、「時間の箱」に入った
 * 現実的な観光プランを組み立てる。
 *
 * 設計思想(計画書 05章):
 *   - 単なる周辺リストではなく「チェックイン後の半日」等の空き時間に合わせて返す
 *   - 「有名だが今回の条件では行けない」スポットを正直に×として出す(信頼の源泉)
 *
 * window.YadoPlanner として公開する。外部API・依存ライブラリなし。
 */
(function (global) {
  'use strict';

  /** カテゴリ重み(点数計算用)。有名度・距離減衰と足し合わせてスコアにする。 */
  var CATEGORY_SCORE = {
    attraction: 30,
    castle: 30,
    theme_park: 30,
    museum: 25,
    zoo: 25,
    aquarium: 25,
    viewpoint: 20,
    garden: 20,
    park: 10,
    place_of_worship: 10
  };
  var CATEGORY_SCORE_DEFAULT = 10;

  /**
   * 人気度(fame)の閾値と重み。
   * CLASSIC_* を超えたら「定番」、そうでなければ「発見」候補に回す。
   * VIEWS_WEIGHT は log10 スケールに掛ける係数なので、月1万閲覧で +80 程度になる。
   * 閾値は地方温泉地の実測(2026-09 草津白根観光ホテル櫻井周辺: 最大 月1074閲覧/2言語)に合わせた。
   */
  var FAME = {
    CLASSIC_VIEWS: 500,
    CLASSIC_SITELINKS: 2,
    VIEWS_WEIGHT: 20,
    SITELINKS_WEIGHT: 3,
    /**
     * 相対ルール。絶対閾値で定番が足りないとき、その土地の中で相対的に目立つものを拾う。
     * 「最大閲覧数の30%以上、ただし月100閲覧は下回らない」= 観光地の規模に依らず機能する。
     */
    RELATIVE_MIN_CLASSICS: 3,
    RELATIVE_VIEWS_RATIO: 0.3,
    RELATIVE_VIEWS_FLOOR: 100,
    /** fame が取れているときの hasWikipedia ボーナス(重複計上を抑えるため小さくする) */
    WIKI_BONUS_WITH_FAME: 10,
    WIKI_BONUS_WITHOUT_FAME: 50
  };

  /** 定番/発見の最大件数 */
  var MAX_CLASSICS = 5;
  var MAX_DISCOVERIES = 3;
  /** 発見枠で同一カテゴリを許す上限 */
  var MAX_PER_CATEGORY_IN_DISCOVERY = 2;
  /** classics が1件も取れなかったときのフォールバック件数 */
  var FALLBACK_CLASSICS = 3;

  /** カテゴリ別の滞在時間目安(分) */
  var STAY_MIN = {
    theme_park: 180,
    museum: 90,
    zoo: 90,
    aquarium: 90,
    castle: 60,
    attraction: 60,
    garden: 45,
    park: 45
  };
  var STAY_MIN_DEFAULT = 30;

  /** 移動速度の概算。徒歩は道なり80m/分、公共交通・車は直線距離ベースで250m/分。 */
  var WALK_M_PER_MIN = 80;
  var RIDE_M_PER_MIN = 250;

  /** 時間の箱の定義。nights(泊数) → 箱のラベルと収容スポット数。 */
  var BOX_PLANS = {
    1: [
      { label: '初日午後', capacity: 3 },
      { label: '2日目午前', capacity: 2 }
    ],
    2: [
      { label: '初日午後', capacity: 3 },
      { label: '2日目終日', capacity: 4 },
      { label: '3日目午前', capacity: 2 }
    ]
  };

  function categoryScore(category) {
    return Object.prototype.hasOwnProperty.call(CATEGORY_SCORE, category)
      ? CATEGORY_SCORE[category]
      : CATEGORY_SCORE_DEFAULT;
  }

  function stayMinutes(category) {
    return Object.prototype.hasOwnProperty.call(STAY_MIN, category)
      ? STAY_MIN[category]
      : STAY_MIN_DEFAULT;
  }

  /**
   * fame の生値を安全に取り出す。
   * geo.js の取得に失敗すると fame 自体が undefined だったり値が null だったりするので、
   * 参照側では必ずこの関数を通して 0/null に正規化する。
   */
  function famePair(spot) {
    var fame = (spot && spot.fame) || null;
    var views = fame && isFinite(fame.monthlyViews) ? Number(fame.monthlyViews) : null;
    var links = fame && isFinite(fame.sitelinks) ? Number(fame.sitelinks) : null;
    return {
      monthlyViews: views !== null && views >= 0 ? views : null,
      sitelinks: links !== null && links >= 0 ? links : null
    };
  }

  /** fame の値が1つでも取れているか */
  function hasFame(spot) {
    var f = famePair(spot);
    return f.monthlyViews !== null || f.sitelinks !== null;
  }

  /**
   * 人気度スコア。閲覧数は桁が大きく振れるので log10 で圧縮してから重み付けする。
   * 月1000閲覧 ≒ +60、月10万閲覧 ≒ +100 程度に収まる。
   */
  function fameScore(spot) {
    var f = famePair(spot);
    var views = f.monthlyViews || 0;
    var links = f.sitelinks || 0;
    return Math.log10(views + 1) * FAME.VIEWS_WEIGHT + links * FAME.SITELINKS_WEIGHT;
  }

  /**
   * 相対ルールの閾値(月間閲覧数)を求める。
   * 集合内の最大閲覧数 × RELATIVE_VIEWS_RATIO と RELATIVE_VIEWS_FLOOR の大きいほう。
   * 閲覧数が1件も取れていなければ null(相対ルールは適用しない)。
   */
  function relativeViewsLine(items) {
    var max = 0;
    items.forEach(function (item) {
      var views = famePair(item.spot || item).monthlyViews;
      if (views !== null && views > max) max = views;
    });
    if (max <= 0) return null;
    return Math.max(FAME.RELATIVE_VIEWS_FLOOR, max * FAME.RELATIVE_VIEWS_RATIO);
  }

  /** 「定番」と言い切れるだけの人気度があるか */
  function isClassic(spot) {
    var f = famePair(spot);
    if (f.monthlyViews !== null && f.monthlyViews >= FAME.CLASSIC_VIEWS) return true;
    if (f.sitelinks !== null && f.sitelinks >= FAME.CLASSIC_SITELINKS) return true;
    return false;
  }

  /**
   * スコア = 有名度 + 人気度 + カテゴリ重み − 距離減衰。
   * 距離減衰を500mあたり1点にしているのは、有名スポットなら
   * 多少遠くても候補に残る、という重み付けの意図。
   * fame が取れているときは hasWikipedia ボーナスを小さくして二重計上を避ける。
   */
  function scoreSpot(spot) {
    var wikiBonus = spot.hasWikipedia
      ? (hasFame(spot) ? FAME.WIKI_BONUS_WITH_FAME : FAME.WIKI_BONUS_WITHOUT_FAME)
      : 0;
    var decay = (spot.distanceM || 0) / 500;
    return wikiBonus + fameScore(spot) + categoryScore(spot.category) - decay;
  }

  /** 12000 → "1.2万"、3400 → "3400"(千以上は丸めて読みやすく) */
  function formatFame(value) {
    // Number(null) は 0 になってしまうので、null/undefined/'' は先に弾く
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    if (!isFinite(n) || n < 0) return null;
    if (n >= 10000) {
      var man = n / 10000;
      return (man >= 10 ? Math.round(man) : Math.round(man * 10) / 10) + '万';
    }
    if (n >= 1000) {
      return Math.round(n / 1000 * 10) / 10 + '千';
    }
    return String(Math.round(n));
  }

  /** 「月1.2万人が調べた・8言語で紹介」のような人気度ラベル。無ければ null。 */
  function fameLabelFor(spot) {
    var f = famePair(spot);
    var parts = [];
    if (f.monthlyViews !== null && f.monthlyViews > 0) {
      parts.push('月' + formatFame(f.monthlyViews) + '人が調べた');
    }
    if (f.sitelinks !== null && f.sitelinks > 0) {
      parts.push(f.sitelinks + '言語で紹介');
    }
    return parts.length > 0 ? parts.join('・') : null;
  }

  /** メートルを「8.2km」「450m」のような読みやすい文字列にする。 */
  function formatDistance(distanceM) {
    if (distanceM >= 1000) {
      return (distanceM / 1000).toFixed(1) + 'km';
    }
    return Math.round(distanceM) + 'm';
  }

  /**
   * 移動手段と距離から到達バッジを機械的に決める。
   * ここは「盛らない」ことが最重要なので、曖昧な判定は入れず距離だけで割り切る。
   */
  function judgeBadge(distanceM, mode) {
    if (mode === 'walk') {
      if (distanceM <= 1500) return { badge: 'walk', badgeLabel: '徒歩○' };
      if (distanceM <= 4000) return { badge: 'transit', badgeLabel: '公共交通○' };
      return { badge: 'unreachable', badgeLabel: '行けない×' };
    }
    if (mode === 'car') {
      if (distanceM <= 1500) return { badge: 'walk', badgeLabel: '徒歩○' };
      if (distanceM <= 40000) return { badge: 'car', badgeLabel: '車○' };
      return { badge: 'unreachable', badgeLabel: '行けない×' };
    }
    // transit(既定)
    if (distanceM <= 1500) return { badge: 'walk', badgeLabel: '徒歩○' };
    if (distanceM <= 12000) return { badge: 'transit', badgeLabel: '公共交通○' };
    if (distanceM <= 30000) return { badge: 'car', badgeLabel: '車必須△' };
    return { badge: 'unreachable', badgeLabel: '行けない×' };
  }

  /** 移動時間ラベル。徒歩は80m/分、それ以外は直線距離÷250m/分の概算。 */
  function travelLabelFor(distanceM, badge) {
    if (badge === 'unreachable') return '−';
    if (badge === 'walk') {
      return '徒歩約' + Math.max(1, Math.round(distanceM / WALK_M_PER_MIN)) + '分';
    }
    var minutes = Math.max(1, Math.round(distanceM / RIDE_M_PER_MIN));
    if (badge === 'car') return '車約' + minutes + '分';
    return '公共交通約' + minutes + '分';
  }

  /** 採用スポットの選定理由。なぜこれが出てきたのかを一言で伝える。 */
  function buildReason(spot, badge) {
    var dist = formatDistance(spot.distanceM);
    if (spot.hasWikipedia) {
      if (badge === 'walk') return '有名スポットで、ホテルから歩いて行ける距離です(' + dist + ')';
      return 'この周辺では特に知られたスポットです(' + dist + ')';
    }
    if (badge === 'walk') return 'ホテルのすぐ近くにある' + spot.categoryLabel + 'です(' + dist + ')';
    return 'ホテルから行ける範囲の' + spot.categoryLabel + 'です(' + dist + ')';
  }

  /** 除外(×)理由。「近そうで実は行けない」を正直に伝えるための文言。 */
  function buildExcludedReason(spot, mode) {
    var dist = formatDistance(spot.distanceM);
    var head = spot.hasWikipedia ? '有名スポットですが' : '気になるスポットですが';
    if (mode === 'walk') {
      return head + '徒歩では厳しい距離です(' + dist + ')';
    }
    if (mode === 'car') {
      return head + '車でもかなり遠く、日帰りでは厳しい距離です(' + dist + ')';
    }
    return head + '公共交通では現実的に行きづらい距離です(' + dist + ')';
  }

  /** スポット1件をPlanItem(画面表示単位)に変換する。 */
  function toPlanItem(spot, mode) {
    var judged = judgeBadge(spot.distanceM, mode);
    return {
      spot: spot,
      badge: judged.badge,
      badgeLabel: judged.badgeLabel,
      stayMin: stayMinutes(spot.category),
      travelLabel: travelLabelFor(spot.distanceM, judged.badge),
      reason: buildReason(spot, judged.badge),
      fameLabel: fameLabelFor(spot)
    };
  }

  /**
   * 定番枠の理由文。「なぜ定番と言えるのか」を数字の裏付きで一言にする。
   * fallback(人気度が取れなかった場合)は言い切らず控えめな表現にする。
   */
  function buildClassicReason(item, fallback) {
    var head = item.travelLabel !== '−' ? item.travelLabel + '。' : '';
    if (fallback) {
      return head + 'この周辺では外しにくい' + (item.spot.categoryLabel || 'スポット') + 'です';
    }
    var f = famePair(item.spot);
    if (f.monthlyViews !== null && f.monthlyViews >= FAME.CLASSIC_VIEWS * 3) {
      return head + '定番中の定番。' + fameLabelFor(item.spot);
    }
    if (f.sitelinks !== null && f.sitelinks >= FAME.CLASSIC_SITELINKS) {
      return head + '海外にも知られた定番。' + fameLabelFor(item.spot);
    }
    var label = fameLabelFor(item.spot);
    return head + 'このホテルに泊まる人の定番' + (label ? '。' + label : '');
  }

  /** 発見枠の理由文。断定せず「かも」で、根拠(公式サイト/記事)を添える。 */
  function buildDiscoveryReason(item) {
    var head = item.travelLabel !== '−' ? item.travelLabel + '。' : '';
    var spot = item.spot;
    if (spot.website) {
      return head + '穴場かも。公式サイトあり';
    }
    if (spot.wikipediaTitle) {
      return head + '穴場かも。記事で紹介されています';
    }
    return head + 'ちょっと足を伸ばすと出会える' + (spot.categoryLabel || 'スポット') + 'です';
  }

  /**
   * 箱の中を「ホテルから近い順に辿る」貪欲法(最近傍)で並べ替える。
   * 厳密な最短経路ではないが、行ったり来たりを避ける実用的な順番になる。
   */
  function orderByNearestNeighbor(items, hotel) {
    var remaining = items.slice();
    var ordered = [];
    var curLat = hotel.lat;
    var curLon = hotel.lon;

    while (remaining.length > 0) {
      var bestIndex = 0;
      var bestDist = Infinity;
      for (var i = 0; i < remaining.length; i++) {
        var s = remaining[i].spot;
        var d = distanceBetween(curLat, curLon, s.lat, s.lon);
        if (d < bestDist) {
          bestDist = d;
          bestIndex = i;
        }
      }
      var picked = remaining.splice(bestIndex, 1)[0];
      ordered.push(picked);
      curLat = picked.spot.lat;
      curLon = picked.spot.lon;
    }
    return ordered;
  }

  /** 距離計算。geo.jsが読み込まれていればそちらを使い、無ければ自前で計算する。 */
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
   * 「定番」と「発見」を選び分けたうえでプランを組み立てる。
   *
   * 定番 = 人気度の裏付けがあるもの(スコア降順・最大5件)
   * 発見 = 定番に入らなかった到達可能スポットのうち、公式サイトかWikipedia記事が
   *        あるもの(距離昇順・最大3件)。同じカテゴリばかりにならないよう分散する。
   *
   * @param {Object} input
   * @param {{name:string,lat:number,lon:number}} input.hotel ホテル(起点)
   * @param {Array} input.spots YadoGeo.fetchSpots の結果
   * @param {number} input.nights 泊数(1 or 2)
   * @param {string} input.mode 'walk' | 'transit' | 'car'
   * @returns {{classics:Array, discoveries:Array, boxes:Array, excluded:Array}}
   */
  function buildRecommendation(input) {
    var opts = input || {};
    var hotel = opts.hotel || {};
    var spots = Array.isArray(opts.spots) ? opts.spots : [];
    var mode = opts.mode === 'walk' || opts.mode === 'car' ? opts.mode : 'transit';
    var nights = opts.nights === 2 ? 2 : 1;
    var boxPlan = BOX_PLANS[nights];

    if (!isFinite(hotel.lat) || !isFinite(hotel.lon)) {
      throw new Error('ホテルの位置情報が正しくありません。もう一度検索してください。');
    }

    // 距離が未計算のスポットがあれば補完しておく(呼び出し側の取り回しを楽にする)
    var normalized = spots
      .filter(function (s) { return s && isFinite(s.lat) && isFinite(s.lon) && s.name; })
      .map(function (s) {
        if (isFinite(s.distanceM)) return s;
        var copy = Object.assign({}, s);
        copy.distanceM = distanceBetween(hotel.lat, hotel.lon, s.lat, s.lon);
        return copy;
      });

    // スコア降順に並べる。以降の採用・除外はすべてこの順序を基準にする。
    var ranked = normalized
      .map(function (s) { return { spot: s, score: scoreSpot(s) }; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (entry) { return entry.spot; });

    var reachable = [];
    var unreachable = [];
    ranked.forEach(function (spot) {
      var item = toPlanItem(spot, mode);
      if (item.badge === 'unreachable') {
        unreachable.push(item);
      } else {
        reachable.push(item);
      }
    });

    // --- 定番(classics)を選ぶ ---------------------------------------
    // reachable はすでにスコア降順なので、条件で絞るだけで順序は保たれる。
    var usedSpotIds = {};
    var fallback = false;
    var classicSource = reachable.filter(function (item) { return isClassic(item.spot); });

    // 絶対閾値だけだと地方温泉地では誰も届かないことがあるので、
    // 足りない分は「その土地の中で相対的に目立つもの」で補う。
    if (classicSource.length < FAME.RELATIVE_MIN_CLASSICS) {
      var relativeLine = relativeViewsLine(reachable);
      if (relativeLine !== null) {
        classicSource = reachable.filter(function (item) {
          if (isClassic(item.spot)) return true;
          var views = famePair(item.spot).monthlyViews;
          return views !== null && views >= relativeLine;
        });
      }
    }

    if (classicSource.length === 0) {
      // 人気度がまったく取れなかった場合の逃げ道。断定せずスコア上位を出す。
      fallback = true;
      classicSource = reachable.slice(0, FALLBACK_CLASSICS);
    }

    var classics = classicSource.slice(0, fallback ? FALLBACK_CLASSICS : MAX_CLASSICS)
      .map(function (item) {
        usedSpotIds[itemKey(item)] = true;
        var enriched = Object.assign({}, item, {
          reason: buildClassicReason(item, fallback)
        });
        if (fallback) enriched.fallback = true;
        return enriched;
      });

    // --- 発見(discoveries)を選ぶ -------------------------------------
    // 定番に入らなかったもののうち「手がかりがある」ものを、近い順に拾う。
    var categoryCount = {};
    var discoveries = [];
    reachable
      .filter(function (item) {
        if (usedSpotIds[itemKey(item)]) return false;
        return Boolean(item.spot.wikipediaTitle || item.spot.website);
      })
      .sort(function (a, b) { return a.spot.distanceM - b.spot.distanceM; })
      .forEach(function (item) {
        if (discoveries.length >= MAX_DISCOVERIES) return;
        var cat = item.spot.category || 'other';
        var count = categoryCount[cat] || 0;
        if (count >= MAX_PER_CATEGORY_IN_DISCOVERY) return;
        categoryCount[cat] = count + 1;
        usedSpotIds[itemKey(item)] = true;
        discoveries.push(Object.assign({}, item, {
          reason: buildDiscoveryReason(item)
        }));
      });

    // --- 箱詰め ---------------------------------------------------------
    // 詰める順序は classics → discoveries → 残りのスコア順。
    var rest = reachable.filter(function (item) { return !usedSpotIds[itemKey(item)]; });
    var ordered = classics.concat(discoveries, rest);

    var boxes = [];
    var cursor = 0;
    boxPlan.forEach(function (box) {
      var picked = ordered.slice(cursor, cursor + box.capacity);
      cursor += picked.length;
      boxes.push({
        label: box.label,
        items: picked.length > 1 ? orderByNearestNeighbor(picked, hotel) : picked
      });
    });

    // 「有名なのに行けない」を最大3件だけ正直に見せる
    var excluded = unreachable.slice(0, 3).map(function (item) {
      return Object.assign({}, item, {
        reason: buildExcludedReason(item.spot, mode)
      });
    });

    return {
      classics: classics,
      discoveries: discoveries,
      boxes: boxes,
      excluded: excluded
    };
  }

  /** PlanItem の同一判定キー。id が無いスポットもあるので座標で代替する。 */
  function itemKey(item) {
    var s = item.spot;
    return s.id != null ? String(s.id) : s.name + '@' + s.lat + ',' + s.lon;
  }

  /**
   * プランを組み立てる(v0互換API)。
   * 中身は buildRecommendation と同じで、戻り値を boxes/excluded に絞る。
   * @returns {{boxes:Array, excluded:Array}}
   */
  function buildPlan(input) {
    var result = buildRecommendation(input);
    return { boxes: result.boxes, excluded: result.excluded };
  }

  global.YadoPlanner = {
    buildPlan: buildPlan,
    buildRecommendation: buildRecommendation,
    // 画面側で個別に使えるよう補助関数も公開する
    scoreSpot: scoreSpot,
    fameScore: fameScore,
    isClassic: isClassic,
    judgeBadge: judgeBadge,
    stayMinutes: stayMinutes,
    formatDistance: formatDistance,
    formatFame: formatFame
  };
})(typeof window !== 'undefined' ? window : globalThis);
