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
  // R180: 60秒 → 25秒。本番で同一クエリを連続実測すると成功は 4.8s / 6.8s / 11.4s /
  // 15.8s のばらつきで、**成功する回は概ね16秒以内に返っている**。60秒は
  // 「もう返らない回」を1分間待ち続けるだけで、その間ずっと `done` に到達できない。
  // 25秒なら実測の最悪成功(15.8s)に9秒の余裕があり、返らない回は早めに諦めて
  // Wikipedia だけの提案(縮退)に倒せる。
  // ★縮退すると湯畑のような OSM 専用スポットが消えるので、**短くしすぎないこと**。
  //   併せて R180 の "wikifirst" 段により、待っている間も画面は空にならない。
  //
  // R194: 25秒 → 40秒。**R180 の前提「成功する回は16秒以内」が成り立たなくなっていた**。
  // 本番で初見(localStorage まっさら)の3エリアを実測すると、25秒では**3エリアとも
  // 毎回打ち切られ(stage:osm が 25.00〜25.02秒・ERR_ABORTED)、OSM候補が丸ごと消えていた**。
  // 同じ宿で上限だけ緩めた回と比べると、消えていたのは無名なものではなく**その土地の主役**:
  //     有馬  9件 → 21件(**金の湯=1位・銀の湯=2位 が欠落**)   実所要 38.8秒
  //     草津 12件 → 24件(**湯畑=1位 が欠落**)                実所要 26.2秒
  //     箱根 10件 → 22件(**大涌谷 が欠落**・1位が白山神社、2位が小田原城になっていた)実所要 32.2秒
  // **草津は26.2秒**、つまり打ち切りをわずか1.2秒超えただけで全滅していた。40秒なら
  // 実測の最遅成功(38.8秒)にも届く。
  //
  // ★**体感は悪化しない**。R180 の段階描画があるので最初のカードは上限と無関係で、
  //   緩めた回の first-card-painted も 1.5〜3.9秒と素の回から変わらなかった。
  //   延びるのは「全部揃うまで」だけで、その間もカードは既に出ている。
  // ★R181 のキャッシュ代替は**2回目以降しか救えない**(初見は手元が空なので発火すらしない)。
  //   実測でも初見3回すべてキャッシュは空だった。初見を救えるのはこの上限だけ。
  //
  // R194b: 40秒 → 60秒(R180 が下げる前の値に戻した)。**40秒では余裕が無かった**。
  // 本番の after 実測で、有馬 **39.851秒**(上限まで**0.15秒**)・箱根 **40.822秒**
  // (上限超過。応答が上限とほぼ同時に届いたのでたまたま使えただけ)。
  // **0.15秒の余裕は余裕ではない**——今日通っても混む日には落ちる。
  // 打ち切られると主役が丸ごと消えることは実測済みなので、**待つほうが明らかにマシ**。
  //
  // ★R180 が 60秒 → 25秒 に下げた根拠「成功する回は概ね16秒以内」は、**もう成り立たない**
  //   (実測で草津26.2秒・箱根40.8秒)。前提が崩れた以上、元の60秒に戻すのが筋。
  // ★「返らない回を1分待つ」という R180 の懸念は、**R180 自身が入れた段階描画が解消済み**。
  //   最初のカードは上限と無関係に1.9〜4.4秒で出ており、待つのは「全部揃うまで」だけ。
  // ★リクエスト数は増えない(待つだけ)。無料APIへの負荷は不変。
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

  // R163: 被リンク数(prop=linkshere)の取得設定。
  //
  // ★ 自主上限: **1エリアあたり 20リクエストを超えないこと**。
  //   実測(2026-09-19)は hakone 10 / dogo 16 / beppu 8 / kusatsu 3 / kinosaki 3 で、
  //   dogo が最も重いのは `愛媛県`(被リンク数万本)のような巨大記事が候補に入るため。
  //   下の BACKLINK_MAX_TITLES(100件)と BACKLINK_MAX_CONTINUE(20)の積み上げで
  //   構造的にこの範囲に収まるようにしてある。**候補数や continue 上限を増やすときは、
  //   必ず5エリアで実リクエスト数を測り直し、20を超えないことを確認すること**
  //   (無料APIのマナー。青天井にしない)。
  //
  // titles は prop モジュールなので1リクエストに50件まで載る。
  var BACKLINK_BATCH_SIZE = 50;
  // lhlimit=max(=500) は「そのリクエストで返るリンクの合計」であって記事ごとではない。
  // 被リンクの多い記事が1本混ざるだけで500枠を食い尽くし、同じバッチの他の記事が
  // 0件で返る(実測: 小田原城321+大涌谷91+別府地獄めぐり88 で枠が尽き、箱根神社が0件)。
  // continue を追わずに打ち切ると、直したい逆転がむしろ悪化するので必ず完走させる。
  //
  // これは「1バッチあたりに発行してよいリクエスト数」の上限(continue の回数ではない)。
  // 打ち切り(BACKLINK_SATURATE)と併用して初めて完走できる。実測(道後72件)で
  // 16リクエストで全件解決するので、余裕を見て 20 とする。
  var BACKLINK_MAX_CONTINUE = 20;
  // 打ち切り本数。engine.js の BACKLINK_FULL(加点が満点になる本数)と揃える。
  //
  // これを超えた記事はそれ以上数えても加点が変わらない(上限に張り付く)ので、
  // **数え終わった扱いにして titles から外し、続きを引き直す**。外さないと
  // 被リンクの極端に多い記事(道後のテレビ局5社で合計6000本超)が continue 枠を
  // 食い尽くし、同じバッチの松山城・石手寺が 0 のまま返る(実測: dogo 70件中36件が0)。
  //
  // **打ち切りが無いと continue は終わらない**: `愛媛県`(被リンク数万本)のような記事が
  // 1本混ざるだけで、continue を30回追っても・42リクエストかけても松山城は0のままになる
  // (API は記事名のコードポイント順に処理するため、`愛媛県` の後ろにある `松山城` に
  // 到達できない)。打ち切りは負荷対策であると同時に**正しさの前提**でもある。
  // 実測では打ち切り込みで dogo 16リクエスト・5エリアとも未解決0件、
  // 松山城328・石手寺136・道後温泉351 と正しい数字が取れる。
  var BACKLINK_SATURATE = 200;
  // 1回の suggest で被リンクを引く候補数の上限。全候補(箱根で記事名を持つもの639件)を
  // 引くと13リクエスト×continue で負荷が跳ねるため、rank 直前の基礎スコア上位だけに絞る。
  var BACKLINK_MAX_TITLES = 100;

  // R164: 親記事の本文照合(fetchParentMentions)の設定。
  //
  // **何をする仕組みか**: 「城崎温泉」「別府温泉」のようなその土地の親記事の本文を
  // 1本だけ取ってきて、**手元の候補の名前がその本文に出てくるか**を見る。
  // 出てきた候補に「親記事が言及した」という印(parentMention)を付けるだけの処理。
  //
  // **なぜ必要か**: 別府の地獄8つ・城崎の外湯7つ・湯畑は **自分のWikipedia記事を持たない**。
  // 記事が無いので R162(Wikidata経由の記事名復元)でも R163(被リンク)でも1点も入らず、
  // 別府の地獄は #79〜#229 に沈んだまま「別府に泊まっても地獄が1つも出ない」状態だった。
  // 一方で親記事(別府温泉)の本文には地獄8つが全部書かれている。
  //
  // **絞り込みが効く理由(市場調査 第6回の実測)**: 5エリアの名前付きPOI 4,244件のうち、
  // 親記事の本文に名前が出るのは **55件(1.3%)** だけ。「駅名・旅館名が大量に混じる」
  // という懸念は起きない。本文に語が出ても **同じ名前のPOIが OSM 側に無ければヒットしない**
  // ため、OSM との突き合わせが事実上のフィルタとして働く。
  var PARENT_MENTION_MIN_CHARS = 2;
  // ★2文字未満にしないこと。逆に3文字以上に上げると **柳湯(城崎)と湯畑(草津)が落ちる**
  // (市場調査 第4回で柳湯が漏れた原因がこれ)。2 は実測で決まった値。
  var PARENT_MENTION_MAX_CHARS = 20;
  // 長すぎる名前は本文に丸ごと出ることがまず無く、照合コストだけが増えるので上限を置く。

  /**
   * R164: 親記事の本文に出てきても加点してはいけない汎用普通名詞。
   *
   * 市場調査 第6回の実測で出た誤爆は 56件中4件(7.1%)で、**4件すべてが
   * 「施設の種類を表す普通名詞がそのまま OSM の name になっている」** ケースだった
   * (足湯・資料館・商店街・地獄めぐり)。固有名詞の取り違えは1件も起きていない。
   * この16語を弾くと **55件中0件** まで落ちる。
   *
   * 追加するときの基準: 「その土地固有の場所を指さない語」だけを入れること。
   * 固有名詞(海地獄・湯畑・柳湯)を入れると救いたいものを自分で消すことになる。
   */
  var PARENT_MENTION_BLOCK = [
    '足湯', '手湯', '資料館', '商店街', '地蔵', '墓地', '記念碑', '地獄めぐり',
    '史跡公園', '公衆トイレ', '駐車場', '観光案内所', '図書館', '公民館',
    '河原公園', '地蔵堂'
  ];

  // R173: 親記事の代表画像(pageimage)を「最多言及の候補」に配るときの条件。
  //
  // **何をする仕組みか**: 親記事(草津温泉)の pageimage は、Wikipedia の編集者が
  // 「この土地といえばこれ」と選んだ1枚である。実照会では草津温泉の pageimage が
  // `Yubatake_(Kusatsu_Onsen).jpg` ＝ **湯畑の写真そのもの** だった(市場調査 第11回 11-1)。
  // 湯畑は自分の記事を持たないので素材点0のまま #3 に沈んでいたが、この1枚を配れば
  // 配点を1つも触らずに写真25点が入る。**取りに行くのに追加リクエストは要らない**
  // (親記事の本文を取る既存の1リクエストの `prop` に `pageimages` を足すだけ)。
  //
  // **★誤爆を防ぐのがこの定数群の役目**(市場調査 第11回 11-7 の「厳しく絞り、
  // 当たらないエリアでは何もしない」)。実測で別府の pageimage は `Beppu_Tower…jpg`
  // ＝ **別府タワーの写真** であり、最多言及の明礬温泉に配ると明確な誤爆になる。
  // 下の4条件を全部通ったときだけ配り、1つでも外れたエリアでは **何もしない**。
  var PARENT_IMAGE_MIN_MENTION = 5;
  // 1. 言及回数の下限。城崎(最多3回)・道後(4回)・箱根(3回)はここで落ちる。
  var PARENT_IMAGE_LEAD_RATIO = 2;
  // 2. 2位に対する倍率。突出していない横並びのエリアには配らない
  //    (城崎の外湯は 一の湯3・さとの湯3 で同点、道後は 椿の湯/湯築城/愛媛県 が4回で三つ巴)。
  // 3. その候補が既に写真を持っているなら配らない(上書きしない)。← コード側で判定
  // 4. ファイル名が **別の候補** を名指ししていないこと。← isParentImageClaimedByOther
  //
  // ファイル名からエリア名と一般語を落とすと「その画像が何を写しているか」の固有語だけが残る。
  // 実測: 草津 `Yubatake_(Kusatsu_Onsen).jpg` → [yubatake](他候補と衝突なし=配ってよい)/
  //       別府 `Beppu_Tower02s4s3200.jpg` → [tower](別府タワーの pageimage と衝突=配らない)/
  //       箱根 `Hakone-Yumoto_Station_square…` → [yumoto](箱根湯本駅ほかと衝突=配らない)。
  // **ローマ字化の表は持たない**(候補名→ローマ字の変換は当てにならない)。
  // やるのは「固有語が他候補の画像名にも出るか」という **否定方向の照合だけ**。
  var PARENT_IMAGE_GENERIC_TOKENS = [
    'onsen', 'station', 'japan', 'pref', 'city', 'town', 'square', 'park',
    'hot', 'spring', 'springs', 'view', 'panorama', 'the'
  ];

  // R175: 親記事が痩せているときだけ上位概念へ昇格する(市場調査 第12回)。
  //
  // **何を直す仕組みか**: 箱根だけ親記事が「湯本 (箱根町)」= 箱根町の一字の記事に
  // 解決しており、本文1,001字で **箱根神社0回・大涌谷0回・彫刻の森0回・芦ノ湖0回**。
  // R164(本文照合)のヒットが2件しかなく、R173(代表画像)も配られず、箱根だけ
  // どの改善も効かない状態だった。正しい親記事は **箱根町**(8,766字・4大スポット全言及)。
  //
  // **★エリア名を一切参照しないデータ駆動の判定にすること**。使うのは
  // 「本文の長さ」と「自分の照合で何件拾えたか」だけで、どのエリアでも同じように測れる。
  //
  // **なぜ無条件に昇格してはいけないか(第12回 12-3-2 の実測)**: 上位に遡ると粒度が
  // 粗くなって子スポットが落ちる。城崎8→1件・草津7→2件でヒットが消え、さらに
  // 市町村の記事の代表画像は **モンタージュ(複数枚の合成写真)** であることが多く、
  // 城崎/別府/道後の3エリアで R173 の代表画像が合成写真に化ける。ゲートは必須。
  var PARENT_PROMOTE_MAX_CHARS = 2000;
  // 1. 本文がこの字数未満であること。実測で箱根1,001字 vs 次に短い城崎4,876字と
  //    4.9倍の開きがあり、境目に候補が1つも無い。
  var PARENT_PROMOTE_MAX_HIT_RATE = 10;
  // 2. **候補1,000件あたりのヒット件数**がこの値未満であること。
  //
  //    ★市場調査 第12回は「ヒット0件」を条件に挙げていたが、**実装して実測したら
  //    箱根は0件ではなく6件だった**(第12回は名前付きPOI 2,921件を母数に手で数えたのに対し、
  //    実際に engine.js が渡す候補は 2,855件で顔ぶれも違う)。素の件数で閾値を引くと
  //    箱根6件と道後12件の間に線を引くことになり、**危険なほど余裕が無い**。
  //
  //    候補数で割ると分離は一気に広がる(実測):
  //      箱根 2.1 ‰ ／ 道後 25.0 ‰ ・城崎 55.6 ‰ ・別府 64.6 ‰ ・草津 177.2 ‰
  //    箱根と次に低い道後で **12倍の開き**があり、閾値10‰はその中間に置いてある。
  //    候補数が多いエリアほど素の件数は増えるので、**割合で見るほうが素の件数より頑健**。
  //
  //    ★2条件の AND にするのが肝で、片方だけだと「短いが良く書けた記事」
  //    「たまたま照合に失敗しただけの良い記事」を巻き込む。
  //
  //    なお箱根の6件の中身は 小田急箱根x3・箱根登山バスx1・浅間山x1・鷹巣山x1・
  //    函嶺洞門x1・箱根温泉x1 で、**観光スポットは1つも無い**(本文は町字の記事で、
  //    「施設」「沿革」など節の見出しだけがあって中身が空)。第12回の
  //    「その土地の解説として機能していない」という質的な判断はそのまま正しい。
  //
  // 3. 昇格先は **記事名の括弧から無料で取る**(「湯本 (箱根町)」→「箱根町」)。
  //    括弧は Wikipedia の曖昧さ回避の規約そのもので、中身が所属する上位概念を表す。
  //    ★Wikidata P131 を使わないこと: 5エリア全件で値を返すので「昇格すべきか」を
  //    何も教えないうえ、城崎→豊岡市のように行政区画へ逸れ、実照会で 429 を食らった。
  //    他4エリア(城崎温泉・別府温泉・草津温泉・道後温泉)には括弧が無いので、
  //    **仮にゲートを誤って通過しても遡る先が取れずに何も起きない**(第2の安全装置)。
  //
  // 4. 引き直した結果のヒットが **増えたときだけ採用**する。← 呼び出し側で判定
  //    これは「壊れないこと」をコード自身に保証させる安全弁で、将来エリアを増やしても
  //    ヒットが減る方向の変更は自動的に棄却される。箱根は 2件 → 51件 なので通る。

  // R166: タグで記事名が分かっている候補の要約・写真を取りに行く(fetchWikiByTitles)の設定。
  //
  // **何をする仕組みか**: geosearch(座標から探す)で写真・要約が埋まらなかった候補のうち、
  // OSM の `wikipedia` タグ等で**記事名が確定しているもの**を集めて、
  // `action=query&titles=A|B|C` で記事を**名指しで**引く「2段目」。
  //
  // **なぜ必要か**: geosearch は宿の座標の周りを近い順に返すだけなので、
  // 記事名が分かっていても geosearch の網に入らなければ素材が付かない。
  // 実測(2026-09-19・上位35件内)で素材の欠けは hakone 18 / dogo 20 / beppu 12 件あり、
  // その中に **別府地獄めぐり(#34・要約も写真も無し)** ・箱根神社・大涌谷・小田原城天守閣・
  // 強羅公園・神奈川県立生命の星・地球博物館が含まれていた。
  // geosearch の件数上限の問題ではなく、**名指しで引く経路そのものが無かった**のが原因。
  //
  // extracts は1リクエスト20ページまで(exlimit は 1..20 しか受け付けない。
  // WIKI_NEARBY_MAX_CALLS のコメントにある実測と同じ制約)。
  var WIKI_TITLES_BATCH_SIZE = 20;
  //
  // ★ 引く相手を上位 WIKI_TITLES_POOL 件に絞る理由(無料APIのマナー):
  //   箱根は `ja:` タグを持つ要素が 250件あり、素朴に全件引くと13リクエストに膨らむ。
  //   一方で素材が効くのは表示圏(cards 5 + more 30 = 35件)の前後だけなので、
  //   上位80件に絞れば表示圏を覆える。**60 では足りなかった**のが実測の結論で、
  //   pool は「素材が付く前」の基礎スコアで選ぶため、素材を貰って上がってくる候補が
  //   pool の外に居ることがある(大涌谷・箱根町立箱根湿生花園が実際にそうだった)。
  //   実測のリクエスト数は hakone 49件=3 / dogo 44件=3 / beppu 21件=2 /
  //   kinosaki 9件=1 / kusatsu 1件=1。
  //   R163 の BACKLINK_FETCH_POOL=100 と同じ考え方だが、こちらは1件あたりの単価が
  //   高い(20件/リクエスト)ので 80 に抑えてある。
  //   **増やすときは必ず5エリアで実リクエスト数を測り直すこと**。
  //   engine.js の WIKI_TITLES_FETCH_POOL と揃えること。
  var WIKI_TITLES_POOL = 80;
  // 1エリアあたりのリクエスト上限。実測(2026-09-19)の R166 単体の発行数は
  //   hakone 49件=3 / dogo 44件=3 / beppu 21件=2 / kinosaki 9件=1 / kusatsu 1件=1
  // なので、3 で頭打ちにすれば実質どのエリアも打ち切られない。
  //
  // ★ geo.js 全体の自主上限「1エリア20リクエスト」(BACKLINK_* のコメント参照)との関係:
  //   R163 のコメントにある被リンクの実測は hakone 10 / dogo 16 / beppu 8 /
  //   kusatsu 3 / kinosaki 3。ここに R166 の最大3が上乗せされるので、
  //   **最も重い dogo で 16+3 = 19**(+ geosearch 数回)。
  //   dogo は既に上限に近いので、**WIKI_TITLES_MAX_CALLS も WIKI_TITLES_POOL も
  //   これ以上増やさないこと**。増やすなら先に被リンク側を減らすこと。
  var WIKI_TITLES_MAX_CALLS = 3;

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
  // geosearch は「半径内の全件」ではなく「近い順に ggslimit 件」を返す。ggslimit の
  // 上限は一般ユーザーで 500(以前ここに書いていた「50 が上限」は誤り)。
  // ただし件数を左右するのは ggslimit だけではない: prop 側にも1リクエストあたりの
  // 上限があり、baseParams で colimit/pilimit を max にしないと coordinates は
  // 10件・画像は50件しか返らない。geo.js は座標の無い記事を候補にできないため、
  // 以前は ggslimit を上げても「使える記事」が40件(=continue4回x10)で頭打ちだった。
  // colimit=max と合わせることで、10km を1周引くだけで遠い記事まで座標付きで入る。
  var WIKI_NEARBY_RING_RADII_M = [10000];
  // 1回の fetchWikiNearby が発行する外部リクエストの総上限(無料APIのマナー)。
  // 半径1段(1周目)+ continue 最大3回(2周目)。continue もこの数に含めて数える。
  // extracts だけは1リクエスト20件の制限が外せない(exlimit は 1..20 しか受け付けず、
  // exsentences を外しても20件のまま。exintro まで外すと逆に1件へ落ちる)。
  // そのため continue の残り回数は要約(extract)の穴埋めに使う。
  var WIKI_NEARBY_MAX_CALLS = 4;

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

  // `?slow=osm800,wiki1500` 用。撮影・目視QAで段階描画(OSM先出し→Wikipedia後乗せ)を
  // 意図的に見えやすくするための遅延(ms)。通常時は 0 で await すら通らない。
  var slowDelays = { osm: 0, wiki: 0 };
  function setSlowDelays(d) {
    var osm = d && isFinite(d.osm) && d.osm > 0 ? d.osm : 0;
    var wiki = d && isFinite(d.wiki) && d.wiki > 0 ? d.wiki : 0;
    slowDelays = { osm: osm, wiki: wiki };
  }

  // Overpass が 504(サーバのリソース不足)を返したときに待つ時間(ms)。再試行は1回だけ。
  // **429(レート制限)では使わない**。429 は「こちらの投げすぎ」なので再試行しない(R195)。
  var OVERPASS_RETRY_WAIT_MS = 3000;

  // R195: 429 を受けたあと再送を控える時間(ms)。Overpass の規約が明記する数字
  // (「429 や 406 を受けたら30秒休止する」)そのまま。ユーザーを30秒待たせるのではなく、
  // **この30秒のあいだは投げずに即 R181 のキャッシュ代替へ落とす**ための門番である。
  var OVERPASS_COOLDOWN_MS = 30000;

  // ---------------------------------------------------------------------------
  // キャッシュ層 (window.YadoCache)
  // ---------------------------------------------------------------------------

  var CACHE_PREFIX = 'yado.cache.';

  /**
   * キャッシュの「値の形式」バージョン(R184)。
   *
   * 今日1日で `parent:` キャッシュの中身を何度も変えた
   * (parentExtract追加→parentImage追加→parentTitle昇格の採用)。
   * 既にアプリを使ったことがある端末には古い形式のデータが残っており、
   * TTL(7日)が切れるまで新しいフィールドが無いまま=加点が効かない状態が続く。
   *
   * 保存する値を { ver, v } でラップし、読むときに ver が一致しないものは
   * 「無かった」ことにする(捨てて null を返す)。次回アクセス時に自然に
   * 新しい形式で上書きされるので、利用者は何もしなくてよい。
   * 形式を変えるたびにこの数字を上げること。
   */
  var CACHE_FORMAT_VERSION = 1;

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

  /**
   * キャッシュを読む本体。`keepStale` が真のときは**期限切れでも消さずに返す**。
   *
   * R181: 期限切れエントリを即 removeItem していたのが縮退の隠れた原因のひとつだった。
   * Overpass が落ちた回は「7日+1秒前に取った湯畑入りの結果」が手元にあっても、
   * cacheGet がそれを捨ててから通信に行き、失敗して何も残らない。
   * 鮮度が理想でないだけのデータは、**主役が消えるよりはるかにまし**なので取っておく。
   */
  function readCache(key, keepStale) {
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
    // R184: 形式バージョンが一致しない(古いアプリが書いた/未来のverが書いた)ものは
    // 「無かった」ことにして捨てる。stale扱いの延命もしない(中身の形が保証できないため)。
    if (entry.ver !== CACHE_FORMAT_VERSION) {
      try { store.removeItem(full); } catch (e4) { /* 無視 */ }
      return null;
    }
    if (entry.exp <= Date.now()) {
      // 期限切れ。通常読み(keepStale=false)では従来どおり捨てて null を返す。
      if (!keepStale) {
        try { store.removeItem(full); } catch (e3) { /* 無視 */ }
        return null;
      }
      return entry.v;
    }
    return entry.v;
  }

  /** キャッシュから値を取り出す。未登録・期限切れ・壊れたJSONはすべて null。 */
  function cacheGet(key) {
    return readCache(key, false);
  }

  /**
   * 期限切れでも構わず読む。**通信に失敗した後の最後の砦としてだけ**使うこと。
   * 通常の取得経路で使うと、いつまでも古い結果を返し続けることになる。
   */
  function cacheGetStale(key) {
    return readCache(key, true);
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
      payload = JSON.stringify({ ver: CACHE_FORMAT_VERSION, exp: Date.now() + ttlMs, v: value });
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
   * 「草津温泉 ホテル櫻井」のような入力から、温泉地名の「温泉」を落とした語を作る。
   * 落とせるものが無ければ null。
   *
   * Nominatim は語をAND条件で扱うため、OSM に「草津温泉」という名前の宿や地名が
   * 無い(実測ではバス停だけ)と、宿の名前が正しくても0件になる。実測:
   *   「草津温泉 ホテル櫻井」0件 / 「草津 ホテル櫻井」1件(草津白根観光ホテル櫻井)
   *   「有馬温泉 兵衛向陽閣」0件 / 「有馬 兵衛向陽閣」2件
   * 宿名そのものに付く「温泉」(例: 鶴の湯温泉)まで削ると別物になるので、
   * **2語以上あるときの、最後の語より前にある「◯◯温泉」だけ**を対象にする。
   * @param {string} q 検索語
   * @returns {string|null}
   */
  function dropOnsenFromArea(q) {
    var words = String(q || '').split(' ').filter(Boolean);
    if (words.length < 2) return null;
    var changed = false;
    // 最後の語(宿名とみなす)は触らない
    for (var i = 0; i < words.length - 1; i++) {
      var w = words[i];
      if (w.length > 2 && /温泉$/.test(w)) {
        words[i] = w.slice(0, -2);
        changed = true;
      }
    }
    return changed ? words.join(' ') : null;
  }

  /**
   * Nominatim /search を1回だけ叩いて生のJSON配列を返す。
   * @param {string} q 検索語
   * @param {number} limit 最大件数
   */
  async function requestNominatim(q, limit) {
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

  /**
   * Nominatim /search を呼び、生のJSON配列を返す。geocodeHotel と suggestHotels で共通。
   *
   * 0件だったときに限り、温泉地名の「温泉」を落としてもう一度だけ引き直す。
   * **見つかった場合は追加リクエストを出さない**ので、通常時の回数は変わらない。
   * @param {string} q 検索語
   * @param {number} limit 最大件数
   */
  async function searchNominatim(q, limit) {
    var data = await requestNominatim(q, limit);
    if (data.length) return data;

    var retry = dropOnsenFromArea(q);
    if (!retry || retry === q) return data;
    return requestNominatim(retry, limit);
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

  /**
   * R191: 「宿でないもの」を見分けるための分類。**消すためではなく順位を下げるため**に使う。
   * OSM の種別は不正確なことがある(宿が building=yes で登録されている等)ので、
   * ここに当たっても候補からは外さない。
   *
   * 実測(2026-09-19, /search?format=jsonv2):
   *   「新明館」1位 = 新明和工業研修館 → category=building / type=commercial(工場の研修施設)
   *   同 4位 = タルイ会館 新明 → category=shop / type=funeral_directors(葬儀社)
   *   「一井」4位 = 一井工業株式会社 → category=office / type=company
   */
  function isNonLodging(cls, type) {
    if (cls === 'office' || cls === 'shop' || cls === 'craft' || cls === 'historic') return true;
    if (cls === 'building' && /^(commercial|industrial|warehouse|office|retail|school|church)$/.test(type)) return true;
    if (cls === 'amenity' && /^(community_centre|place_of_worship|funeral_directors|school|kindergarten|hospital)$/.test(type)) return true;
    return false;
  }

  /**
   * R191: 検索語と名前の一致度。0〜3。
   *
   * 「ホテル櫻井」は実測で `tourism=hotel` が3件返るが、正解(草津白根観光ホテル櫻井)は
   * Nominatim の importance が大阪の有名ホテルに負けて3位に沈む。
   * 3件のうち**名前に検索語がそのまま入っているのは正解だけ**なので、
   * 種別だけでなく名前の一致も見ないと1位にできない。
   * @param {string} name 候補の名前
   * @param {string} q 検索語(空白除去済みの比較用)
   */
  function nameMatchScore(name, q) {
    var n = String(name || '').replace(/[\s　]+/g, '');
    if (!n || !q) return 0;
    if (n === q) return 3;          // 完全一致
    if (n.indexOf(q) === 0) return 2; // 前方一致(「一井旅館」など)
    if (n.indexOf(q) >= 0) return 1;  // 部分一致(「草津白根観光ホテル櫻井」)
    return 0;
  }

  /**
   * R191: 「宿らしさ」の点数。大きいほど上。**並べ替えにのみ使い、候補は減らさない。**
   *
   * 追加のリクエストは出さない(/search の応答に既に入っている category / type
   * だけで決める)。
   * なお extratags(building=hotel など)は `extratags=1` を付けたときしか返らず、
   * それはリクエストの追加にあたるので**使わない**。素の応答にある情報だけで決める。
   * @param {{kind:string, name:string, cls:string, type:string}} row
   * @param {string} q 空白を除いた検索語
   */
  function lodgingScore(row, q) {
    var score = 0;
    // 1) 宿と判定できたものを最優先(tourism=hotel/ryokan/guest_house/hostel/motel)
    if (row.kind !== 'place') score += 100;
    // 2) 明らかに宿でないもの(工場・事務所・葬儀社・集会所など)は下げる
    if (isNonLodging(row.cls, row.type)) score -= 50;
    // 3) 同じ宿らしさなら、名前が検索語に近いものを上に
    score += nameMatchScore(row.name, q) * 10;
    return score;
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
          displayName: item.display_name || '',
          // R191: 並べ替え用。呼び出し側には渡さないので下で削る。
          _cls: cls,
          _type: item.type
        });
      });

      // R191: 「宿らしいもの」を上位に。**並べ替えのみで候補は減らさない。**
      // Nominatim の並びは importance 順で、有名な別の宿や宿ですらない施設(工場の
      // 研修施設など)が上に来てしまう。応答に既に入っている情報だけで並べ替える。
      var qCompact = q.replace(/[\s　]+/g, '');
      var scored = results.map(function (row, i) {
        return {
          row: row,
          // 同点なら Nominatim の元の並びを保つ(安定ソート)
          i: i,
          score: lodgingScore(
            { kind: row.kind, name: row.name, cls: row._cls, type: row._type },
            qCompact
          )
        };
      });
      scored.sort(function (a, b) {
        return b.score - a.score || a.i - b.i;
      });
      results = scored.map(function (s) {
        delete s.row._cls;
        delete s.row._type;
        return s.row;
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

  /**
   * 名前がこれらで終わる候補は社寺とみなす。
   *
   * 社寺は OSM 上で複数の要素に分かれていることがあり、境内の石碑が
   * historic=memorial / monument として本体と同じ名前で登録されている。
   * CATEGORY_RULES は上から順に見るうえ、engine 側の重複統合は先に見つけた方
   * (＝より近い石碑ノード)を代表にするため、神社が「記念碑」と表示されていた
   * (例: 道後の伊佐爾波神社・湯神社)。名前で社寺と分かるものはタグより名前を優先する。
   */
  var WORSHIP_NAME_SUFFIX = ['神社', '神宮', '大社', '八幡宮', '天満宮', '寺', '院'];

  function looksLikeWorship(name) {
    var n = typeof name === 'string' ? name.trim() : '';
    if (!n) return false;
    for (var i = 0; i < WORSHIP_NAME_SUFFIX.length; i++) {
      var w = WORSHIP_NAME_SUFFIX[i];
      if (n.length >= w.length && n.slice(-w.length) === w) return true;
    }
    return false;
  }

  /** OSMのtagsから内部カテゴリを判定する。該当なしは 'other'。 */
  function detectCategory(tags, name) {
    // 名前から社寺と分かるものは、タグの評価順より名前を優先する
    if (looksLikeWorship(name)) return 'place_of_worship';
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
   * 混雑(429/504)を表す Error を作る。呼び出し側は overpassBusy で判別する。
   *
   * **R195: 429 と 504 を必ず区別する。** 両者は原因も対処も正反対である。
   *   - **429 = レート制限違反**。「サーバが混んでいる」のではなく**こちらが投げすぎ**。
   *     Overpass の規約は「429/406 を受けたら30秒休止せよ」と明記しており、
   *     3秒で再試行するのは**規約の1/10**で、429 を自分で誘発する。
   *   - **504 = サーバのリソース不足**。こちらの落ち度ではないので短い再試行に意味がある。
   * 以前はこの2つを overpassBusy に統合していたため、**実運用でどちらが起きているか
   * 誰にも分からなかった**。それが R194b の「504が続く」という誤った見立ての原因。
   * @param {number} status 実際の HTTP ステータス(429 / 504)
   */
  function busyError(status) {
    var err = new Error('地図サーバーが混雑しています。1分ほど待ってからもう一度お試しください。');
    err.overpassBusy = true;
    err.overpassStatus = status;
    err.rateLimited = status === 429;
    return err;
  }

  /**
   * R195: 直近に 429 を受けた時刻(ms)。規約の「429 を受けたら30秒休止」を守るため、
   * この時刻から OVERPASS_COOLDOWN_MS のあいだは**リクエストそのものを投げない**。
   * 投げずに即 busyError を返すので、呼び出し側は R181 のキャッシュ代替へ落ちる。
   */
  var lastRateLimitedAt = 0;

  /** R195: 429/504 をコンソールに区別して出す。原因が違えば対処も違うため。 */
  function logOverpassBusy(status) {
    if (!global.console || !console.warn) return;
    if (status === 429) {
      console.warn('[yadotabi] Overpass 429(レート制限) — こちらの投げすぎ。' +
        (OVERPASS_COOLDOWN_MS / 1000) + '秒は再送しない(規約順守)。再試行せずキャッシュ代替へ');
    } else if (status === 504) {
      console.warn('[yadotabi] Overpass 504(サーバ混雑) — 相手側の都合。' +
        (OVERPASS_RETRY_WAIT_MS / 1000) + '秒後に1回だけ再試行する');
    } else {
      console.warn('[yadotabi] Overpass 混雑(status=' + status + ')');
    }
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
    // シミュレーションは従来どおり 504(サーバ混雑)として扱う(?simulate=overpass504)。
    if (simulateBusy) throw busyError(504);

    // R195: 直近30秒以内に 429 を受けていたら**投げない**。規約の30秒休止を守る。
    // ここで投げ返す Error は 429 由来なので、呼び出し側は再試行せず代替へ落ちる。
    var sinceRateLimit = Date.now() - lastRateLimitedAt;
    if (lastRateLimitedAt && sinceRateLimit < OVERPASS_COOLDOWN_MS) {
      if (global.console && console.warn) {
        console.warn('[yadotabi] Overpass 429の休止中(残り' +
          Math.ceil((OVERPASS_COOLDOWN_MS - sinceRateLimit) / 1000) + '秒) — 送信を見送る');
      }
      throw busyError(429);
    }

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

    if (res.status === 429) {
      lastRateLimitedAt = Date.now();
      logOverpassBusy(429);
      throw busyError(429);
    }
    if (res.status === 504) {
      logOverpassBusy(504);
      throw busyError(504);
    }
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
   * R181: スポットキャッシュの「粗いキー」を作る。
   *
   * **なぜ粗いキーが要るか(実測)**: 従来のキーは宿の座標を小数3桁(約100m)に
   * 丸めたもので、**宿が1軒違えばキャッシュは必ず外れる**。湯畑や松山城が消えたのは
   * どれも「その宿を初めて選んだ回」で、手元に何も無い状態で Overpass が落ちた時だった。
   * つまり従来のキャッシュは、この事故に対して**構造的に一度も効かない**。
   *
   * 一方で検索半径は15kmある。fixtures/kusatsu.json の実スポットで、宿の座標だけを
   * ずらして「15km以内に入る集合」を比べると:
   *     111m移動 → 一致率100.0% / 555m → 99.4% / 1.1km → 97.5% / 2.2km → 96.2%
   * 15km の円は、宿が1km動いた程度ではほとんど動かない。100m刻みという細かさは
   * **精度に何も貢献しないまま、キャッシュを外していただけ**だった。
   *
   * そこで小数2桁(緯度約1.1km)の粗いキーを**併記**して保存する。同じ温泉街の別の宿を
   * 一度でも見ていれば、初めて選ぶ宿でも Overpass 抜きで候補を用意できる。
   * ★粗いキーは**通信に失敗したときの代替**としてだけ読む(正常時は従来どおり
   *   その宿の座標で取り直すので、提案の質は変わらない)。
   */
  function areaCacheKey(lat, lon, radius) {
    return 'spotsArea:' + lat.toFixed(2) + ',' + lon.toFixed(2) + ':' + radius;
  }

  /**
   * R181: 粗いキーの「隣のマス」も含めた候補キー一覧(自分 + 周囲8マス)。
   *
   * ★これが無いと格子の境目で取りこぼす: 実際に 36.6226 は 36.62 に、わずか400m先の
   *   36.6260 は 36.63 に丸まる。同じ温泉街の隣同士なのにマスが違うだけで代替が
   *   見つからない、という事故が起きる(実測で確認済み)。近い順に並べて返すので、
   *   呼び出し側は先に見つかったものを使えばよい。
   */
  function areaCacheKeysNear(lat, lon, radius) {
    var STEP = 0.01; // 粗いキーの刻み(小数2桁)と同じ幅
    var keys = [];
    var seen = Object.create(null);
    [0, -1, 1].forEach(function (dy) {
      [0, -1, 1].forEach(function (dx) {
        var k = areaCacheKey(lat + dy * STEP, lon + dx * STEP, radius);
        if (seen[k]) return;
        seen[k] = true;
        keys.push(k);
      });
    });
    return keys;
  }

  /**
   * R181: 別の宿(または過去の自分)の座標で取ったスポット配列を、**今の宿からの
   * 距離に計算し直して**返す。
   *
   * ★これを省くと順位が壊れる: 配列の distanceM は保存時の宿を基準にした値で、
   *   engine.js の fromOsmSpot は `isFinite(spot.distanceM)` ならそれをそのまま使い、
   *   その値が WEIGHT.DISTANCE_PER_KM の減点に直結する。1km ずれた宿の距離で
   *   採点すると並びが変わってしまう(= 提案の質を落とす)ので、必ず引き直す。
   */
  function rebaseSpots(spots, lat, lon, radius) {
    if (!Array.isArray(spots)) return [];
    var limit = isFinite(radius) && radius > 0 ? radius : Infinity;
    var out = spots.map(function (spot) {
      if (!spot || !isFinite(spot.lat) || !isFinite(spot.lon)) return null;
      var copy = {};
      for (var k in spot) { if (Object.prototype.hasOwnProperty.call(spot, k)) copy[k] = spot[k]; }
      copy.distanceM = haversineM(lat, lon, spot.lat, spot.lon);
      return copy;
    }).filter(function (s) {
      if (!s || !isFinite(s.distanceM)) return false;
      // 隣のマスの結果を借りた場合、円が少しずれる分だけ半径外の点が混ざりうる。
      // 本来の検索半径に収め直して、普段より広い範囲を出してしまわないようにする。
      return s.distanceM <= limit;
    });
    // fetchSpots の戻り値は「距離の近い順」が約束なので、引き直した距離で並べ直す
    out.sort(function (a, b) { return a.distanceM - b.distanceM; });
    return out;
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

    if (slowDelays.osm > 0) await delay(slowDelays.osm);

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
        // R195: **429 と 504 で扱いを変える**。以前は両方まとめて3秒後に再試行していたが、
        // 429 は「こちらの投げすぎ」なので3秒で投げ直すと**自分で429を誘発する**
        // (市場調査役の実測: 3秒間隔10連投で成功4・429が5、10回目で接続断)。
        // Overpass の規約も「429 を受けたら30秒休止」と明記している。
        //   - 429 → **再試行しない**。即 R181 のキャッシュ代替へ落とす。
        //   - 504 → 相手側のリソース不足でこちらの落ち度ではないので、3秒後に1回だけ再試行。
        // タイムアウトや通信断は待っても状況が変わらない(既に60秒待っている)ので再試行しない。
        data = null;
        if (e && e.overpassBusy && !e.rateLimited) {
          await delay(OVERPASS_RETRY_WAIT_MS);
          try {
            data = await requestOverpass(query, timeoutMsg);
          } catch (e2) {
            data = null;
          }
        }

        // R181: ここまで来たら Overpass からは取れていない。**通信を諦める前に、
        // 手元の代替を順に当たる**。外部リクエストは1本も増えない(全部 localStorage)。
        //   1. この宿ぴったりのキャッシュ(期限切れ可)
        //   2. 同じ一帯(約1.1km四方)のキャッシュ … 別の宿で温めた分が効く
        // 見つかったら距離を引き直して返す。**空で返すより桁違いにまし**で、
        // これが無いと湯畑・松山城のような OSM 専用スポットが丸ごと消える。
        if (!data) {
          var fallback = cacheGetStale(cacheKey);
          var fallbackVia = 'exact';
          if (!fallback || !fallback.length) {
            // 自分のマス→隣接8マスの順に当たる(格子の境目で取りこぼさないため)
            var nearKeys = areaCacheKeysNear(lat, lon, radius);
            for (var ki = 0; ki < nearKeys.length; ki++) {
              var hit = cacheGetStale(nearKeys[ki]);
              if (hit && hit.length) {
                fallback = hit;
                fallbackVia = 'area';
                break;
              }
            }
          }
          if (fallback && fallback.length) {
            if (global.console && console.info) {
              console.info('[yadotabi] Overpass 失敗 → キャッシュで代替(' +
                fallbackVia + ', ' + fallback.length + '件)');
            }
            return rebaseSpots(fallback, lat, lon, radius);
          }
          // 代替も無い。ここは本当に手が無いので従来どおり縮退させる。
          throw e;
        }
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

      var category = detectCategory(tags, name);
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

    // R162: wikidata タグはあるが wikipedia タグが無い候補の記事名を復元する。
    await resolveWikipediaTitles(spots);

    if (!fixtureData) {
      cacheSet(cacheKey, spots, TTL_SPOTS_MS);
      // R181: 粗いキーにも同じ結果を控える。次に**同じ一帯の別の宿**を初めて選んだ回に
      // Overpass が落ちても、ここから主役を拾える。保存は localStorage 1本増えるだけで
      // 外部リクエストは増えない。容量が厳しい環境では cacheSet 側が古い順に捨てる。
      cacheSet(areaCacheKey(lat, lon, radius), spots, TTL_SPOTS_MS);
    }
    return spots;
  }

  /**
   * R162: OSM の `wikidata` タグから日本語版Wikipediaの記事名を復元する。
   *
   * OSM では `wikidata` タグだけが付いていて `wikipedia` タグが無い要素が多い
   * (実測: hakone 352件 / beppu 27件 / dogo 22件 / kusatsu 11件)。
   * Wikidata の sitelinks を引けば、そのうち jawiki 記事を持つものの記事名が分かる
   * (実測: dogo 18/22・beppu 13/27・kusatsu 3/11)。
   *
   * **取り違えが起きない経路である理由:** 突き合わせの鍵が Q番号という一意な識別子
   * であり、名前の類似では一切判定していない。Q番号が指す項目の jawiki 記事は
   * 定義上その項目そのものなので、別のスポットの記事が付くことがない。
   *
   * 負荷: wbgetentities は 50件/リクエスト。5エリア合計でも9リクエストで収まる。
   * **1候補1リクエストにはしないこと**(無料APIのマナー)。
   *
   * 失敗しても致命的ではない(wikipediaTitle が null のままになるだけ)ので、
   * 例外は握りつぶして候補づくり自体は必ず成立させる。
   */
  async function resolveWikipediaTitles(spots) {
    // fixture モードでは外部APIを叩かない。make-fixture.mjs が保存した対応表を使う。
    if (fixtureData) {
      var table = fixtureData.wikidataTitles || null;
      if (!table) return;
      spots.forEach(function (s) {
        if (s.wikipediaTitle || !s.wikidataId) return;
        var t = table[s.wikidataId];
        if (typeof t === 'string' && t) s.wikipediaTitle = t;
      });
      return;
    }

    // 対象は「wikipedia タグが無く、wikidata タグだけがある」候補に限る。
    // 既に記事名が分かっているものを上書きしない(OSM のタグの方が現地の判断として強い)。
    var byId = Object.create(null);
    spots.forEach(function (s) {
      if (s.wikipediaTitle || !s.wikidataId) return;
      if (!byId[s.wikidataId]) byId[s.wikidataId] = [];
      byId[s.wikidataId].push(s);
    });
    var ids = Object.keys(byId);
    if (!ids.length) return;

    // R171: Wikimedia のマナー上、同時に複数リクエストを投げない(直列化)。
    // リクエスト回数は変えず、chunk().map(async)+allSettled だった並列発行を
    // for...of + await に変えただけ。1バッチ失敗しても残りは続ける。
    var batchesList = chunk(ids, WIKIDATA_BATCH_SIZE);
    for (var bi = 0; bi < batchesList.length; bi++) {
      var batch = batchesList[bi];
      try {
        var params = new URLSearchParams({
          action: 'wbgetentities',
          ids: batch.join('|'),
          props: 'sitelinks',
          // 日本語版だけに絞ると応答が小さくなる(他言語は使わない)
          sitefilter: 'jawiki',
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
          var link = entity && entity.sitelinks && entity.sitelinks.jawiki;
          var title = link && typeof link.title === 'string' ? link.title.trim() : '';
          if (!title) return;
          byId[id].forEach(function (s) {
            if (!s.wikipediaTitle) s.wikipediaTitle = title;
          });
        });
      } catch (e) {
        // 一部のバッチが落ちても他の結果は活かす(取れなかった分は null のまま)。
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 被リンク数 (fetchBacklinkCounts) — R163
  // ---------------------------------------------------------------------------

  /**
   * R163: 日本語版Wikipedia の「その記事を指しているリンクの本数」を数える。
   *
   * **なぜ必要か**: これまでのスコアには「有名かどうか」を測る指標が1つも無く、
   * 写真・要約・公式サイト・2ソース一致という**素材の有無**と距離だけで順位が決まっていた。
   * 素材が同条件なら距離だけで決まるため、箱根では宿から1.7km の紹太寺本堂・1.8km の
   * 早川橋梁が並ぶ一方、8.0km の箱根神社(#84)と7.6km の大涌谷(#61)が表示22件に
   * 入らなかった。被リンク数は「他の記事が何本その記事を参照しているか」なので、
   * 日本語圏でどれだけ語られている場所かの代理になる。
   *
   * **先行事例**: OSM 公式の検索エンジン Nominatim が、地物の重要度(importance)を
   * Wikipedia の被リンク数から算出している。自前で考えた指標ではない。
   *
   * **欠損は減点ではなく0点**。引けなかった候補が沈むのではなく、引けた候補が
   * 有利になるだけ(現状の順位が下限として保たれる)。
   *
   * **continue を必ず完走すること**(BACKLINK_MAX_CONTINUE の説明を参照)。
   * 1リクエストで打ち切ると被リンクの多い記事に500枠を食われ、箱根神社が 0 で返る。
   *
   * リダイレクト(`redirects=1`)も追う。湯畑・海地獄のように記事が別名に転送される
   * 候補でも数字が引ける。転送先の数字は転送元の title にも配る。
   *
   * @param {string[]} titles 日本語版Wikipedia の記事名(重複可)
   * @returns {Promise<Object>} 記事名 → 被リンク数。引けなかった記事は含まない
   */
  async function fetchBacklinkCounts(titles) {
    var counts = Object.create(null);
    if (!Array.isArray(titles) || !titles.length) return counts;

    // 重複を除いて上限まで。順序は呼び出し側が優先度順に並べてくる前提。
    var uniq = [];
    var seenTitle = Object.create(null);
    titles.forEach(function (t) {
      var s = typeof t === 'string' ? t.trim() : '';
      if (!s || seenTitle[s]) return;
      seenTitle[s] = true;
      if (uniq.length < BACKLINK_MAX_TITLES) uniq.push(s);
    });
    if (!uniq.length) return counts;

    // 固定データモードでは外部APIを叩かない。make-fixture.mjs が保存した対応表を使う。
    if (fixtureData) {
      var table = fixtureData.backlinks || null;
      if (!table) return counts;
      uniq.forEach(function (t) {
        if (typeof table[t] === 'number') counts[t] = table[t];
      });
      return counts;
    }

    // R171: Wikimedia のマナー上、バッチ間も同時に投げない(直列化)。
    // chunk().map(async)+allSettled だった並列発行を for...of + try/catch に変えた。
    // バッチ内はもともと while ループで順番に continue を追っており並列ではない。
    var backlinkBatches = chunk(uniq, BACKLINK_BATCH_SIZE);
    for (var biBl = 0; biBl < backlinkBatches.length; biBl++) {
      var batch = backlinkBatches[biBl];
      try {
      // 正規化・リダイレクトの対応(元の title → API が返す実際の記事名)。
      var alias = Object.create(null);
      /** title を API が実際に数えている記事名に解決する(正規化→転送で2段のことがある)。 */
      function resolveTitle(t) {
        var x = t;
        for (var i = 0; i < 3 && alias[x]; i++) x = alias[x];
        return x;
      }

      var live = batch.slice();  // まだ数え終わっていない記事名
      var sub = Object.create(null);  // 今の引き直し単位での集計
      var cont = null;
      var reqs = 0;

      /** live に残っている記事名を、今の集計値で確定させる。 */
      function settle(titlesToSettle) {
        titlesToSettle.forEach(function (t) {
          if (typeof counts[t] !== 'number') counts[t] = sub[resolveTitle(t)] || 0;
        });
      }

      while (live.length && reqs < BACKLINK_MAX_CONTINUE) {
        var params = new URLSearchParams({
          action: 'query',
          format: 'json',
          prop: 'linkshere',
          titles: live.join('|'),
          lhnamespace: '0',      // 標準名前空間のリンクだけ数える(ノート・利用者ページを除く)
          lhlimit: 'max',
          lhprop: 'title',
          redirects: '1',
          origin: '*'
        });
        if (cont) {
          Object.keys(cont).forEach(function (k) { params.set(k, cont[k]); });
        }

        var res = await fetchWithTimeout(
          WIKIPEDIA_API_URL + '?' + params.toString(),
          { method: 'GET', headers: { Accept: 'application/json' } },
          TIMEOUT_FAME_MS,
          '被リンク数の取得がタイムアウトしました。'
        );
        reqs++;
        if (!res.ok) throw new Error('linkshere ' + res.status);
        var data = await res.json();
        var query = (data && data.query) || null;
        if (!query) break;

        var pages = query.pages || {};
        Object.keys(pages).forEach(function (pid) {
          var page = pages[pid];
          if (!page) return;
          if (page.missing !== undefined) {
            // 記事が存在しない(湯畑のように転送も無い名前)。0点で確定させる。
            if (typeof counts[page.title] !== 'number') counts[page.title] = 0;
            return;
          }
          sub[page.title] = (sub[page.title] || 0) + ((page.linkshere || []).length);
        });

        [].concat(query.normalized || [], query.redirects || []).forEach(function (m) {
          if (m && m.from && m.to) alias[m.from] = m.to;
        });

        cont = (data && data.continue) || null;
        if (!cont) { settle(live); live = []; break; }

        // continue が止まっている記事名。API は**記事名のコードポイント順**に処理するので、
        // これが「今どこまで数えたか」を指す。
        var head = String(cont.lhcontinue || '').split('|')[0];
        if ((sub[head] || 0) >= BACKLINK_SATURATE) {
          // head は打ち切り本数に達した。これ以上数えても加点は変わらないので、
          // head と **head より前(コードポイント順)= 既に数え終わった記事名**を確定させ、
          // 残りだけで引き直す。引き直すので lhcontinue は捨てる。
          //
          // ★ 比較は必ず素のコードポイント順(`<`)で行うこと。localeCompare('ja') は
          //   MediaWiki の照合順と一致せず、確定させる範囲がずれて全件0になる(実測)。
          var keep = [];
          live.forEach(function (t) {
            var x = resolveTitle(t);
            if (x === head || x < head) {
              if (typeof counts[t] !== 'number') counts[t] = sub[x] || 0;
            } else {
              keep.push(t);
            }
          });
          live = keep;
          cont = null;
          sub = Object.create(null);
        }
      }

      // 回数上限で抜けた分も、取れているところまでで確定させる(0点にはしない)。
      settle(live);
      } catch (e) {
        // 一部のバッチが落ちても他の結果は活かす(取れなかった分は欠損=0点扱い)。
      }
    }
    return counts;
  }

  // ---------------------------------------------------------------------------
  // 親記事の本文照合 (fetchParentMentions) — R164
  // ---------------------------------------------------------------------------

  /**
   * R188: 住所の地名から **親記事名の候補を複数** 作る(純粋関数)。
   *
   * R186 までは候補を1本しか作っておらず、市場調査 第14回 の全国実測で
   * **15件中1件(7%)しか実在記事に当たっていない**ことが判明した。原因は
   * 「住所の最小要素 + 温泉」という組み立て方そのもの:
   *   - 有馬は `有馬町` → 「有馬**町**温泉」になり、正解「有馬温泉」を外す
   *   - 登別は `登別温泉町` → 「登別温泉**町温泉**」になり、正解「登別温泉」を外す
   * どちらも **末尾の「町」を落とせば当たる**。記事が無いのではなく、名前の作り方が
   * 当たっていないだけだった。
   *
   * そこで1つの地名から次の形を作って候補に並べる(狭い・素直な順):
   *   1. そのまま(既に「◯◯温泉」ならそれ自体 / でなければ + 温泉)
   *   2. 末尾の数字・方角を落とした形(`定山渓温泉西4` → `定山渓温泉`)
   *   3. 末尾の「町/村」、先頭の「大字/字」を落とした形(`有馬町` → `有馬温泉`)
   *
   * ★ **リクエストは増えない**: 候補を複数作るが、実際に本文を引きに行くのは
   *   `parentArticleTitle` が選んだ **1本だけ**。`titles=` に候補を並べる案は実測で
   *   却下した — `prop=extracts` は `titles` を並べても本文を1件しか返さず
   *   (`exlimit` は全文取得だと1に強制される)、**どの1件が返るかを選べない**。
   *   実測では `草津温泉|草津` を投げると曖昧さ回避寄りの「草津」(741字)の方が返り、
   *   正しい「草津温泉」(本文数千字)を取り逃がす。`exintro=1` なら複数返せるが
   *   181字程度の導入文しか来ず、R164 の本文照合には足りない。
   *
   * ★ **拾う地名は従来どおり「最初の1要素」だけ**にする。2要素目まで広げると実測で
   *   別府の宿が秋田の「山の手温泉」を拾った(地名としては実在するが別の土地)。
   *   外れても加点0で壊れはしないが、広げても正解は1件も増えなかったので広げない。
   *
   * R186: 道路名(しゃくなげ通り)は地名ではないので飛ばす。R188 で「◯◯橋・◯◯坂・
   * 国道◯号・◯◯林道」も同じ理由で飛ばすようにした(実測: 積善館の住所は
   * 1要素目が「慶雲橋」で、飛ばすと正解の「四万温泉」に届く)。
   *
   * @param {string} display Nominatim の display_name
   * @returns {string[]} 親記事名の候補(空配列なら決められなかった)
   */
  function parentArticleCandidates(display) {
    if (typeof display !== 'string' || !display) return [];
    var parts = display.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var out = [];
    function push(t) {
      if (!t || t.length < 2) return;
      if (out.indexOf(t) > -1) return;
      out.push(t);
    }
    // 先頭は宿そのものの名前なので飛ばす。番地・郵便番号・国名は地名にならないので除く。
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (!p || p === '日本' || /^[0-9０-９\-−ー\s]+$/.test(p)) continue;
      // R186/R188: **道路・橋・坂は地名ではない**ので飛ばす。Nominatim は宿名の次に
      // street を入れることがあり(実測: 草津は「しゃくなげ通り」、積善館は「慶雲橋」、
      // 有馬は「万年坂」、鎌倉は「国道134号」)、ここで止まると実在しない記事名になって
      // 親記事の加点が**エリアごと全滅**する(R185が見た草津の症状そのもの)。
      if (/(通り|通|丁目|道|街道|筋|線|号線|号|橋|坂|林道)$/.test(p)) continue;
      // 都道府県・郡まで上がると「その土地の解説」ではなくなるので、そこまで来たら諦める。
      if (/(都|道|府|県|郡)$/.test(p)) break;

      // 末尾の数字・方角を落とす(定山渓温泉西4 → 定山渓温泉)。
      var trimmed = p.replace(/[0-9０-９]+$/, '').replace(/[東西南北中]$/, '');
      var forms = [p];
      if (trimmed && forms.indexOf(trimmed) < 0) forms.push(trimmed);
      // 末尾の「町/村」・先頭の「大字/字」を落とした形も足す(有馬町 → 有馬)。
      forms.slice().forEach(function (f) {
        var bare = f.replace(/^(大字|字)/, '').replace(/[町村]$/, '');
        if (bare && forms.indexOf(bare) < 0) forms.push(bare);
      });
      forms.forEach(function (f) {
        if (!f || f.length < 2) return;
        // 既に「◯◯温泉」ならそのまま。そうでなければ温泉地名として引き直す。
        push(/温泉$/.test(f) ? f : f + '温泉');
      });
      break; // 拾うのは最初の地名1要素だけ(上のコメント参照)
    }
    return out;
  }

  /**
   * R189: 記事名が「◯◯温泉」(温泉地そのもの)かどうか。
   *
   * ★ **末尾が「温泉」でなければ弾く**のが肝。geosearch の近傍記事には
   *   `草津温泉バスターミナル`・`道後温泉駅`・`道後温泉本館`・`草津温泉スキー場`・
   *   `浜田温泉資料館`・`草津町立温泉図書館` のような **施設の記事**が大量に混ざる
   *   (実測・全国18宿)。これらは温泉地の解説記事ではないので親記事にしてはいけない。
   *   「温泉」を含むだけの緩い判定にすると、道後は最寄りが `道後温泉駅`(この宿からは
   *   本物の `道後温泉` より近い)になって外す。
   *
   * 許すのは次の2つだけ:
   *   - `◯◯温泉` … 有馬温泉・別府温泉・銀山温泉
   *   - `◯◯温泉郷` … 乳頭温泉郷(鶴の湯温泉の親はこちら)
   * どちらも曖昧さ回避の括弧が付くことがある(`沢渡温泉 (群馬県)`・
   * `鶴の湯温泉 (秋田県)`)ので、末尾の括弧だけは許して中身は見ない。
   *
   * @param {string} title 記事名
   * @returns {boolean}
   */
  function looksOnsenAreaTitle(title) {
    if (typeof title !== 'string') return false;
    return /^[^(（]{2,}?温泉郷?(\s*[(（][^)）]*[)）])?$/.test(title.trim());
  }

  /** R189: 曖昧さ回避の括弧を落とした記事名(`鶴の湯温泉 (秋田県)` → `鶴の湯温泉`)。 */
  function stripDisambig(title) {
    return typeof title === 'string' ? title.replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim() : '';
  }

  /**
   * R189: **宿の座標の近くにある「◯◯温泉」記事**を親記事として選ぶ(純粋関数)。
   *
   * ### なぜこれが要るのか
   * R188 は住所(Nominatim の display_name)の1要素目から記事名を組み立てており、
   * 全国18宿で実在率 6%→33% まで上げたが、そこで頭打ちになっていた。残り12件は
   * 住所の1要素目が **行政区名や小字** で、どう加工しても温泉地名に化けないため:
   *   - 玉の湯 → `湯布院町川上` (正解 由布院温泉)
   *   - 能登屋旅館 → `銀山新畑` (正解 銀山温泉)
   *   - 道後プリンス → `道後姫塚` (正解 道後温泉)
   *   - 杉乃井 → `南立石`/`鶴見園町` (正解 別府温泉)
   *   - 指宿白水館 → `指宿市` (正解 指宿温泉)
   * **住所の文字列をどう加工しても届かない**。そこで座標から直接探す。
   *
   * ### ★リクエストは1本も増えない
   * `fetchWikiNearby`(geosearch)の結果を **engine.js が既に持っている** ので、
   * それを受け取って選ぶだけ。fixtures を調べたところ5エリアすべてで正解の
   * 温泉地記事が既にこの結果の中にあった(草津温泉 idx=1 / 別府温泉 idx=5 /
   * 道後温泉 idx=51 / 箱根温泉 idx=13 / 城崎温泉 idx=6)。**追加照会は不要**。
   *
   * ### 選び方(実測で決めた)
   * 1. 記事名が `◯◯温泉` / `◯◯温泉郷` のものだけに絞る(looksOnsenAreaTitle)
   * 2. **宿自身の記事を除く**。宿名がそのまま温泉地名のことがあり(鶴の湯温泉)、
   *    除かないと自分の記事を親に選んで本文照合が空振りする。除くと正解の
   *    `乳頭温泉郷`(541m)に届く。
   * 3. **宿から近い順**で先頭を採る。
   *
   * ★ 「記事が長い順」ではなく「近い順」にした理由(実測): geosearch の extract は
   *   `exsentences=2` の抜粋で、本文の長さを表さない(正解の有馬温泉・道後温泉は
   *   extract が0字で返ることすらある)。長さで選ぶと **遠い別の温泉地**(杉乃井から
   *   9.9km の由布院温泉など)を引きかねない。近さは座標由来で常に正確なので近さを採る。
   *
   * ★ 外しても実害は無い: 別の温泉地の記事を引いても、本文に手元の候補名が出なければ
   *   ヒット0件 = 加点なし = 変更前と同じ並びになるだけ。
   *
   * @param {Object} hotel 宿(name を自己除外に使う)
   * @param {Array} nearby fetchWikiNearby が返した記事の配列(title/distanceM を見る)
   * @returns {string} 親記事名。見つからなければ空文字
   */
  function parentTitleFromNearby(hotel, nearby) {
    if (!Array.isArray(nearby) || !nearby.length) return '';
    var self = hotel && typeof hotel.name === 'string' ? hotel.name.trim() : '';
    var best = null;
    nearby.forEach(function (a) {
      if (!a || !looksOnsenAreaTitle(a.title)) return;
      var bare = stripDisambig(a.title);
      if (!bare || (self && bare === self)) return; // 宿自身は親ではない
      var d = isFinite(a.distanceM) ? a.distanceM : Infinity;
      if (!best || d < best.d) best = { title: bare, d: d };
    });
    return best ? best.title : '';
  }

  /**
   * R164/R188: その土地の親記事名の候補を決める。**探索はしない**(市場調査 第6回 2-1)。
   *
   * 固定データモードでは `meta.label` をそのまま使う。実測で5エリア中5エリアが
   * `redirects=1` 込みでそのまま実在記事に解決した(箱根湯本→湯本 (箱根町))ので、
   * 「宿の座標から最寄りの温泉地記事を探す」ような仕組みは要らない。
   * ★固定データモードの挙動は R188 でも一切変えていない(候補は常に1本)。
   *
   * 本番(ネットワーク)では `meta.label` に当たるものが無いので、Nominatim が返した
   * 住所(displayName)から parentArticleCandidates で候補を作り、**最後の1本**
   * (= 最も剥がした形)を採用する。
   *
   * ★ なぜ「最後」で決め打ちできるのか(実測・全国18宿):
   *   候補を全部 Wikipedia に照会して「実在する先頭」を採る方式と、照会せずに
   *   「最後の候補」を採る方式は、**18件すべてで同じ記事に着地した**。
   *   剥がす前の形(有馬町温泉・登別温泉町温泉)は温泉地の記事名として実在しないので、
   *   実在確認をしても結局は剥がした形が選ばれる。だから **照会は要らない** =
   *   リクエストは1本のまま、成功率だけが上がる。
   *
   * ★ 外れても実害は無い: 存在しない記事なら extract が空で返り、ヒット0件=何も起きない。
   *
   * R189: 本番では **まず座標から探す**(parentTitleFromNearby)。見つからなければ
   * 従来どおり住所から組み立てる。この順にした理由は実測(全国18宿):
   *   - 座標由来が当たった11件は **R188 が当てた6件を全部含み**、内容も完全に一致した。
   *     つまり座標を優先しても R188 の成果は1件も失われない。
   *   - 座標由来が空になるのは近傍に温泉地の記事が無いとき(俵屋旅館・水明館)で、
   *     そこは住所由来に任せれば従来と同じ挙動になる。
   * ★固定データモードは R188 と同じく **一切変えていない**(`meta.label` をそのまま使う)。
   *
   * @param {Object} hotel 宿
   * @param {Array} [nearby] R189: geosearch が返した近傍記事。engine.js が渡す
   * @returns {string} 親記事名。決められなければ空文字
   */
  function parentArticleTitle(hotel, nearby) {
    if (fixtureData) {
      var label = fixtureData.meta && fixtureData.meta.label;
      return typeof label === 'string' ? label.trim() : '';
    }
    // R189: 座標から探すほうが住所の言葉遊びより強い(実測 33% → 67%)。
    var byCoord = parentTitleFromNearby(hotel, nearby);
    if (byCoord) return byCoord;
    var display = hotel && typeof hotel.displayName === 'string' ? hotel.displayName : '';
    var cands = parentArticleCandidates(display);
    return cands.length ? cands[cands.length - 1] : '';
  }

  /**
   * R164: 親記事の本文に名前が出てくる候補を洗い出す。
   *
   * **やっていること**: 親記事の本文を1本だけ取り、**手元の候補の名前が本文に出るか**を見る。
   * 本文から名前を抽出するのではない(抽出すると人名や地名が大量に出てきて使えない)。
   * OSM 側に実在する名前だけが照合対象なので、突き合わせが事実上のフィルタになり、
   * 実測では名前付きPOI 4,244件に対してヒットは55件(1.3%)に絞られる。
   *
   * **★拾った名前から記事を引いてはいけない**(市場調査 第6回 3-4・3-5):
   *   - 「一の湯」の Wikipedia 記事は **箱根の老舗旅館** で、城崎の外湯ではない。
   *     記事を引くと城崎の外湯に箱根の旅館の写真と要約が付く。
   *   - 別府の地獄7つは「別府地獄めぐり」への **リダイレクト** なので、記事を引くと
   *     8件全部に同じ親記事の要約が付き、被リンクも親の値で同点になる
   *     (R162 実装前に道後温泉本館で起きた事故の再発)。
   * この関数が返すのは **「本文に出た」という名前の集合だけ**。写真・要約・被リンクは
   * 一切配らない。engine.js 側も一律加点にしてあること。
   *
   * 負荷: **1エリアあたり1リクエスト**。`prop=extracts&explaintext=1` は titles を
   * 並べても1リクエスト1記事しか返らない(第6回 1-2)が、親記事は1本なので実害が無い。
   *
   * 失敗しても致命的ではない(誰も加点されない = 変更前と同じ並び)ので例外は握りつぶす。
   *
   * R173: 返す値に `_image`(親記事の代表画像)を同梱するようになった。取得は
   * **同じ1リクエストの `prop` に `pageimages` を足すだけ**で、リクエスト数は増えない。
   * 配るかどうかの判断は engine.js 側(pickParentImageTarget)が持つ。
   *
   * R189: 第3引数に geosearch の近傍記事を受け取り、親記事名を **座標から** 決める。
   * engine.js が既に持っている結果を渡すだけなので **リクエストは1本も増えない**。
   *
   * @param {Object} hotel 宿。fixture モードでは使われない
   * @param {string[]} names 候補の名前(OSM/Wikipedia 由来の表示名)
   * @param {Array} [nearby] R189: fetchWikiNearby が返した近傍記事(親記事名の決定に使う)
   * @returns {Promise<Object>} 本文に出た名前をキーに出現回数を持つ表。
   *          R173: 親記事に代表画像があれば `_image` に {url, file} を添える。失敗時は空
   */
  async function fetchParentMentions(hotel, names, nearby) {
    var hits = Object.create(null);
    if (!Array.isArray(names) || !names.length) return hits;

    var title = parentArticleTitle(hotel, nearby);
    if (!title) return hits;

    var text = '';
    var image = null;
    var resolved = title;
    if (fixtureData) {
      // 固定データモードでは外部APIを叩かない。make-fixture.mjs が保存した本文を使う。
      // R175: make-fixture.mjs 側で昇格の判定まで済ませてあるので、ここに入っているのは
      // **採用後の最終的な親記事**。固定データモードでは追加の判定をしない。
      text = typeof fixtureData.parentExtract === 'string' ? fixtureData.parentExtract : '';
      image = fixtureData.parentImage || null;
      // R183: 昇格が起きたエリア(箱根)では make-fixture.mjs が採用後の名前を
      // parentTitle に残している。本番の resolved と同じものを入れておく。
      if (typeof fixtureData.parentTitle === 'string' && fixtureData.parentTitle) {
        resolved = fixtureData.parentTitle;
      }
    } else {
      var first = await fetchParentArticle(title);
      if (!first) return hits; // 誰も加点されない = 変更前と同じ並び
      text = first.text;
      image = first.image;
      resolved = first.title || title;
    }

    if (!text) return hits;
    var matched = matchParentMentions(text, names);

    // R175: 親記事が痩せていて1件も拾えないときだけ、記事名の括弧から上位概念へ昇格する。
    // 固定データモードでは make-fixture.mjs が同じ判定を済ませているので何もしない。
    if (!fixtureData) {
      var promoted = await promoteParentIfThin(resolved, text, matched, names);
      if (promoted) {
        matched = promoted.hits;
        image = promoted.image;
      }
    }

    // R183: 採用した親記事の名前を同梱する。**親記事そのものが候補に混ざっている**
    // ことがあり(本番の草津では geosearch が「草津温泉」を46m先の記事として返す)、
    // その1件を素通しすると R173 の写真配りが乗っ取られる。詳細は
    // pickParentImageTarget の「条件0」を参照。固定データでも本番でも同じ名前が入る。
    matched._title = resolved;
    if (image && image.url) matched._image = image;
    return matched;
  }

  /**
   * R175: 親記事を1本だけ引く(ネットワーク)。fetchParentMentions が1本目と
   * 昇格後の2本目の **両方で同じ条件を使う** ために切り出した。
   *
   * ★ scripts/make-fixture.mjs の fetchParentExtract と同条件にすること
   *   (prop=extracts|pageimages&explaintext=1&redirects=1&pithumbsize=480、1リクエスト1記事)。
   *
   * @param {string} title 記事名
   * @returns {Promise<{title:string,text:string,image:Object|null}|null>} 失敗時は null
   */
  async function fetchParentArticle(title) {
    var cacheKey = 'parent:' + title;
    var cached = cacheGet(cacheKey);
    // R173 より前のキャッシュは文字列で入っているので、両方の形を受ける。
    if (cached && typeof cached === 'object' && typeof cached.text === 'string') {
      return { title: cached.title || title, text: cached.text, image: cached.image || null };
    }
    if (typeof cached === 'string') {
      return { title: title, text: cached, image: null };
    }

    var text = '';
    var image = null;
    var resolved = title;
    try {
      var params = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        // R173: pageimages を足しても **リクエストは1本のまま**。親記事の代表画像
        // (草津温泉なら湯畑の写真)を、同じ応答で受け取るためのパラメータ追加。
        prop: 'extracts|pageimages',
        explaintext: '1',   // HTML ではなく素のテキストで受け取る(後処理が要らない)
        redirects: '1',     // 箱根湯本→湯本 (箱根町) のような転送を吸収する
        pithumbsize: '480', // カードの写真と同じ幅(fetchWikiNearby に合わせる)
        titles: title,
        origin: '*'
      });
      var res = await fetchWithTimeout(
        WIKIPEDIA_API_URL + '?' + params.toString(),
        { method: 'GET', headers: { Accept: 'application/json' } },
        TIMEOUT_FAME_MS,
        '親記事の取得がタイムアウトしました。'
      );
      if (!res.ok) throw new Error('extracts ' + res.status);
      var data = await res.json();
      var pages = (data && data.query && data.query.pages) || [];
      // formatversion=2 なので pages は配列。記事が無ければ missing で返る。
      for (var i = 0; i < pages.length; i++) {
        if (pages[i] && typeof pages[i].extract === 'string') {
          text = pages[i].extract;
          image = parentImageFromPage(pages[i]);
          // R175: 昇格の判定には **転送を解決した後の記事名** が要る
          // (入力の「箱根湯本」には括弧が無く、解決後の「湯本 (箱根町)」に括弧が付く)。
          if (typeof pages[i].title === 'string' && pages[i].title) resolved = pages[i].title;
          break;
        }
      }
      // 記事が無かった場合も空で覚える(同じ宿で毎回引き直さない)。
      cacheSet(cacheKey, { title: resolved, text: text, image: image }, TTL_FAME_MS);
    } catch (e) {
      return null;
    }
    return { title: resolved, text: text, image: image };
  }

  /**
   * R175: ゲートが発火したときだけ上位概念の記事を引き直し、
   * **ヒットが増えたときだけ** 採用する(安全弁)。
   *
   * ★ scripts/make-fixture.mjs の promoteParent と同じ手順にすること。
   *
   * 負荷: ゲートが発火したエリアだけ **+1リクエスト**。実測では5エリア中箱根のみで、
   * 他4エリアは1本目でゲートを通らないので増分ゼロ。
   *
   * @returns {Promise<{hits:Object,image:Object|null}|null>} 採用しないなら null
   */
  async function promoteParentIfThin(resolvedTitle, text, matched, names) {
    var hitCount = Object.keys(matched).length;
    var next = parentPromoteTitle(resolvedTitle, text, hitCount, names.length);
    if (!next) return null;

    var article = await fetchParentArticle(next);
    if (!article || !article.text) return null;

    var reHits = matchParentMentions(article.text, names);
    // ★安全弁: ヒットが増えたときだけ採用する。減る・同数なら元に戻す。
    // これで「壊れる方向には動けない」ことをコード自身が保証する。
    if (Object.keys(reHits).length <= hitCount) return null;

    return { hits: reHits, image: article.image };
  }

  /**
   * R173: Wikipedia の1ページ分の応答から代表画像を取り出す(純粋関数)。
   * `thumbnail.source` が表示用URL、`pageimage` が Commons のファイル名。
   * ファイル名は誤爆判定(isParentImageClaimedByOther)にしか使わないが、
   * **判定に使う以上 URL から切り出すのではなく API が返した値をそのまま持つ**。
   *
   * ★ assets/geo.js と scripts/make-fixture.mjs で同じ形を作ること。
   *
   * @returns {{url:string,file:string}|null} 画像が無ければ null
   */
  function parentImageFromPage(page) {
    if (!page) return null;
    var url = page.thumbnail && typeof page.thumbnail.source === 'string'
      ? page.thumbnail.source : '';
    if (!url) return null;
    var file = typeof page.pageimage === 'string' ? page.pageimage : '';
    return { url: url, file: file };
  }

  /**
   * R173: 親記事の代表画像のファイル名を「何を写しているかの固有語」に分解する(純粋関数)。
   *
   * エリア名(kusatsu / beppu)と一般語(onsen / station)を落とすと、
   * その画像の被写体を表す語だけが残る:
   *   `Yubatake_(Kusatsu_Onsen).jpg`          → ['yubatake']
   *   `Beppu_Tower02s4s3200.jpg`              → ['tower']
   *   `Hakone-Yumoto_Station_square_2011…jpg` → ['yumoto']
   * 数字で始まる後ろ(Tower02s4s3200 の 02s4s3200)は撮影IDなので切り落とす。
   *
   * @param {string} file Commons のファイル名
   * @param {string} areaKey fixture の meta.area / 宿の土地を表すローマ字(小文字)
   * @returns {string[]} 固有語(3文字以上)。無ければ空配列
   */
  function parentImageTokens(file, areaKey) {
    if (typeof file !== 'string' || !file) return [];
    var area = typeof areaKey === 'string' ? areaKey.toLowerCase() : '';
    return file
      .replace(/\.[a-z0-9]+$/i, '')        // 拡張子
      .replace(/[_()\-.]/g, ' ')
      .split(/\s+/)
      .map(function (s) { return s.replace(/[0-9]+.*$/, '').toLowerCase(); })
      .filter(function (s) {
        if (s.length < 3) return false;
        if (PARENT_IMAGE_GENERIC_TOKENS.indexOf(s) > -1) return false;
        // エリア名そのもの(kusatsu/kinosaki)は被写体を表さないので落とす
        if (area && (s.indexOf(area) > -1 || area.indexOf(s) > -1)) return false;
        return true;
      });
  }

  /**
   * R173: 親記事の代表画像が **自分以外の候補** を名指ししていないかを見る(純粋関数)。
   *
   * **これが誤爆を止める最後の砦**。実測(市場調査 第11回の未検証部分を本回で埋めた):
   *   - 別府の親記事の代表画像は `Beppu_Tower02s4s3200.jpg` で、固有語は [tower]。
   *     一方で **別府タワー** が自分の代表画像 `Beppu_Tower_20230212.jpg` を持っており、
   *     固有語が [tower] で一致する。→ **この画像は別府タワーのものであって、
   *     最多言及の明礬温泉のものではない。配ってはいけない。**
   *   - 草津の `Yubatake_(Kusatsu_Onsen).jpg` の固有語 [yubatake] は、
   *     他のどの候補の画像名にも出てこない。→ 配ってよい。
   *
   * **候補名をローマ字化して「合っているか」を確かめる方向は採らない**(変換表が当てにならず、
   * 過信すると誤爆する)。やるのは「他の誰かのものだと分かる場合に降りる」という否定判定だけ。
   *
   * @param {string[]} tokens 親記事の代表画像の固有語
   * @param {Array} items 全候補(写真を持つものだけが判定に効く)
   * @param {Object} target 配ろうとしている候補(自分自身は衝突とみなさない)
   * @param {string} areaKey エリア名のローマ字
   * @returns {boolean} true なら「別の候補のもの」= 配らない
   */
  function isParentImageClaimedByOther(tokens, items, target, areaKey) {
    if (!tokens || !tokens.length) return true; // 固有語が無い=何を写しているか分からない
    for (var i = 0; i < (items || []).length; i++) {
      var it = items[i];
      if (!it || it === target || !it.imageUrl) continue;
      var other = parentImageTokens(commonsFileFromUrl(it.imageUrl), areaKey);
      for (var j = 0; j < other.length; j++) {
        if (tokens.indexOf(other[j]) > -1) return true;
      }
    }
    return false;
  }

  /**
   * R173: Wikipedia のサムネイルURLから Commons のファイル名を切り出す(純粋関数)。
   * `…/commons/thumb/3/38/Beppu_Tower_20230212.jpg/500px-….jpg` の中ほどが元ファイル名。
   * 候補側の imageUrl はこの形でしか持っていないので、誤爆判定のためにここで戻す。
   *
   * @returns {string} 取り出せなければ空文字
   */
  function commonsFileFromUrl(url) {
    if (typeof url !== 'string' || !url) return '';
    var m = /\/([^/]+)\/\d+px-/.exec(url);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  /**
   * R173: 親記事の代表画像を配る相手を1件だけ選ぶ(純粋関数)。**該当が無ければ null**。
   *
   * 市場調査 第11回 11-7 の答え「**厳しく絞り、当たらないエリアでは何もしない**」を
   * そのまま条件にしてある。4つ全部を通った候補にだけ配る:
   *
   *   1. 親記事での言及回数が **最多** であること
   *   2. その回数が PARENT_IMAGE_MIN_MENTION(5)以上で、2位の PARENT_IMAGE_LEAD_RATIO(2)倍以上
   *      ＝ **明確に突出している**こと。横並びのエリアでは誰も選ばれない
   *   3. その候補が **まだ写真を持っていない**こと(既存の写真を上書きしない)
   *   4. 画像のファイル名が **別の候補を名指ししていない**こと(isParentImageClaimedByOther)
   *
   * 5エリアの実測(2026-09-19):
   *   草津  湯畑35回 vs 万代鉱源泉10回・写真なし・固有語[yubatake]衝突なし → **配る**
   *   城崎  一の湯3回 vs さとの湯3回(同点)                                  → 配らない(条件2)
   *   別府  明礬温泉20回 vs 浜脇温泉9回だが固有語[tower]が別府タワーと衝突    → 配らない(条件4)
   *   道後  椿の湯4回 vs 湯築城4回(同点)・固有語[dōgo]も道後温泉本館と衝突   → 配らない(条件2,4)
   *   箱根  小田急箱根3回(5回未満)・既に写真あり                            → 配らない(条件2,3)
   *
   * @param {Array} items 全候補(parentMention / imageUrl を見る)
   * @param {{url:string,file:string}} image 親記事の代表画像
   * @param {string} areaKey エリア名のローマ字(fixture の meta.area / 本番は空でよい)
   * @returns {Object|null} 配る相手の候補。該当が無ければ null
   */
  /**
   * R183: 親記事の名前と候補の名前を突き合わせるための正規化。
   *
   * 見るのは「この候補は親記事そのものか」だけなので、**曖昧さ回避の括弧を落として
   * 前後の空白を詰めるだけ**に留める。ここを緩めて部分一致にすると、
   * 「草津温泉」に対して「草津温泉スキー場」まで巻き込んでしまう。
   * engine.js の stripDisambiguation と同じ形だが、geo.js は engine.js に依存しない。
   */
  function normalizeParentName(name) {
    if (typeof name !== 'string') return '';
    return name.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();
  }

  function pickParentImageTarget(items, image, areaKey, parentTitle) {
    if (!image || !image.url || !Array.isArray(items) || !items.length) return null;

    // 条件0(R183): **親記事そのものを数えない**。
    //
    // **本番でだけ起きていた事故**: 草津の geosearch は宿の46m先に「草津温泉」の記事を
    // 返すので、親記事自身が1件の候補として並ぶ。その名前は当然ながら本文に最も多く
    // 出る(実測117回 vs 湯畑35回)ため条件1の1位を必ず取り、しかも自分の記事写真を
    // 持っているので条件3で null になる。つまり **親記事が候補に混ざったエリアでは
    // R173 が丸ごと無効化され**、湯畑は写真25点を受け取れないまま #3 に沈んでいた。
    // 固定データでは宿名が「草津温泉(固定データ)」で isHotelItself が親記事を
    // 偶然弾いていたため、この事故は5エリアの dump-rank に一度も現れなかった。
    //
    // 親記事は「その土地そのもの」であって、その土地の中で行く先ではない。R173 が
    // 配ろうとしているのは「親記事が最も多く語った**行き先**」なので、親記事自身は
    // 母数から外すのが趣旨どおり。parentTitle が無い(取れなかった)ときは従来どおり。
    var parentName = typeof parentTitle === 'string' ? normalizeParentName(parentTitle) : '';
    // 親記事そのものを除いた母数。条件1(言及回数)と条件4(画像の衝突)の**両方**で使う。
    // ★条件4でも外すのが要:親記事の候補は当然その代表画像を持っているので、
    //   残したままだと `Yubatake_(Kusatsu_Onsen).jpg` の固有語 [yubatake] を
    //   「別の候補のもの」と誤認し、湯畑への配布が条件4で止まる(実測で確認)。
    var pool = parentName
      ? items.filter(function (it) {
        return it && normalizeParentName(it.name) !== parentName;
      })
      : items;

    // 条件1: 言及回数の1位と2位を出す
    var ranked = pool
      .filter(function (it) { return it && it.parentMention > 0; })
      .sort(function (a, b) { return b.parentMention - a.parentMention; });
    if (!ranked.length) return null;

    var top = ranked[0];
    var second = ranked[1] ? ranked[1].parentMention : 0;

    // 条件2: 回数が下限以上で、かつ2位に対して明確に突出していること
    if (top.parentMention < PARENT_IMAGE_MIN_MENTION) return null;
    if (top.parentMention < second * PARENT_IMAGE_LEAD_RATIO) return null;

    // 条件3: 既に写真を持っているなら何もしない(上書きしない)
    if (top.imageUrl) return null;

    // 条件4: その画像が別の候補のものだと分かるなら降りる
    var tokens = parentImageTokens(image.file || commonsFileFromUrl(image.url), areaKey);
    if (isParentImageClaimedByOther(tokens, pool, top, areaKey)) return null;

    return top;
  }

  /**
   * R173: エリア名のローマ字(kusatsu / beppu)を求める。
   *
   * 固定データモードでは `meta.area` がそのものなので、それを使う。
   * 本番にはそれが無いので、**候補の画像ファイル名に何度も出てくる語**を
   * 土地の名前とみなす(草津の候補は Kusatsu_Onsen_Bus_Terminal・Kusatsu-Onsen-Sta と
   * 揃って `kusatsu` を含む)。**この語を落とさないと、土地の名前が入っただけの
   * 無関係な画像同士が「衝突」と判定され、配れるはずの草津まで落ちてしまう。**
   *
   * @param {Array} items 全候補
   * @returns {string} エリア名のローマ字。決められなければ空文字
   */
  function parentAreaKey(items) {
    var area = fixtureData && fixtureData.meta && fixtureData.meta.area;
    if (typeof area === 'string' && area) return area.toLowerCase();

    // 本番: 3件以上の候補の画像名に共通して出る語を土地の名前とみなす。
    var tally = Object.create(null);
    (items || []).forEach(function (it) {
      if (!it || !it.imageUrl) return;
      var seen = Object.create(null);
      parentImageTokens(commonsFileFromUrl(it.imageUrl), '').forEach(function (t) {
        if (seen[t]) return;
        seen[t] = 1;
        tally[t] = (tally[t] || 0) + 1;
      });
    });
    var best = '';
    Object.keys(tally).forEach(function (t) {
      if (tally[t] >= 3 && (!best || tally[t] > tally[best])) best = t;
    });
    return best;
  }

  /**
   * R164: 本文と候補名の突き合わせ(純粋関数)。fetchParentMentions と
   * scripts/make-fixture.mjs の両方から同じ条件で使えるよう切り出してある。
   *
   * 条件は市場調査 第6回の実測どおり:
   *   - 2文字以上(★3文字以上にすると柳湯・湯畑が落ちる)
   *   - 汎用語ブロックリストに載っている名前は弾く(これが無いと誤爆7.1%)
   *   - 単純な部分文字列一致(本文は explaintext の素テキスト)
   *
   * R168: 返す値を `true` から **本文中の出現回数** に変えた。二値だと同じ徒歩圏の
   * 主役と脇役が区別できなかったため(草津で湯畑35回・白旗源泉2回・御座之湯1回が
   * 全員同じ40点になり、湯畑が more から上がれなかった)。
   * 呼び出し側は真偽値としても使えるので、0件=加点なしの扱いは変わらない。
   *
   * @returns {Object} 本文に出た名前をキーに**出現回数**(1以上)を持つ表
   */
  function matchParentMentions(text, names) {
    var hits = Object.create(null);
    if (typeof text !== 'string' || !text) return hits;
    (names || []).forEach(function (raw) {
      var name = typeof raw === 'string' ? raw.trim() : '';
      if (name.length < PARENT_MENTION_MIN_CHARS) return;
      if (name.length > PARENT_MENTION_MAX_CHARS) return;
      if (PARENT_MENTION_BLOCK.indexOf(name) > -1) return;
      if (hits[name]) return;
      // R168: true ではなく **出現回数** を返す(engine.js が強さに応じて配点する)。
      // 数えるのは単純な部分文字列の重なりなし走査。正規表現を使わないのは、
      // 名前に正規表現のメタ文字(括弧・ドット)が入る候補があるため。
      var count = 0;
      var at = text.indexOf(name);
      while (at > -1) {
        count++;
        at = text.indexOf(name, at + name.length);
      }
      if (count > 0) hits[name] = count;
    });
    return hits;
  }

  /**
   * R175: 親記事が「その土地の解説として機能していない」かを判定し、
   * 機能していないなら昇格先の記事名を返す(純粋関数)。
   *
   * ★ assets/geo.js と scripts/make-fixture.mjs で **同じ関数を使うこと**
   *   (make-fixture.mjs は geo.js を eval して YadoGeo.parentPromoteTitle を呼ぶ)。
   *
   * 判定は2条件の AND(市場調査 第12回 12-2-2 を実測で補正したもの):
   *   - 本文が PARENT_PROMOTE_MAX_CHARS(2,000)字未満
   *   - 候補1,000件あたりの照合ヒットが PARENT_PROMOTE_MAX_HIT_RATE(10)未満
   * どちらか一方だけだと誤爆する。実測で5エリア中 **箱根だけ** が両方を満たす。
   *
   * 昇格先は **解決後の記事名の括弧の中身**。括弧が無ければ空文字を返す
   * (= 昇格しない)。他4エリアの記事名には括弧が無いので構造的に発火しえない。
   *
   * ★この関数は「昇格すべきか」までしか決めない。**実際に採用してよいかは
   * 引き直した本文で再照合し、ヒットが増えたときだけ**(呼び出し側の責任)。
   *
   * @param {string} title 解決後の親記事名(例: '湯本 (箱根町)')
   * @param {string} text 親記事の本文(explaintext)
   * @param {number} hitCount その本文での照合ヒット件数
   * @param {number} nameCount 照合にかけた候補の件数(割合の分母)
   * @returns {string} 昇格先の記事名。昇格しないなら空文字
   */
  function parentPromoteTitle(title, text, hitCount, nameCount) {
    var name = typeof title === 'string' ? title.trim() : '';
    if (!name) return '';
    var body = typeof text === 'string' ? text : '';
    // ゲート: 痩せていて、かつ候補の数のわりにほとんど拾えていないときだけ先へ進む。
    if (body.length >= PARENT_PROMOTE_MAX_CHARS) return '';
    var total = typeof nameCount === 'number' && nameCount > 0 ? nameCount : 0;
    if (!total) return ''; // 候補が無ければ割合を測れない = 判定しない
    if (!((hitCount / total) * 1000 < PARENT_PROMOTE_MAX_HIT_RATE)) return '';
    // 括弧から上位概念を取る。半角 () と全角 （）の両方を受ける
    // (ja.wikipedia の規約は半角+前後の空白だが、表記ゆれで全角が来ても拾えるようにする)。
    var m = name.match(/[(（]([^()（）]+)[)）]\s*$/);
    if (!m) return '';
    var parent = m[1].trim();
    if (!parent || parent === name) return '';
    return parent;
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
        ggslimit: '500',
        prop: 'coordinates|pageimages|extracts',
        // colimit/pilimit を max にしないと coordinates は1回10件・画像は1回50件しか
        // 返らず、ggslimit をいくら上げても「座標付きの使える記事」が増えない(実測)。
        colimit: 'max',
        pilimit: 'max',
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

    if (slowDelays.wiki > 0) await delay(slowDelays.wiki);

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
  // 記事名を名指しで引く (fetchWikiByTitles) — R166
  // ---------------------------------------------------------------------------

  /**
   * R166: 記事名を**名指しで**指定して、要約(extract)と写真(thumbnail)を取る。
   *
   * fetchWikiNearby(geosearch)が「座標から記事を探す」のに対し、こちらは
   * 「記事名が既に分かっているものを直接引く」。OSM の `wikipedia` タグや
   * R162 の Wikidata 経由で記事名が確定している候補を救うための経路。
   *
   * **取り違えが起きにくい経路である理由**: 突き合わせの鍵が記事名そのもので、
   * 距離や名前の類似では一切判定していない。ただし R162(Q番号)と違って
   * **タグの値が間違っていれば間違った記事が返る**ので、呼ぶ側(engine.js)が
   * どの記事名を渡すかの責任を持つ。実測では OSM 全349タグ中27件(7.7%)で
   * 名前とタグ値が食い違い、うち大半は旧字体(竈/竃・縣/県)や語順違いの
   * **同一施設**だった(R163 が同じ理由で部分文字列規則を採らなかったのと同じ実測)。
   *
   * `redirects=1` を付けているので `松山城 (伊予国)` → `松山城` のような転送も吸収する。
   * 返り値のキーは**呼び出し側が渡した記事名**(転送前)にしてあるので、
   * 呼ぶ側は転送を意識しなくてよい。
   *
   * 負荷: extracts は1リクエスト20ページまで(exlimit の上限。exsentences を外しても
   * 20件のまま)。WIKI_TITLES_MAX_CALLS リクエストで打ち切る。
   *
   * 失敗しても致命的ではない(素材が付かないだけ = 変更前と同じ並び)ので例外は握りつぶす。
   *
   * @param {string[]} titles 引きたい記事名。呼び出し側で上位に絞ってから渡すこと
   * @returns {Promise<Object>} 記事名 → {extract, thumbnailUrl, pageid} の表。失敗時は空
   */
  async function fetchWikiByTitles(titles) {
    var out = Object.create(null);
    if (!Array.isArray(titles) || !titles.length) return out;

    // 重複を除く(同じ記事を指す候補が複数あることがある)
    var uniq = [];
    var seenTitle = Object.create(null);
    titles.forEach(function (t) {
      var s = typeof t === 'string' ? t.trim() : '';
      if (!s || seenTitle[s]) return;
      seenTitle[s] = true;
      uniq.push(s);
    });
    if (!uniq.length) return out;

    // 固定データモードでは外部APIを叩かない。make-fixture.mjs が保存した表を使う。
    if (fixtureData) {
      var table = fixtureData.wikiByTitle || null;
      if (!table) return out;
      uniq.forEach(function (t) {
        var hit = table[t];
        if (hit) out[t] = hit;
      });
      return out;
    }

    var batches = chunk(uniq, WIKI_TITLES_BATCH_SIZE).slice(0, WIKI_TITLES_MAX_CALLS);

    // R171: Wikimedia のマナー上、バッチを同時に投げない(直列化)。
    // chunk().map(async)+allSettled だった並列発行を for...of + try/catch に変えた。
    for (var biWt = 0; biWt < batches.length; biWt++) {
      var batch = batches[biWt];
      try {
      var cacheKey = 'wikititles:' + batch.join('|');
      var cached = cacheGet(cacheKey);
      if (cached) {
        Object.keys(cached).forEach(function (k) { out[k] = cached[k]; });
        continue;
      }

      var params = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        titles: batch.join('|'),
        prop: 'extracts|pageimages',
        // 松山城 (伊予国) → 松山城 のような転送を吸収する
        redirects: '1',
        exintro: '1',
        explaintext: '1',
        exsentences: '2',
        exlimit: 'max',
        pilimit: 'max',
        pithumbsize: '480',
        origin: '*'
      });

      var data = await callWikipediaApi(params);
      var query = (data && data.query) || {};

      // 転送・正規化で記事名が変わった分を「渡した名前 → 返ってきた名前」に対応付ける。
      // これをやらないと呼び出し側が結果を自分の候補に結び付けられない。
      var backMap = Object.create(null);
      batch.forEach(function (t) { backMap[t] = t; });
      ['normalized', 'redirects'].forEach(function (key) {
        (query[key] || []).forEach(function (r) {
          if (!r || !r.from || !r.to) return;
          Object.keys(backMap).forEach(function (orig) {
            if (backMap[orig] === r.from) backMap[orig] = r.to;
          });
        });
      });

      var byTitle = Object.create(null);
      (query.pages || []).forEach(function (page) {
        if (!page || page.missing) return;
        byTitle[page.title] = page;
      });

      var got = Object.create(null);
      Object.keys(backMap).forEach(function (orig) {
        var page = byTitle[backMap[orig]];
        if (!page) return;
        var extract = typeof page.extract === 'string' ? page.extract.trim() : '';
        var thumb = (page.thumbnail && page.thumbnail.source) || null;
        if (!extract && !thumb) return; // 素材がまったく無いなら覚えない
        got[orig] = {
          extract: extract || null,
          thumbnailUrl: thumb || null,
          pageid: page.pageid || null,
          // 転送先の正式な記事名。被リンクを引く先としてはこちらが正しい
          resolvedTitle: page.title || orig
        };
      });

      cacheSet(cacheKey, got, TTL_WIKI_NEARBY_MS);
      Object.keys(got).forEach(function (k) { out[k] = got[k]; });
      } catch (e) {
        // 一部のバッチが落ちても他の結果は活かす(取れなかった分は素材が付かないだけ)
      }
    }
    return out;
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
    // R171: Wikimedia のマナー上、バッチを同時に投げない(直列化)。
    // chunk().map(async)+allSettled だった並列発行を for...of + try/catch に変えた。
    // 失敗したバッチのIDにも印を残す挙動は変えていない。
    for (var biSl = 0; biSl < idBatches.length; biSl++) {
      var batch = idBatches[biSl];
      try {
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
      } catch (e) {
        // 一部のバッチが失敗しても他の結果は活かす。
        // 失敗したバッチのIDにも印を残し、再検索のたびに叩き直さないようにする。
        batch.forEach(function (id) { markFameTried(id, 'sitelinks'); });
      }
    }
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

    // R171: Wikimedia のマナー上、スポットごとのリクエストを同時に投げない(直列化)。
    // targets.map(async)+allSettled だった並列発行を for...of + try/catch に変えた。
    for (var pvI = 0; pvI < targets.length; pvI++) {
      var spot = targets[pvI];
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
          continue;
        }
        if (!res.ok) throw new Error('pageviews ' + res.status);

        var data = await res.json();
        var items = (data && data.items) || [];
        if (!items.length || typeof items[0].views !== 'number') {
          markFameTried(spot.wikipediaTitle, 'monthlyViews');
          continue;
        }

        spot.fame.monthlyViews = items[0].views;
        saveFameCache(spot.wikipediaTitle, { monthlyViews: items[0].views });
      } catch (e) {
        // 通信断・タイムアウト・5xxなど。再検索のたびに叩き直さないよう印を残す
        markFameTried(spot.wikipediaTitle, 'monthlyViews');
      }
    }
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

    // R171: Wikidata(sitelinks)と Wikimedia(pageviews)を同時に投げない(直列化)。
    // どちらか一方が失敗しても他方は独立して実行される(各関数内で例外を握りつぶす設計)。
    try {
      await fetchSitelinks(spots);
    } catch (e) { /* 無視。fame は無くても提案自体は成立する */ }
    try {
      await fetchPageviews(spots);
    } catch (e) { /* 無視 */ }
    return spots;
  }

  global.YadoCache = {
    get: cacheGet,
    // R181: 期限切れでも読む口。通信失敗時の代替にだけ使う(検査からも観測する)。
    getStale: cacheGetStale,
    set: cacheSet,
    clear: cacheClear
  };

  global.YadoGeo = {
    geocodeHotel: geocodeHotel,
    suggestHotels: suggestHotels,
    fetchHotelsInBbox: fetchHotelsInBbox,
    fetchSpots: fetchSpots,
    fetchWikiNearby: fetchWikiNearby,
    // R166: タグで記事名が確定している候補の要約・写真を名指しで取りに行く2段目。
    // engine.js の collect が、geosearch との統合が済んだ後に呼ぶ。
    fetchWikiByTitles: fetchWikiByTitles,
    // R163: 「有名さ」を測る唯一の指標。engine.js の collect が rank の直前に呼ぶ。
    fetchBacklinkCounts: fetchBacklinkCounts,
    // R164: 記事を持たないスポット(別府の地獄・城崎の外湯・湯畑)を救う親記事の本文照合。
    fetchParentMentions: fetchParentMentions,
    // R164: 照合条件を make-fixture.mjs と共有するために公開する(本体はこちらが正)。
    matchParentMentions: matchParentMentions,
    // R173: 親記事の代表画像を「最多言及かつ明確に突出した候補」1件だけに配る。
    // 判定の本体はこちらが正で、engine.js の attachParentMentions から呼ぶ。
    pickParentImageTarget: pickParentImageTarget,
    parentAreaKey: parentAreaKey,
    // R173: make-fixture.mjs が geo.js と同じ形で parentImage を保存するために公開する。
    parentImageFromPage: parentImageFromPage,
    // R175: 親記事が痩せているときの昇格判定。make-fixture.mjs が
    // **同じ関数を呼ぶ**ことで、条件の二重実装を防ぐ。
    parentPromoteTitle: parentPromoteTitle,
    // R188: 住所から親記事名の候補を作る純粋関数。検証スクリプトから呼べるように公開する。
    parentArticleCandidates: parentArticleCandidates,
    // R189: 座標(geosearch の近傍記事)から親記事名を決める純粋関数。
    // 住所由来より優先される本筋の経路なので、検証スクリプトから直接叩けるようにする。
    parentTitleFromNearby: parentTitleFromNearby,
    looksOnsenAreaTitle: looksOnsenAreaTitle,
    enrichFame: enrichFame,
    // 固定データモード(?fixture=kusatsu)の差し込み口
    setFixture: setFixture,
    isFixture: function () { return !!fixtureData; },
    // 混雑シミュレーション(?simulate=overpass504)の差し込み口
    setSimulateBusy: setSimulateBusy,
    // 撮影・目視QA専用: 段階描画確認用の遅延注入(?slow=osm800,wiki1500)
    setSlowDelays: setSlowDelays,
    // プラン生成側や画面側でも使えるように距離計算とラベル表を公開しておく
    haversineM: haversineM,
    CATEGORY_LABELS: CATEGORY_LABELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
