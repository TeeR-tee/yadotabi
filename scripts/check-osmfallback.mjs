// R181: Overpass が落ちた回に「その土地の主役」が消えないことの検証。
// 実行: node scripts/check-osmfallback.mjs
//
// 背景(実測): Overpass の応答は成功でも 2.4〜15.8秒とばらつき、504 も実際に出る。
// 落ちた回は OSM 由来の候補が全部消え、湯畑(草津1位)・松山城(道後1位)のような
// **OSM 専用の主役**が提案から丸ごと抜けていた。同じ宿を選んでも運次第で違う提案が
// 出るのはアプリへの信頼を損なうので、手元のキャッシュで埋められることを確かめる。
//
// 外部APIは一切叩かない(fetch を差し替えた vm 上で geo.js を動かす)。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets', 'geo.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  cond ? (pass++, console.log('  PASS ' + label))
       : (fail++, console.log('  FAIL ' + label + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')));
};

/** localStorage 付きの geo.js を1つ作る。store を触れば保存内容を直接いじれる。 */
function load() {
  const store = new Map();
  const localStorage = {
    get length() { return store.size; },
    key(i) { return [...store.keys()][i]; },
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); }
  };
  const s = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON, AbortController, localStorage };
  s.window = s; s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(src, s, { filename: 'geo.js' });
  return { s, store };
}

const R = 15000;
// 草津: 湯畑(OSM専用の主役)と、離れた比較用スポット
const YUBATAKE = { type: 'node', id: 1, lat: 36.6225, lon: 138.5925, tags: { name: '湯畑', tourism: 'attraction' } };
const SAINOKAWARA = { type: 'node', id: 2, lat: 36.6300, lon: 138.6000, tags: { name: '西の河原公園', leisure: 'park' } };
const okRes = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });
const busyRes = { ok: false, status: 504, json: async () => ({}) };

const HOTEL_A = [36.6226, 138.5960];          // 1軒目
const HOTEL_B = [36.6260, 138.5990];          // 同じ草津の別の宿(約400m・粗いキーは隣のマス)

// 1) 同じ一帯の別の宿を「初めて」選んだ回に Overpass が落ちても主役が残る
{
  const { s } = load();
  s.fetch = async () => okRes([YUBATAKE, SAINOKAWARA]);
  await s.YadoGeo.fetchSpots(HOTEL_A[0], HOTEL_A[1], R);   // 宿Aで温める

  let calls = 0;
  s.fetch = async () => { calls++; return busyRes; };
  let names = [];
  try {
    names = (await s.YadoGeo.fetchSpots(HOTEL_B[0], HOTEL_B[1], R)).map((x) => x.name);
  } catch (e) { names = ['<throw> ' + e.message]; }

  ok(names.includes('湯畑'), '別の宿を初めて選んだ回に Overpass が落ちても湯畑が残る', names);
  ok(calls <= 2, 'Overpass への追加リクエストは再試行1回まで', { calls });
}

// 2) 借りた結果の距離が「今の宿」基準に引き直されている
//    (distanceM は WEIGHT.DISTANCE_PER_KM の減点に直結するので、ここがずれると順位が壊れる)
{
  const { s } = load();
  s.fetch = async () => okRes([YUBATAKE, SAINOKAWARA]);
  await s.YadoGeo.fetchSpots(HOTEL_A[0], HOTEL_A[1], R);
  s.fetch = async () => busyRes;
  const spots = await s.YadoGeo.fetchSpots(HOTEL_B[0], HOTEL_B[1], R);

  const hav = (aLat, aLon, bLat, bLon) => {
    const E = 6371000, t = Math.PI / 180;
    const dp = (bLat - aLat) * t, dl = (bLon - aLon) * t;
    const x = Math.sin(dp / 2) ** 2 + Math.cos(aLat * t) * Math.cos(bLat * t) * Math.sin(dl / 2) ** 2;
    return 2 * E * Math.asin(Math.sqrt(x));
  };
  const yu = spots.find((x) => x.name === '湯畑');
  const truth = hav(HOTEL_B[0], HOTEL_B[1], YUBATAKE.lat, YUBATAKE.lon);
  ok(yu && Math.abs(yu.distanceM - truth) < 1, '距離が今の宿から引き直されている', {
    got: yu && Math.round(yu.distanceM), truth: Math.round(truth)
  });
  // 宿Bからは西の河原公園のほうが近いので、並びも入れ替わっているはず
  ok(spots[0] && spots[0].name === '西の河原公園', '引き直した距離で並べ替えられている', spots.map((x) => x.name));
}

// 3) 期限切れでも、落ちた回には使う(cacheGet が消してしまわない)
{
  const { s, store } = load();
  s.fetch = async () => okRes([YUBATAKE]);
  await s.YadoGeo.fetchSpots(HOTEL_A[0], HOTEL_A[1], R);
  for (const k of [...store.keys()]) {
    const e = JSON.parse(store.get(k));
    e.exp = Date.now() - 1000;          // TTL 切れにする
    store.set(k, JSON.stringify(e));
  }
  s.fetch = async () => busyRes;
  let names = [];
  try { names = (await s.YadoGeo.fetchSpots(HOTEL_A[0], HOTEL_A[1], R)).map((x) => x.name); }
  catch (e) { names = ['<throw>']; }
  ok(names.includes('湯畑'), '期限切れキャッシュでも落ちた回には主役を拾う', names);
}

// 4) 手元に何も無ければ従来どおり縮退する(無いものを捏造しない)
{
  const { s } = load();
  s.fetch = async () => busyRes;
  let threw = false;
  try { await s.YadoGeo.fetchSpots(HOTEL_A[0], HOTEL_A[1], R); } catch (e) { threw = true; }
  ok(threw, 'キャッシュが無い初回は従来どおり縮退する');
}

// 5) 正常時は通信回数もキャッシュヒットも従来どおり(体感速度を壊さない)
{
  const { s } = load();
  let calls = 0;
  s.fetch = async () => { calls++; return okRes([YUBATAKE]); };
  await s.YadoGeo.fetchSpots(HOTEL_A[0], HOTEL_A[1], R);
  ok(calls === 1, '正常時の Overpass リクエストは1回のまま', { calls });
  await s.YadoGeo.fetchSpots(HOTEL_A[0], HOTEL_A[1], R);
  ok(calls === 1, '2回目は同じ宿ならキャッシュヒットで0回', { calls });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
