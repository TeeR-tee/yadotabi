/**
 * やどたび v1 - 「行った！」記録モジュール
 *
 * ユーザーがスポットカードで「行った！」を押した記録を端末内(localStorage)に
 * 貯める。将来は共有バックエンドへ送る想定のため、配列形式で保持する。
 *
 * window.YadoVisits として公開する。
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'yado.visits.v1';

  /**
   * localStorageを取得する。プライベートブラウジングやストレージ無効環境では
   * アクセス自体が例外を投げるため、その場合は null を返して全体を no-op にする。
   */
  function getStore() {
    try {
      var s = global.localStorage;
      if (!s) return null;
      var probe = STORAGE_KEY + '.__probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      return null;
    }
  }

  /** 保存済みの記録配列を読み出す。無い・壊れている場合は空配列。 */
  function loadAll() {
    var store = getStore();
    if (!store) return [];
    var raw;
    try {
      raw = store.getItem(STORAGE_KEY);
    } catch (e) {
      return [];
    }
    if (raw == null) return [];

    var list;
    try {
      list = JSON.parse(raw);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(list)) return [];
    return list;
  }

  /** 記録配列を保存する。容量超過などの書き込み失敗は黙って諦める。 */
  function saveAll(list) {
    var store = getStore();
    if (!store) return;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      // 諦める(キャッシュと違い、追い出しでは容量を稼ぎづらいため単純に諦める)
    }
  }

  /** ホテルオブジェクト{name,lat,lon}から緯度経度ベースのキーを作る。 */
  function hotelKeyOf(hotel) {
    var lat = hotel && hotel.lat;
    var lon = hotel && hotel.lon;
    return Number(lat).toFixed(3) + ',' + Number(lon).toFixed(3);
  }

  /** 記録の有無を調べる。 */
  function has(hotelKey, spotId) {
    var list = loadAll();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].hotelKey === hotelKey && list[i].spotId === spotId) return true;
    }
    return false;
  }

  /**
   * 「行った！」の記録をトグルする。
   * @param {{name:string,lat:number,lon:number}} hotel
   * @param {{id:string,name:string}} spot
   * @returns {boolean} トグル後の状態(true=記録あり)
   */
  function toggle(hotel, spot) {
    var hotelKey = hotelKeyOf(hotel);
    var spotId = spot && spot.id;
    var list = loadAll();

    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].hotelKey === hotelKey && list[i].spotId === spotId) {
        idx = i;
        break;
      }
    }

    if (idx >= 0) {
      list.splice(idx, 1);
      saveAll(list);
      return false;
    }

    list.push({
      hotelKey: hotelKey,
      hotelName: hotel && hotel.name,
      spotId: spotId,
      spotName: spot && spot.name,
      ts: Date.now()
    });
    saveAll(list);
    return true;
  }

  /** 指定ホテルの記録一覧(ts降順)。 */
  function listByHotel(hotelKey) {
    return loadAll()
      .filter(function (v) { return v && v.hotelKey === hotelKey; })
      .sort(function (a, b) { return b.ts - a.ts; });
  }

  /** 指定ホテル内のスポットごとの記録数({spotId: number})。 */
  function countBySpot(hotelKey) {
    var result = {};
    listByHotel(hotelKey).forEach(function (v) {
      result[v.spotId] = (result[v.spotId] || 0) + 1;
    });
    return result;
  }

  /** 全記録数。 */
  function countAll() {
    return loadAll().length;
  }

  /** 記録全体をJSON文字列としてエクスポートする。 */
  function exportJson() {
    return JSON.stringify(loadAll());
  }

  /** 記録を全削除する。 */
  function clear() {
    saveAll([]);
  }

  global.YadoVisits = {
    hotelKeyOf: hotelKeyOf,
    toggle: toggle,
    has: has,
    listByHotel: listByHotel,
    countBySpot: countBySpot,
    countAll: countAll,
    exportJson: exportJson,
    clear: clear
  };
})(typeof window !== 'undefined' ? window : globalThis);
