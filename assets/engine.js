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
  // R152: 人が同時に比べられるのは4±1件という調査結果に従い、理由付き候補から
  // 初期5件だけを切り出す。母数(reasonFor に渡す cards)は REASON_POOL のまま動かさない。
  var MAX_CARDS = 5;
  // R155: 打ち切り(旧10)が理由付き候補25件超を切り捨てていた(湯畑・御所の湯が消失)。
  // REASON_POOL(30)を実質の上限として、理由付き候補は全部出す。
  var MAX_MORE = 30; // 「もっと見る」で追加展開する分(6件目以降、REASON_POOL全件まで)
  // 理由を計算するときの母数。「この一帯で唯一のX」が5件中で唯一という意味に
  // すり替わらないよう、母数は従来どおり上位30件に固定する。
  var REASON_POOL = 30;
  var MAX_FAR = 10;
  // 車でこれを超えるものは cards から外して far に回す
  // 実効距離 = FAR_DRIVE_MIN × DRIVE_M_PER_MIN = 30km。この30kmは make-fixture の
  // osmRadiusM(収集半径)とは独立に決まっており、両者が噛み合っていない場合(収集半径が
  // 30km未満のエリア)は far が構造上0件になる。噛み合わせの実測は docs/FIXTURES.md 参照。
  var FAR_DRIVE_MIN = 60;

  // 要約(Wikipedia extract)の表示上限。超えたら「…」で切る。
  var SUMMARY_MAX_CHARS = 120;
  // 句点優先で切るときの下限比率。短すぎる要約(尻切れ感)を避けるため、
  // 上限の何%以降に句点があればそこで文として完結させるかの閾値。
  var SUMMARY_SENTENCE_MIN_RATIO = 0.6;

  // 同一視の判定: これ以内で名前の一方が他方を含めば同じ場所とみなす
  var DEDUPE_NEAR_M = 150;
  // ホテル自身とみなす距離
  var HOTEL_SELF_M = 50;

  /**
   * 「長い名前が短い名前を含む」ときに、それでも**別物**とみなす差分語。
   *
   * 包含だけを根拠に併合すると、「天成園足湯」が温泉ホテル「天成園」の記事を、
   * 「草津温泉バスターミナル」が「草津温泉」の記事を継承してしまう。
   * 写真と要約が別物のものに化けるのは、カードが1枚重複するより実害が大きい。
   *
   * 判断基準: 差分が「その場所そのもの(別表記・山号・旧称・指定名)」なら併合、
   * 差分が「その場所の中/近くにある別の施設・設備」なら別物。迷ったら別物に倒す。
   * 例: 「湯畑源泉」-「湯畑」の差分は『源泉』= 同じ湯畑を指す別表記なので併合する。
   *     「天成園足湯」-「天成園」の差分は『足湯』= 敷地内の別施設なので併合しない。
   *
   * 逆に「本堂」「庫裡」「社殿」は寺社の主要建物で、記事も写真も寺社そのものを
   * 指すため、あえてここには入れない(併合を維持する)。
   */
  var FACILITY_DIFF_WORDS = [
    // 交通
    '駅', 'バスターミナル', 'ターミナル', 'バス停', '停留所', '駐車場', 'パーキング',
    'インターチェンジ', 'ジャンクション', 'ロープウェイ', 'ゴンドラ', '索道',
    'リフト', 'ケーブルカー', '乗り場', '乗場', '船着場',
    // 付帯設備・入口
    '入口', '入り口', '出口', '登山口', '広場', 'トイレ', '売店',
    '休憩所', '案内所', 'ビジターセンター', '展望台', '展望所',
    // 敷地内の別施設
    '足湯', '浴場', '露天風呂', 'スキー場', 'ゴルフ場', 'キャンプ場',
    '遊園地', '動物園', '植物園', 'グラウンド', 'グランド',
    'ホテル', '旅館', '会館', '支所', '出張所', '郵便局',
    // 土木構造物
    'トンネル', 'ダム'
  ];

  /**
   * 短い名前の**後ろ**に付いたときだけ別物とみなす語(「〜の末端に付く施設」)。
   * 前に付くときは正式名の修飾でしかないので効かせない。
   * 例: 「伊東市観光会館別館」(後ろ=別施設) vs
   *     「小田原市郷土文化館分館 松永記念館」(前=正式名の修飾。同じ場所)
   * 「前」「口」「橋」など1文字語は他の語に紛れ込みやすいので、
   * 後片の**末尾**に来たときだけ効かせる。
   */
  var FACILITY_TAIL_WORDS = ['前', '口', '橋', '港', '堰', 'ic', '別館', '分館'];

  /**
   * 差分(長い名前から短い名前を抜いた残り)が施設語かどうか。
   * 残りのどこかに施設語が現れたら別物とみなす。誤って別物にしても
   * 重複カードが1枚出るだけで済むので、迷ったら別物に倒す。
   *
   * 差分は normalizeName 済みの文字列(長音「ー」が落ち、小文字化されている)なので、
   * 語の方も同じ正規化を通してから比べる。normalizeName は下で定義されるため、
   * 初回呼び出し時に一度だけ作る。
   * @param {string[]} parts 短い名前で分割した残り。parts[0] が前片、
   *                         parts[1] 以降が後片(短い名前より後ろ)。
   */
  var facilityWordsNorm = null;
  var facilityTailNorm = null;

  function diffLooksLikeFacility(parts) {
    if (!facilityWordsNorm) {
      facilityWordsNorm = FACILITY_DIFF_WORDS.map(normalizeName).filter(Boolean);
      facilityTailNorm = FACILITY_TAIL_WORDS.map(normalizeName).filter(Boolean);
    }
    for (var p = 0; p < parts.length; p++) {
      var diff = parts[p];
      if (!diff) continue;
      for (var i = 0; i < facilityWordsNorm.length; i++) {
        if (diff.indexOf(facilityWordsNorm[i]) !== -1) return true;
      }
      // 末端語は「短い名前より後ろの片」の末尾に来たときだけ
      if (p === 0) continue;
      for (var j = 0; j < facilityTailNorm.length; j++) {
        var w = facilityTailNorm[j];
        if (diff.length >= w.length && diff.slice(-w.length) === w) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // 除外ルール(信頼の最低ライン)
  //
  // Wikipedia の周辺記事には観光の対象になりにくいもの(学校・企業・駅・地名・人物・
  // 河川全体・道路)が大量に混ざる。ここは簡易な語のルールで落とす。
  // 取りこぼし(落とし損ね)は許容する方針。厳密化は研究ノート側の課題。
  // ---------------------------------------------------------------------------

  /**
   * 保護リスト。名前が**これらで終わる**候補は、下の除外語に当たっても落とさない。
   * 「愛媛大学ミュージアム」のように除外語(大学)と観光語(ミュージアム)が同居する
   * 名前を守るためのもの。**除外より先に**評価する(保護 → 除外の順)。
   *
   * 末尾一致にしているのは、日本語の施設名が「修飾語+種別」の順で作られるため。
   * 「道後公園停留場」のように末尾が種別でないものは保護されない(停留場として落ちる)。
   */
  var NAME_PROTECT_SUFFIX = [
    '記念館', '資料館', '美術館', '博物館', 'ミュージアム', '文学館', '郷土館',
    '道の駅', '公園', '庭園', '植物園', '動物園', '水族館', '遊園地',
    '神社', '神宮', '大社', '八幡宮', '天満宮', '稲荷', '寺', '寺院', '城', '城跡', '城址',
    '温泉', '滝', '展望台', '史跡', '遺跡', '古墳', '記念碑',
    // R79: 下の公共施設語(部分一致)を足すにあたり、観光側で巻き込みそうな語を先に守る。
    // 「観光案内センター」は 'コンベンションセンター' とは別物、「別府タワー」は '事務所' の
    // 入るビルと紛れやすい、といった具体の誤爆を想定している。
    '観光案内所', 'ビジターセンター', '観光案内センター', '交流センター', '文化ホール',
    'タワー', '展望', 'ロープウェイ', '足湯', '地獄', '砂湯'
  ];
  // 注: '院' 単体は入れない(「〇〇病院」「〇〇医院」まで保護してしまうため)。
  //     '湯' 単体も入れない(「〇〇の湯」は除外語に当たらないので保護不要)。

  /**
   * R143: 動物園・水族館(tourism=zoo|aquarium)の「中の展示」(動物の種名そのもの)を
   * 「動物園そのもの」から区別するための施設語リスト。
   * 「動物園そのもの」は名前に必ずこの種の施設語を含む(園・館・小屋・パーク・ZOO…)。
   * 「中の展示」は種名そのもので、施設語を1文字も含まない非対称を判定に使う。
   * 4エリア(kusatsu/hakone/dogo/beppu)の tourism=zoo|aquarium 全27要素を実測して
   * 過不足を確認済み(誤爆0件)。
   */
  var ZOO_FACILITY_WORD = [
    '園', '館', '小屋', 'パーク', 'ランド', 'ZOO', 'Aquarium', 'サファリ', '牧場', '里', '村', '広場', '舎'
  ];

  /**
   * R142: 固有名を持たない一般名詞**そのもの**の候補を落とす。名前が完全一致した
   * ときだけ落とすリスト(部分一致は絶対にしない。`商店街` を部分一致にすると
   * `〇〇商店街` まで巻き込む。R116 が「誤爆リスクが高い」として見送られたのは
   * 部分一致で検討していたため。完全一致なら4エリアの実測で誤爆0件を確認済み)。
   * `湯畑`・`筆塚`・`大湯`のような短い固有名は完全一致しないため無傷。
   *
   * 2文字以上の一般名詞に限る。`湯`・`泉`・`塚`・`岳` のような1文字は
   * 短い固有名と衝突しうるため絶対に入れない。
   */
  var GENERIC_NAME_NG = [
    '商店街', '足湯', '記念碑', '国登録記念物', '公園', '庭園', '展望台',
    '駐車場', 'トイレ', '広場', '売店', '休憩所', '石碑', '碑', '鳥居',
    '史跡', '古墳', '温泉', '神社', '寺', '滝', '池', '橋', '山', '川'
  ];

  /** タイトルの末尾がこれらで終わる記事は落とす */
  var TITLE_SUFFIX_NG = [
    '駅', '停留所', '停留場', 'インターチェンジ', 'ジャンクション', '信号場',
    '小学校', '中学校', '高等学校', '学校', '大学', '短期大学', '専門学校',
    '幼稚園', '保育園', 'こども園', '保育所',
    '株式会社', '有限会社', '合同会社',
    '郡', '町', '市', '村', '区', '丁目',
    '川', '街道', '線', '空港', '病院', '医院', '診療所', 'クリニック',
    '郵便局', '警察署', '交番', '消防署', '消防本部',
    '市役所', '町役場', '村役場', '区役所', '県庁', '府庁', '道庁', '合同庁舎',
    '気象台', '測候所', '保健所', '裁判所', '税務署', '法務局',
    '工場', '製作所', '変電所', '発電所', '浄水場', '下水処理場', '清掃工場',
    '団地', 'マンション', 'アパート', '社宅', '官舎',
    // 注: '寮' は入れない。「箱根湯寮」のような日帰り温泉施設まで落ちるため。
    '銀行', '信用金庫', '信用組合', '営業所', '支店', '支社', '本社',
    '刑務所', '拘置所', '駐屯地', '基地', '自動車学校', '墓地', '霊園',
    // R79 追加。'店' 単体は入れない(「〇〇本店」の飲食・土産の観光店まで落ちるため)。
    '百貨店', '支所', '分署', '車庫'
  ];

  /**
   * タイトルにこれらを含む記事は落とす。
   * 部分一致なので**誤爆しやすい語は入れない**(「センター」「会館」「学園」等は
   * 観光施設の名前にも普通に現れるため入れていない)。
   */
  var TITLE_KEYWORD_NG = [
    '国道', '県道', '道府県道', '市道', '一覧', '曖昧さ回避',
    '特別支援学校', '附属学校', '付属学校', '学校法人',
    '老人ホーム', '介護施設', '青少年センター', '職業訓練', '自衛隊',
    // R79: 公共施設の種別語。ここは部分一致なので「野口病院管理棟」「〇〇大学…研究施設」の
    // ように語の後ろに何か付く名前にも当たる(TITLE_SUFFIX_NG の末尾一致では素通りする形)。
    // 'センター' 単体は絶対に入れない(観光案内センター・ビジターセンターを巻き込む)。
    // 必要な 〇〇センター は複合語で列挙する。
    '体育館', '公会堂', '市民会館', '県民会館', '文化会館',
    // R132: '球技場' は R79 でこの並びに入れ忘れた取りこぼし。`本白根第3グランド`
    //(「群馬県草津町にある球技場である。」kusatsu 8位)が名前側で素通りしていた。
    // なお 'グランド'/'グラウンド' 単体は絶対に入れない(「〇〇グランドホテル」等を巻き込む)。
    '競技場', '運動場', '武道館', '球技場',
    '庁舎', '合同庁舎', '管理棟', '事務所', '出張所', '分室', '職員', '官公庁',
    '研究所', '研究施設', '試験場',
    '浄化センター', '福祉センター', '保健センター', 'コンベンションセンター',
    '貯水池'
  ];

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
    'にある公立', 'にある私立', '設置する特別支援学校', '特別支援学校である',
    '気象庁の地方気象台', 'の地方気象台', '国の行政機関', '行政機関である',
    '医療機関である', '総合病院である', '診療所である',
    '一級水系', '二級水系', '一級河川', '二級河川',
    '国道である', '都道府県道である',
    // R79: 冒頭文で確実に公共施設と分かるものだけ足す
    '体育館である', '公会堂である', 'コンベンション', '百貨店である',
    // 「大分県別府市の百貨店『トキハ』を核とした…」のように '百貨店である' で終わらない
    // 書き方もあるため、地名+の百貨店 の形も拾う。'百貨店' 単体は記述の引用でも当たる
    // (「かつて百貨店だった建物を活用した美術館」等)ので 'の百貨店' に留める。
    'の百貨店',
    '研究施設である', '陸上競技場',
    // R132: R79 が '競技場'/'運動場'/'武道館' を入れたときに漏れた1語。
    // 名前に種別語を持たない `本白根第3グランド`(「群馬県草津町にある球技場である。」)は
    // タイトル側では拾えず、冒頭文のこの1語だけが唯一の手がかりだった。
    // '球技場' 単体ではなく '球技場である' に留めるのは、'体育館である' 等と同じく
    // 二文目以降の言及(「〜の球技場に隣接する公園」)で正当な候補を巻き込まないため。
    '球技場である'
  ];

  /**
   * R117: 宿泊施設(他社の宿)そのものを候補から落とすための語。
   *
   * やどたびは「宿を選んだあと、その**周り**に何があるか」を出すサイトなので、
   * 候補に他社のホテル・旅館が並ぶのは提案として無意味。実測(4 fixture・200記事)では
   * 上位30件に宿が5件並び、うち4件は「♨温泉」ラベルで観光スポットのように見えていた。
   *
   * **EXTRACT_KEYWORD_NG ではなくこちらに置く理由**: EXTRACT_KEYWORD_NG は extract 全体を
   * 走査するため、ここに 'ホテル' を入れると「〜ホテルに隣接している」「かつてホテルだった
   * 建物を活用した美術館」のような**二文目以降の言及**で正当な観光対象まで巻き込む。
   * そこで R115 と同じ definitionScope()(記事冒頭の一文=「〜は…である。」)に範囲を絞り、
   * さらに definitionPredicate() で主題部(記事名の言い直し)を落として述部だけを見る。
   * 万座プリンスホテルの二文目「万座温泉スキー場に隣接している」が前者の実例、
   * 「〇〇ホテル前」(本文は展望台)が後者の実例。
   *
   * 実測で当たったのはちょうど7件(観光対象の誤爆0件):
   *   kusatsu 万座プリンスホテル / 渋峠ホテル
   *   hakone  天成園 / 一の湯 / ヒルトン小田原リゾート&スパ
   *   beppu   杉乃井ホテル / 大江戸温泉物語 別府清風
   * 日帰り入浴施設(天成園 屋上浴場・天成園足湯・箱根湯寮・大滝乃湯 ほか)は OSM 由来で
   * extract を持たないため走査対象外。宿の記事だけ消え、日帰り入浴施設は残る。
   */
  var DEFINITION_LODGING_NG = [
    'ホテル', '旅館', '温泉宿', 'ペンション', '民宿', 'ゲストハウス', '宿泊施設'
  ];

  /**
   * R119: 既に閉鎖・解体されて**現地に何も無い**施設を落とすための2語。
   *
   * これまでの除外は「**何であるか**」(学校・病院・宿)しか見ておらず、「**まだ在るか**」を
   * 一度も見ていなかった。そのため閉鎖済みのスキー場・動物園・遊園地が写真と要約つきで
   * カードに並び、客が向かっても現地に何も無い、という提案として最も直接的な実害が出ていた
   * (実測: kusatsu 13位 草津シズカ山スキー場 / dogo 12位 愛媛県立道後動物園 /
   *  beppu 10位 鶴見園 / kusatsu more 4位 白根火山ロープウェイ)。
   *
   * 判定は `かつて` と過去存在語の **AND**。**片方だけに緩めてはいけない**。
   * 「あった」単独にすると `湯築城`「愛媛県松山市道後公園にあった日本の城。」(dogo 4位の
   * 正当な観光対象)、`石垣山城`・`羽根尾城`・`長野原城`・`道後村`・`道後湯之町`・
   * `六合村 (群馬県)` を巻き込む。城跡や一夜城歴史公園は「跡地を整備した公園」として
   * **現地に行ける**ので落としてはいけない。実測でこれらは全て「かつて」を含まないため、
   * 2語の AND なら誤爆0件になる。
   *
   * 「存在した」の単独成立は R120 で `DEFINITION_GONE_SOLO` に切り出した(下記)。
   * この AND 判定そのものは1語も変えていない。
   *
   * 走査範囲は R117 と同じ definitionPredicate()(定義文の述部)。extract 全体を見ると
   * 「かつてホテルだった建物を活用した美術館」のような二文目以降で現役施設を巻き込む。
   * `別府駅商業施設`「かつて…と総称されていた、…併設されている以下の商業施設について
   * 述べる。」は過去存在語が無いので残る(現役の駅ビルなので残るのが正しい)。
   *
   * 救済経路は既存のまま: hasOsmTagEvidence() で OSM に観光タグ付きで実在する要素と
   * 一致する記事は落ちない(= 現地に何かが残っていれば残る)。
   */
  var DEFINITION_GONE_MARK = 'かつて';
  var DEFINITION_GONE_PAST = ['存在した', '存在していた', 'あった'];

  /**
   * R120: 「かつて」を書かずに過去形だけで廃止を述べる記事を落とす、**単独で成立する**語。
   *
   * R119 の AND 判定は「かつて」が無いと通らないため、`群馬鉄山`
   * 「群馬県吾妻郡六合村（現・中之条町）に**存在した**鉱山。」(kusatsu cards 14位)が
   * 写真・要約つきで現役スポットのようにカードに並んでいた。実害は R119 と同じで、
   * 宿の客が向かっても現地に何も無い。
   *
   * 4エリア200記事の実測で、述部に `存在した` / `存在していた` を含むのは7件、
   * その**全件が本当に現存しない施設**(群馬鉄山 / 白根火山ロープウェイ /
   * 愛媛県立道後動物園 / 草津シズカ山スキー場 / 鶴見園 / キャンプ・チッカマウガ /
   * 別府鉱山)で誤爆0件。うち6件は R119 で既に除外済みなので、判定が変わるのは
   * 群馬鉄山の1件だけになる。
   *
   * **`あった` を絶対にこの配列へ入れない**。実測で `湯築城`「愛媛県松山市道後公園に
   * あった日本の城。」(dogo cards 4位)・`石垣山城`・`羽根尾城`・`長野原城` を巻き込む。
   * 城跡は跡地が整備されていて**現地に行ける**ため、この1語のためだけに R119 は
   * AND 判定を選んでいる。単独成立に切り出せるのは上の2語だけ。
   *
   * `廃止` も足さない: 唯一のヒット `南別府駐屯地` は名前の `駐屯地` で既に除外済みで、
   * 1件も救えない語で条件を広げると根拠が崩れる。
   * 走査範囲・評価位置・救済経路は R119 と同じ(定義文の述部・保護リストより前・
   * hasOsmTagEvidence() で救済可)。
   */
  var DEFINITION_GONE_SOLO = ['存在した', '存在していた'];

  /**
   * R121: **現存するが、観光目的の訪問が適切でない施設**を落とすための語。
   *
   * R119/R120 が見ているのは「まだ在るか」という軸で、現役の施設は素通りする。
   * しかし `国立療養所栗生楽泉園`「群馬県吾妻郡草津町に位置する国立ハンセン病療養所。」
   * (kusatsu cards 12位)は、入所者が**今も生活している**現役の療養所であり、
   * 「宿の周りの見どころ」として行き方つきで並べるのは観光対象として不適切なだけでなく、
   * 人権上の配慮を欠く。「何であるか」でも「まだ在るか」でもない**第3の軸**として、
   * 人が収容・居住していて訪問が適切でない施設を定義文の述部で落とす。
   *
   * 判定を**名前ではなく定義文の述部で行う**のが要点。名前に `療養所` を含む候補を
   * 落とす形にすると、敷地内にある `重監房資料館`(OSM の tourism=museum・kusatsu more
   * 29位)のような**歴史を学ぶための公開施設**まで巻き込む恐れがある。述部で見れば
   * OSM 候補は extract を持たないので走査対象にならず、資料館の導線は必ず残る
   * (実測: 変更後も more に残ることを確認済み)。学びの場を塞がないことが本ルールの前提。
   *
   * 4エリア200記事の実測ヒットは `療養所` の1件のみ(栗生楽泉園)で誤爆0件。
   * `刑務所`/`拘置所`/`少年院` は述部ヒット0件だが、名前側の TITLE_SUFFIX_NG に
   * 既に `刑務所`/`拘置所` があるのと同じ趣旨で、記事側の取りこぼしを塞ぐために置く
   * (0件の語を足しても現状の判定は1件も変わらないことを実測で確認済み)。
   * 評価位置は R119/R120 と同じく**保護リストより前**(閉鎖・非公開の施設ほど
   * 名前だけは種別語のまま残るため)。
   */
  var DEFINITION_NOT_VISITABLE = ['療養所', '刑務所', '拘置所', '少年院'];

  /**
   * R148: `かつて` を書かずに `にあった` だけで廃止を述べる記事を落とす。
   *
   * `竹野鉱山`「兵庫県豊岡市竹野町（旧城崎郡竹野町）にあった鉱山。」(kinosaki cards 18位)は
   * `かつて` が無いため R119 の AND が成立せず、`にあった` は DEFINITION_GONE_SOLO にも
   * 入っていないため R120 でも拾えない。宿の客が写真・要約を見て6km先へ向かっても、
   * 現地に鉱山は無い。
   *
   * **`にあった` を単独で落としてはいけない**。5エリア250記事の実測で `にあった` を含む
   * 述部は26件あり、うち `湯築城`「愛媛県松山市道後公園にあった日本の城。」(dogo cards 4位・
   * 堀や土塁が現存する)・`石垣山城`・`羽根尾城`・`長野原城` の城跡4件(跡地が公園等で
   * **現地に行ける**)と、`城崎町`・`竹野町`・`中竹野村`・`田鶴野村`・`港村`・`内川村`・
   * `竹野村`・`道後村`・`道後湯之町`・`六合村` の旧町村9件を含む。これらは1件も落として
   * はいけない。そこで R119 と同じ **AND** の枠組みを踏襲し、`にあった` +
   * **消滅しうる人工施設の種別語**の組み合わせだけを落とす。城・村・町・公園は
   * 意図的にこの配列へ入れない(城跡・公園は跡地として現地に行けるため、
   * 村・町は行政区画であり「訪問先」の概念に合わないため)。
   *
   * 5エリア250記事の実測ヒットは11件ちょうど・誤爆0件: 太子駅(廃駅)・
   * 大分県立別府青山高等学校・別府市立別府商業高等学校・別府市立北小学校・
   * 別府市立山の手中学校・別府市立野口小学校・きりはまビーチ駅・豊岡市立竹野中学校・
   * 竹野鉱山・豊岡市立港西小学校・豊岡市立竹野小学校。全件が本当に現存しない施設。
   * うち10件は名前の TITLE_SUFFIX_NG(駅・学校が末尾一致)で既に除外済みなので、
   * カードの差分が出るのは竹野鉱山の1件だけ(kinosaki 18位が消え、御所の湯が繰り上がる)。
   *
   * 名前側の TITLE_SUFFIX_NG に `鉱山` を足す案は採らない: 現役の観光鉱山
   * (足尾銅山観光・佐渡金山など)を将来巻き込むおそれがあり、記事が自分で
   * 「あった」と書いているという意味的根拠の方が確実だから。
   *
   * 走査範囲・評価位置(保護リストより前)・hasOsmTagEvidence() による救済経路は
   * R119/R120 とまったく同じ。
   */
  var DEFINITION_GONE_SITE = [
    '鉱山', '炭鉱', 'スキー場', '遊園地', '動物園', 'ロープウェイ', '索道',
    '鉄道', '駅', '工場', '劇場', '映画館', '百貨店', '学校', '病院',
    '刑務所', '飛行場', '製作所'
  ];

  /**
   * R132: **人物の伝記記事**を、語の列挙ではなく「生没年の括弧」という構造で落とす。
   *
   * R119〜R121 が見てきたのは「まだ在るか」「訪問が適切か」だったが、ここで問うのは
   * もっと手前の**「そもそも行ける場所か」**という軸。人物・出来事は場所ではないので、
   * カードに徒歩分数と経路リンクが付くこと自体が意味をなさない。
   * 実例は `コンウォール・リー`「英国女性。宣教師の道を歩み1907年来日。」(kusatsu 5位)で、
   * カテゴリ「スポット」・宿から336m・徒歩分数つきで並んでいた。
   *
   * **語の列挙にしない理由**: 既存の EXTRACT_KEYWORD_NG の人物語は `日本の政治家`〜
   * `日本のプロ野球` という**日本人の職業記事しか想定しておらず**、外国人・古人・
   * 職業の書かれない人物には1語も当たらない。職業名で網羅するのは原理的に不可能なので、
   * 「日本語版 Wikipedia の人物記事は定義文に生没年を括弧で書く」という**記法の構造**を
   * 手がかりにする。これは職業に依らず人物記事だけに現れる形で、語の列挙より正確。
   *
   * **走査範囲が述部ではなく extract 先頭120字(scope 側)である理由**: 生没年は
   * 「〇〇（1857年3月6日 - 1941年12月30日）は、」のように**主題部の括弧内**に書かれるため、
   * definitionPredicate() が主題部を捨てた後には残らない。R117〜R121 と範囲が違う唯一の
   * ルールなのはこのため。120字で頭打ちにするのは definitionScope と同じ保険。
   *
   * 4エリア200記事の実測ヒットは1件(コンウォール・リーのみ)で誤爆0件。
   * 年だけの `（1857年 - 1941年）` 形は採らない(元号表記や建立年・創建年の括弧を
   * 巻き込むため、月日まで揃っている形に限る)。
   */
  var DEFINITION_PERSON_LIFESPAN = /（[^）]*[0-9]{3,4}年[0-9]{1,2}月[0-9]{1,2}日\s*[-－‐–—]\s*([0-9]{3,4}年)?/;

  /**
   * R132: **出来事(合戦)の記事**を述部で落とすための語。場所ではないので行き先にならない。
   *
   * 実例は `石橋山の戦い`「平安時代末期の治承4年（1180年）に源頼朝と平氏政権勢力
   *(大庭景親ら)との間で行われた戦いである。」(hakone 11位)。しかも**同じ hakone の
   * 21位に正しい行き先である `石橋山古戦場の碑`(OSM・記念碑・3322m)が既に居る**ため、
   * 正しい候補の上に乗った重複ノイズでもあった。古戦場の碑の側は OSM 由来で extract を
   * 持たないので、このルールの走査対象にならず必ず残る。
   *
   * **`戦い` 単体・`合戦` 単体を絶対に入れない**。「〜の戦いの古戦場」「〜の戦いの舞台と
   * なった城」のように、**地物の記事が出来事に言及する**形を巻き込むため、必ず `〜である` の
   * 形にして定義文の述部に限る。範囲を述部にするのは R117 以降と同じで、二文目以降の
   * 歴史説明で現役の史跡を落とさないため。
   *
   * 4エリア200記事の実測ヒットは `戦いである` の1件のみ(石橋山の戦い)で誤爆0件。
   * `合戦である` はヒット0件だが、同趣旨の取りこぼしを塞ぐために置く(0件の語を足しても
   * 現状の判定は1件も変わらないことを実測で確認済み。R121 の `刑務所` 等と同じ扱い)。
   */
  var DEFINITION_NOT_PLACE = ['戦いである', '合戦である'];

  /**
   * R133: **単一の場所ではない Wikipedia の索引記事**を落とすための冒頭一致。
   *
   * 実例は `別府駅商業施設`(beppu 9位・source=wiki・982m)。extract 冒頭が
   * 「本項では、かつて別府駅商業施設（べっぷえきしょうぎょうしせつ）と総称されていた、
   * 大分県別府市のJR九州別府駅に併設されている以下の商業施設について述べる。」で、
   * 複数の商業施設をまとめて解説する記事に座標を1つ持たせて「宿から982m」と
   * 出すこと自体が誤り。R119/R120 の「かつて」軸は definitionPredicate()(述部)を
   * 見るが、この記事の「かつて」は主題部にあるため当たらず、R132 の
   * DEFINITION_NOT_PLACE(`戦いである`/`合戦である`)にも当たらない、既存3軸の隙間。
   *
   * **他の判定と違い definitionPredicate() / definitionScope() を通さず、
   * extract の生の先頭に当てる**(主題部を捨てると `本項では` 自体が消えるため)。
   *
   * `本項では` は Wikipedia の索引記事・曖昧さ回避まわりの定型句で、単一の地物記事は
   * 必ず「〇〇（よみ）は、…」という記事名の言い直しから始まるため構造的に当たらない。
   * 4エリア200記事の実測ヒットは1件(別府駅商業施設)のみで誤爆0件。
   *
   * **`について述べる` 単体は絶対に入れない**(「〜の由来について述べる」のような
   * 地物記事本文に当たりうるため)。必ず**冒頭一致(`^本項では`)**の形で持つ。
   */
  var DEFINITION_INDEX_ARTICLE = /^本項では/;

  /**
   * R141: **複数県にまたがる広域国立公園・国定公園・自然公園**を落とすための述部一致。
   *
   * 実例(kusatsu 8位・9位): 上信越高原国立公園、妙高戸隠連山国立公園。どちらも
   * Wikipedia の `coordinates` が **`36.6250, 138.6250` で完全に同一**(1/8度グリッドに
   * 乗った丸めの代表点)なため、距離が2枚とも同じ 2602m になり、「宿からの距離」と
   * 「行き方(経路リンク)」というやどたびの根幹が両方とも壊れる。上信越高原国立公園は
   * 草津を含む一帯そのもの、妙高戸隠連山国立公園の実範囲は新潟・長野県境で草津から
   * 直線70km以上離れる。どちらも「2602m先の1地点」を指す記事ではない。
   *
   * 判定は両記事が定義文で自ら書いている「またがる」という**構造**を手がかりにする:
   *   上信越高原国立公園: `…3県の境界にまたがる国立公園である。`
   *   妙高戸隠連山国立公園: `…新潟県と長野県にまたがる国立公園である。`
   *
   * **広い版 `/(国立公園|国定公園)である/` ではなく、狭い版(`にまたがる…である`)を採る**。
   * 広い版も4エリア200記事では同じ2件・誤爆0件だが、将来「◯◯国定公園内にある滝」
   * のような**単一地物**の記事(国立公園の中の1スポットを指す、座標も個別に正しい)を
   * 巻き込む余地があるため採らない。「またがる」は複数の行政区域にまたがる広域指定
   * であることを記事自身が明言している場合に限られ、単一地物には現れない。
   *
   * R133 と同じく definitionPredicate() が返す述部に当てる(生の extract ではない)。
   * 記事名の言い直し(主題部)を落とした後でも「…にまたがる国立公園である」は述部側に
   * 残るため、R133 のような生 extract を見る特例は不要。
   *
   * 4エリア200記事の実測ヒットは2件(上記2記事)ちょうどで誤爆0件。
   */
  var DEFINITION_WIDE_AREA = /にまたがる[^。]{0,12}(国立公園|国定公園|自然公園)である/;

  /**
   * R145: 災害という「出来事」そのものの Wikipedia 記事(例: 北但馬地震)。
   * 行けない出来事を「宿のまわりの見どころ」に並べるのは誤りなので落とす。
   *
   * **絶対に名前(タイトル)では判定しない。** 災害語を名前に含む OSM 要素が
   * 5エリアの overpass.elements に16件あり、すべて `historic=memorial` 等の
   * 実在する記念碑・慰霊碑(震災追弔の碑・大震災記念碑・狩野川台風殉難者慰霊碑等)で、
   * 現に画面にも「北但大震災伝承銅像」(kinosaki 24位)・「水害碑」(beppu 21位)が
   * 表示されている。これらは OSM 由来で extract を持たないため isExcludedName 側を
   * 通るが、もし名前(タイトル)に災害語をNGとして加えると、Wikipedia側だけでなく
   * この判定式にも波及する設計にした場合に即死する。そのため判定は
   * definitionPredicate() が返す述部(definitionScope('', extract) 由来)のみに当て、
   * t(title) には一切触らない。
   *
   * 語の単純列挙(indexOf)ではなく「〜で発生した〇〇である」という定義文の構造一致を
   * 見る。「〜のふもとにある記念碑である」のような記事には当たらない。
   *
   * 5エリア250記事の実測(2026-09-18): ヒット1件(北但馬地震のみ)・誤爆0件。
   * 該当語が実測でタイトル・extractともに1件も出ていない 火災/空襲/津波/台風/豪雨/大火 は
   * 検証されていない誤爆源を増やすだけなので、あえて入れない
   * (地震/大地震/噴火/水害/洪水 のみに限定)。
   */
  var DEFINITION_DISASTER = /で発生した(地震|大地震|噴火|水害|洪水)である/;

  /**
   * Wikipedia 単独候補のカテゴリ推定表。
   *
   * Wikipedia 記事には OSM のようなタグが無いため、そのままだと全部 'other' になり、
   * カテゴリ多様性の判定にも表示ラベルにも使えない。そこで extract / title の語から
   * ざっくり推定する。上から順に評価し、最初に当たったものを採る。
   * 推定できなければ 'other' のまま(無理に当てない)。
   *
   * R115: hot_spring だけ否認語 `deny` を持つ。「草津温泉バスターミナル」のように
   * 名前に「温泉」を含むだけの別種の施設を温泉として出さないため、記事冒頭の定義文
   * (「〜は…である」)に否認語があれば、その行を採らず次の行へ送る。
   * 他のカテゴリ行には付けない(誤爆源になるだけで、実測では誤判定が出ていない)。
   */
  var WIKI_CATEGORY_HINTS = [
    { category: 'waterfall', label: '滝', words: ['滝'] },
    { category: 'hot_spring', label: '温泉', words: ['温泉'],
      deny: ['バスターミナル', 'スキー場', '遊園地', '球技場', 'ゴルフ場', '競馬場',
        '空港', '駅である', '山。', '山である', '岳。', '岳である'] },
    { category: 'castle', label: '城・城跡', words: ['城跡', '城址'] },
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

  /**
   * 文字列を最大長で切る。上限手前に句点「。」があればそこで文として完結させ
   * (「…」は付けない)、無ければ従来どおり maxChars で切って「…」を付ける。
   * null/空文字は null。
   */
  function truncate(text, maxChars) {
    if (typeof text !== 'string') return null;
    var s = text.trim();
    if (!s) return null;
    if (s.length <= maxChars) return s;
    var head = s.slice(0, maxChars);
    var idx = head.lastIndexOf('。');
    var minLen = Math.floor(maxChars * SUMMARY_SENTENCE_MIN_RATIO);
    if (idx >= 0 && (idx + 1) >= minLen) {
      return s.slice(0, idx + 1);
    }
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
  function buildLinks(item, hotel) {
    var q = encodeURIComponent(item.name || '');
    var coords = encodeURIComponent(item.lat + ',' + item.lon);
    var h = hotel || {};
    var gmap = (isFinite(h.lat) && isFinite(h.lon))
      ? 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(h.lat + ',' + h.lon)
          + '&destination=' + coords + '&travelmode=walking'
      : 'https://www.google.com/maps/search/?api=1&query=' + coords;
    return {
      gmap: gmap,
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
   * Wikipedia の曖昧さ回避カッコを末尾から1回だけ剥がす。
   *
   * 「別府駅 (大分県)」のような記事名は末尾が `駅` ではないので、末尾一致の
   * TITLE_SUFFIX_NG / NAME_PROTECT_SUFFIX がどちらも当たらず素通りしてしまう。
   * 判定の入口で正規化し、**保護と除外の両方に同じ文字列を使う**(片方だけに
   * 適用すると「別府タワー (曖昧さ回避付き)」のような名前で判断がねじれる)。
   */
  function stripDisambiguation(name) {
    return name.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();
  }

  /** 名前が保護語で終わるか。終わるなら除外語に当たっても落とさない。 */
  function isProtectedName(name) {
    for (var i = 0; i < NAME_PROTECT_SUFFIX.length; i++) {
      var w = NAME_PROTECT_SUFFIX[i];
      if (name.length >= w.length && name.slice(-w.length) === w) return true;
    }
    return false;
  }

  /**
   * 名前に日本語文字(ひらがな・カタカナ・漢字・長音符)が1文字でも含まれるか。
   * R127: 全角英数や記号だけの名前を誤って「日本語あり」と判定しないよう、
   * 対象はひらがな/カタカナ/漢字/長音符の4レンジのみに絞る。
   */
  function hasJapaneseChar(name) {
    var s = typeof name === 'string' ? name : '';
    return /[぀-ゟ゠-ヿ一-鿿ー]/.test(s);
  }

  /**
   * 名前だけで観光の対象になりにくいと分かるものかどうか。true なら落とす。
   * OSM 候補(extract が無い)と Wikipedia 候補の両方から使う共通判定。
   * 保護 → 除外の順で見るので、「愛媛大学ミュージアム」は大学に当たっても残る。
   */
  function isExcludedName(name) {
    var raw = typeof name === 'string' ? name.trim() : '';
    if (!raw) return true;
    // 「別府駅 (大分県)」→「別府駅」。剥がした結果が空になる名前は元のまま使う。
    var t = stripDisambiguation(raw) || raw;

    // R142: 固有名を持たない一般名詞そのものの候補(`商店街`単独など)を落とす。
    // **`isProtectedName` より前**に置くこと。NAME_PROTECT_SUFFIX には `足湯`・
    // `記念碑`・`公園`・`庭園` が入っており、これらは GENERIC_NAME_NG とも重なる語。
    // 後ろに置くと `isProtectedName` の return false が先に効いて11件中8件
    // (`足湯`×6・`記念碑`×2)が判定に届かない。R141(複数県またぎ国立公園)で
    // 踏んだのとまったく同じ罠(NIGHTLOG R141 参照)。完全一致(===)のみなので、
    // `〇〇足湯`・`〇〇公園`のように固有名が付いたものは一致せず保護判定に進む。
    if (GENERIC_NAME_NG.indexOf(t) !== -1) return true;

    if (isProtectedName(t)) return false;

    var i;
    for (i = 0; i < TITLE_KEYWORD_NG.length; i++) {
      if (t.indexOf(TITLE_KEYWORD_NG[i]) !== -1) return true;
    }
    for (i = 0; i < TITLE_SUFFIX_NG.length; i++) {
      var suffix = TITLE_SUFFIX_NG[i];
      if (t.length > suffix.length && t.slice(-suffix.length) === suffix) return true;
    }
    return false;
  }

  /**
   * Wikipedia 記事が観光の対象になりにくいものかどうか。
   * true なら候補から落とす。判定は語の簡易ルールで、取りこぼしは許容する。
   * 名前の判定は isExcludedName と共通で、記事はさらに冒頭文でも判定する。
   */
  function isExcludedArticle(title, extract) {
    var t = typeof title === 'string' ? title.trim() : '';
    if (isExcludedName(t)) return true;

    var e = typeof extract === 'string' ? extract : '';
    // 定義文の述部。R117(宿)と R119(現存判定)で共用するので、保護の前に一度だけ作る。
    var predicate = e ? definitionPredicate(definitionScope('', e)) : '';

    // R119: 「かつて」+ 過去存在語の AND で、既に無くなった施設を落とす。
    // **保護リストより先に**評価する唯一の冒頭文ルール。保護リスト(NAME_PROTECT_SUFFIX)は
    // 「名前が観光の種別語で終わるなら、種別語ベースの除外に当たっても守る」という
    // **「何であるか」を守る**仕組みで、「まだ在るか」は一度も見ていない。
    // 閉鎖済みの施設は名前だけ種別語のまま残るため、保護を先に通すと
    // `愛媛県立道後動物園`(`動物園` で保護)・`白根火山ロープウェイ`(`ロープウェイ` で保護)が
    // 冒頭文に到達せず生き残ってしまう(R119 実装時に実測で判明)。
    // 順序を入れ替えても保護対象が巻き込まれないことは 4エリア200記事の全件突き合わせで確認済み
    // (湯築城・石垣山城・石垣山一夜城歴史公園・道後村などは「かつて」を含まないため無傷)。
    // R120: 「かつて」を書かずに過去形だけで廃止を述べる記事。単独で成立する2語だけを
    // AND 判定より先に見る。AND 側(`あった` を含む)は1語も変えない。
    for (var s = 0; s < DEFINITION_GONE_SOLO.length; s++) {
      if (predicate.indexOf(DEFINITION_GONE_SOLO[s]) !== -1) return true;
    }

    // R148: `かつて` を書かずに `にあった` だけで廃止を述べる記事。`にあった` 単独では
    // 湯築城(dogo 4位)・石垣山城・羽根尾城・長野原城の城跡4件と旧町村9件を巻き込むため、
    // 消滅しうる人工施設の種別語との AND でのみ落とす(詳細は DEFINITION_GONE_SITE の定義参照)。
    if (predicate.indexOf('にあった') !== -1) {
      for (var g = 0; g < DEFINITION_GONE_SITE.length; g++) {
        if (predicate.indexOf(DEFINITION_GONE_SITE[g]) !== -1) return true;
      }
    }

    // R121: 現存するが、人が収容・居住していて観光目的の訪問が適切でない施設。
    // 名前ではなく述部で見るので、OSM 由来の `重監房資料館`(extract 無し)は当たらず、
    // 学びの導線は残る。R119/R120 と同じく保護リストより前で評価する。
    for (var v = 0; v < DEFINITION_NOT_VISITABLE.length; v++) {
      if (predicate.indexOf(DEFINITION_NOT_VISITABLE[v]) !== -1) return true;
    }

    if (predicate.indexOf(DEFINITION_GONE_MARK) !== -1) {
      for (var k = 0; k < DEFINITION_GONE_PAST.length; k++) {
        if (predicate.indexOf(DEFINITION_GONE_PAST[k]) !== -1) return true;
      }
    }

    // R141: 複数県にまたがる広域国立公園・国定公園・自然公園。
    // **設計メモとの相違点(NIGHTLOG参照)**: 当初は R132/R133 に倣い保護リストより
    // 後ろに置く方針だったが、対象2記事(上信越高原国立公園・妙高戸隠連山国立公園)は
    // どちらも名前が `公園` で終わり NAME_PROTECT_SUFFIX に直撃するため、保護リストより
    // 後ろに置くと下の `isProtectedName` の return false で必ず先に守られてしまい、
    // 判定に到達しない(実測で判明)。R132/R133 は対象が保護語で終わらなかったから
    // 後ろで機能しただけで、今回は前提が異なる。そのため R119〜R121 と同じく
    // **保護リストより前**に置く。「またがる」という構造一致は語の列挙ではなく、
    // 単一地物(`公園`/`史跡`等)の記事には現れないため、保護対象を巻き込む心配はない
    // (4エリア200記事の実測で誤爆0件を確認済み)。
    if (DEFINITION_WIDE_AREA.test(predicate)) return true;

    // R145: 災害という「出来事」そのものの記事(北但馬地震)。名前(t)には一切触れず
    // 述部だけで見る(記念碑16件を巻き込まないため)。R141 と同じ理由で保護リストより前:
    // 対象が保護語で終わる名前を持つ可能性を排除できないため安全側に倣う。
    if (DEFINITION_DISASTER.test(predicate)) return true;

    // 名前が保護語で終わるものは冒頭文でも落とさない(保護 → 除外の順を保つ)。
    // isExcludedName と同じ正規化後の文字列で見ないと判断がねじれる。
    if (isProtectedName(stripDisambiguation(t) || t)) return false;

    // R132: 「そもそも行ける場所か」。人物・出来事は場所ではないので落とす。
    // **保護リストより後ろ**に置く(安全側)。実測で対象3件はいずれも保護語で終わる名前を
    // 持たないため、保護の前後どちらでも同じ3件が落ちる。両方の位置で 4エリアの
    // dump-rank を取って差分が同一であることを確認したうえで、保護されている候補
    //(`公園`/`記念碑`/`史跡`/`城` 等)を将来も巻き込まない後ろ側を採った。
    if (e && DEFINITION_PERSON_LIFESPAN.test(e.slice(0, 120))) return true;
    for (var p = 0; p < DEFINITION_NOT_PLACE.length; p++) {
      if (predicate.indexOf(DEFINITION_NOT_PLACE[p]) !== -1) return true;
    }

    // R133: 単一の場所ではない Wikipedia の索引記事。他の判定と違い definitionPredicate() /
    // definitionScope() を通さず、extract の生の先頭に当てる(主題部を捨てると
    // `本項では` 自体が消えるため)。R132 と同じく保護リストより後ろに置く。実装時に
    // 「保護語で終わり かつ ^本項では に当たる」記事が4エリアに0件であることを確認済みで、
    // 保護リストの前後どちらに置いても結果は同一。
    if (e && DEFINITION_INDEX_ARTICLE.test(e)) return true;

    if (e) {
      for (var i = 0; i < EXTRACT_KEYWORD_NG.length; i++) {
        if (e.indexOf(EXTRACT_KEYWORD_NG[i]) !== -1) return true;
      }
      // R117: 宿泊施設語は定義文(冒頭の一文)の**述部だけ**で見る。
      // 上のループと同じく extract 全体を走査すると、二文目以降の「〜ホテルに隣接している」で
      // 観光対象を巻き込む。さらに定義文の主題部(「〇〇ホテル前（まえ）は、」)は記事名の
      // 言い直しなので、そこを見ると名前で落とすのと同じになってしまう。述部に限る。
      for (var j = 0; j < DEFINITION_LODGING_NG.length; j++) {
        if (predicate.indexOf(DEFINITION_LODGING_NG[j]) !== -1) return true;
      }
    }
    return false;
  }

  /**
   * R80: 語の除外に当たった Wikipedia 記事を「OSM の観光タグ付き要素として実在する」
   * という構造化された証拠で救済してよいかどうか。
   *
   * 背景: OSM 候補は geo.js の buildOverpassQuery が tourism / historic / leisure /
   * amenity / natural / man_made の限られた値でしか要素を取ってこないため、
   * 応答に入っている時点で「観光の対象としてタグ付けされている」ことが確定している。
   * 一方 Wikipedia 記事にはタグが無く、isExcludedArticle の語のルールが唯一の門だった。
   * そのため「OSM に tourism=attraction として載っているのに、名前や冒頭文の語で
   * wiki 側だけが落ちる」という非対称が残っていた(R79 の指摘した語ベースの天井)。
   *
   * 判定は既に語のルールを通過して確定している osmItems との突き合わせで行うが、
   * **統合(dedupe)で使う isSamePlace より厳しくする**。isSamePlace は「名前の包含 +
   * 150m 以内」でも同じ場所とみなすが、これは重複カードを潰すための緩さであって
   * (誤って寄せても表示が1枚に減るだけ)、救済の根拠としては危険なため。
   * 実測(4 fixture)では包含を許すと次の3件が誤爆した:
   *   箱根町 ← 箱根町立郷土資料館 / 鈴廣 ← 鈴廣かまぼこ博物館 / 愛媛大学 ← 愛媛大学ミュージアム
   * いずれも「施設の名前に自治体名・企業名・大学名が含まれている」だけで、記事の側は
   * 自治体・企業・大学という**より広い主体**であり観光スポットではない。
   *
   * そこで救済の根拠は次の2つだけに絞る(どちらも名前レベルの同一性がある):
   *   a) OSM 要素の wikipedia タグがその記事を名指ししている(最も確かな構造化証拠)
   *   b) 正規化した名前が完全一致し、かつ DEDUPE_NEAR_M 以内にある
   * 一致した記事はこの後の統合で必ずその OSM 候補に吸収されるので、救済で候補の
   * 件数が増えることはなく、写真・要約が付いて source が both になるだけになる。
   *
   * @param {{title:string, lat:number, lon:number}} article geosearch の記事
   * @param {Array<object>} osmItems 語のルールを通過済みの OSM 候補
   * @returns {boolean} true なら除外を取り消してよい
   */
  function hasOsmTagEvidence(article, osmItems) {
    if (!Array.isArray(osmItems) || !osmItems.length) return false;
    var title = typeof article.title === 'string' ? article.title.trim() : '';
    var nt = normalizeName(title);
    if (!nt) return false;
    for (var i = 0; i < osmItems.length; i++) {
      var item = osmItems[i];
      // a) wikipedia タグでの名指し。座標は問わない(タグ自体が同一性の宣言)。
      if (item.wikipediaTitle && normalizeName(item.wikipediaTitle) === nt) return true;
      // b) 名前の完全一致 + 近接。包含は採らない(上のコメントの誤爆3件のため)。
      if (normalizeName(item.name) !== nt) continue;
      if (distanceBetween(item.lat, item.lon, article.lat, article.lon) <= DEDUPE_NEAR_M) return true;
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
      openingHours: spot.openingHours || null,
      imageUrl: null,
      summary: null,
      // OSM 要素自身が持つ Wikipedia 紐づけ。geosearch の 50件上限の外にある記事
      // (大涌谷・彫刻の森美術館など)でも「Wikipedia に載っている」ことは分かるので、
      // 2ソース一致の判定材料としてここまで運ぶ。記事本文(写真・要約)は別途取得しない。
      wikipediaTitle: spot.wikipediaTitle || null,
      wikidataId: spot.wikidataId || null,
      source: 'osm'
    };
  }

  /**
   * 否認語を探す範囲。Wikipedia の冒頭文は「〜は、…にある○○である。」と
   * 自分が何であるかを最初の一文で書くので、そこだけを見る。
   * 二文目以降まで見ると「隣接するスキー場」のような記述で正当な温泉記事を落とす
   * (万座プリンスホテルが実例)。保険として120字でも頭打ちにする。
   */
  function definitionScope(title, extract) {
    var head = extract.slice(0, 120);
    var stop = head.indexOf('。');
    if (stop !== -1) head = head.slice(0, stop + 1);
    return title + ' ' + head;
  }

  /**
   * R117: 定義文から主題部(記事名の言い直し)を落とし、述部だけを返す。
   *
   * 日本語版 Wikipedia の定義文は「〇〇（よみ）は、…である。」と必ず記事名を言い直すため、
   * 定義文をそのまま走査すると**名前で落とすのと同じ**になってしまう。
   * 「〇〇ホテル前（まえ）は、神奈川県箱根町にある展望台である。」のようなバス停名が実例で、
   * 中身は展望台なのに主題部の「ホテル」で落ちる。そこで最初の「は、」(無ければ「は」)より
   * 後ろだけを見る。7件の宿はいずれも述部に「〜ホテル」「〜旅館」が来るので判定は変わらない。
   * 区切りが見つからないときは元の文字列をそのまま返す(取りこぼしは許容する方針)。
   */
  function definitionPredicate(scope) {
    var m = scope.search(/は[、,]/);
    if (m !== -1) return scope.slice(m + 2);
    var m2 = scope.indexOf('は');
    if (m2 !== -1) return scope.slice(m2 + 1);
    return scope;
  }

  /** hint に deny があり、定義文に否認語が含まれるなら true(その hint を採らない)。 */
  function isDenied(hint, scope) {
    var k;
    if (!hint.deny) return false;
    for (k = 0; k < hint.deny.length; k++) {
      if (scope.indexOf(hint.deny[k]) !== -1) return true;
    }
    return false;
  }

  /**
   * Wikipedia 記事のカテゴリを title / extract の語から推定する。
   * タイトルを先に見るのは、extract には周辺地名など無関係な語が混ざりやすいため。
   * ただし名前だけでは種別を誤ることがある(R115)ので、deny を持つ行は記事本文の
   * 定義文で否認されたら採らず、次の行へ送る。
   * 当たらなければ {category:'other', label:'スポット'}。
   */
  function guessWikiCategory(title, extract) {
    var t = typeof title === 'string' ? title : '';
    var e = typeof extract === 'string' ? extract : '';
    var scope = definitionScope(t, e);
    var i, j, hint;
    // R146: 裸の「城」は「城崎」「城崎郡」などの地名にも当たってしまうため words から外した。
    // 代わりに castle 行だけ、タイトル(曖昧さ回避カッコを剥がした形)の末尾一致で判定する。
    // words ループ(タイトル部分一致の周)と同じ優先順位の位置で評価すること。
    var strippedTitle = stripDisambiguation(t);
    for (i = 0; i < WIKI_CATEGORY_HINTS.length; i++) {
      hint = WIKI_CATEGORY_HINTS[i];
      if (isDenied(hint, scope)) continue;
      if (hint.category === 'castle' && /(城跡|城址|城)$/.test(strippedTitle)) return hint;
      for (j = 0; j < hint.words.length; j++) {
        if (t.indexOf(hint.words[j]) !== -1) return hint;
      }
    }
    // R147: extract 全文(e)を走査すると2文目以降の語に誤反応する
    // (例: 「長興山のシダレザクラ」は1文目「シダレザクラの巨木である」だが、
    //  2文目「紹太寺の敷地内」の「寺」に反応して神社・寺院と誤判定されていた)。
    // R115/R145 と同じ definitionScope() の範囲(タイトル+定義文1文目)だけを見る。
    for (i = 0; i < WIKI_CATEGORY_HINTS.length; i++) {
      hint = WIKI_CATEGORY_HINTS[i];
      if (isDenied(hint, scope)) continue;
      for (j = 0; j < hint.words.length; j++) {
        if (scope.indexOf(hint.words[j]) !== -1) return hint;
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
      openingHours: null,
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
   * 公式サイトURL のホスト名(先頭の `www.` は剥がす)。不正なURLなら null。
   * 「https://www.matsuyamajo.jp/」と「https://matsuyamajo.jp」を同じとみなすため。
   */
  function websiteHost(url) {
    if (typeof url !== 'string' || !url) return null;
    try {
      var host = new URL(url).hostname.toLowerCase();
      return host.indexOf('www.') === 0 ? host.slice(4) : host;
    } catch (e) {
      return null;
    }
  }

  /** 名前が純ASCII(=英語表記)かどうか。日本語が1文字でも混ざれば false。 */
  function looksAscii(name) {
    return typeof name === 'string' && /^[\x20-\x7E]+$/.test(name);
  }

  /**
   * 同じ場所かどうか。
   * (1) 正規化した名前が一致する、または
   * (2) 150m 以内で、一方の名前が他方を含み、かつ差分が施設語でない
   *     (「湯畑源泉」と「湯畑」は同じ。「天成園足湯」と「天成園」は別物)
   * (3) 日英表記ゆれの救済(下の isSameNameLanguagePair を参照)
   */
  function isSamePlace(a, b) {
    // OSM 要素が wikipedia タグで記事を名指ししているときは、それが最も確かな一致。
    // 「彫刻の森美術館」(OSM) と「箱根 彫刻の森美術館」(記事名) のように表記が
    // 違っても結び付けられる。
    var at = normalizeName(a.wikipediaTitle);
    var bt = normalizeName(b.wikipediaTitle);
    if (at && normalizeName(b.name) === at) return true;
    if (bt && normalizeName(a.name) === bt) return true;

    var na = normalizeName(a.name);
    var nb = normalizeName(b.name);
    if (!na || !nb) return false;
    if (na === nb) return true;
    var d = distanceBetween(a.lat, a.lon, b.lat, b.lon);
    if (d > DEDUPE_NEAR_M) return false;
    // 包含が成立するなら、差分が「敷地内の別施設」を表す語でない限り同じ場所
    var longer = na.length >= nb.length ? na : nb;
    var shorter = na.length >= nb.length ? nb : na;
    if (longer.indexOf(shorter) !== -1) {
      return !diffLooksLikeFacility(longer.split(shorter));
    }
    // 最後の救済: 日本語名と英語名で文字が1つも共通しないペア
    return isSameNameLanguagePair(a, b);
  }

  /**
   * 日英の表記ゆれで同じ場所が2件に割れているときの救済。
   *
   * 道後の松山城が「松山城」(historic=castle / contact:website=www.matsuyamajo.jp) と
   * 「Matsuyama Castle」(historic=castle / website=matsuyamajo.jp) の2要素に割れており、
   * 文字が1つも共通しないため既存の包含判定では絶対に潰せなかった。
   *
   * 誤爆(別施設どうしの併合)は写真・要約が化けるぶんカードの重複より実害が大きいので、
   * 4エリア総当たりの実測で誤爆0だった条件だけを採る。**4条件すべての AND**:
   *   1. 公式サイトのホスト名が一致(www. は無視)
   *   2. カテゴリが一致(items は主タグ文字列を持たず category しか無いため。
   *      historic=castle どうしは両方 'castle' に落ちるので主タグ一致と同義になる)
   *   3. 片方が純ASCII名・もう片方が日本語名(＝日英ペアであること)
   *   4. DEDUPE_NEAR_M(150m)以内 ← 呼び出し元の isSamePlace で確認済み
   *
   * 3 を外すと「宮永岳彦記念美術館」↔「弘法の里湯」(同じ市の公式サイト)や
   * うみたまごの館内施設が全部1件に潰れる。**この条件は緩めないこと。**
   */
  function isSameNameLanguagePair(a, b) {
    var ha = websiteHost(a.website);
    var hb = websiteHost(b.website);
    if (!ha || !hb || ha !== hb) return false;
    if (!a.category || !b.category || a.category !== b.category) return false;
    return looksAscii(a.name) !== looksAscii(b.name);
  }

  /**
   * OSM 内どうしの重複をまとめる。
   *
   * geo.js の dedupe は「名前が完全一致し、かつ小数3桁(約100m)まで同じ座標」しか
   * 潰せないため、同じ場所が表記違いの別要素として残る。
   * 例: 草津の湯畑は relation「湯畑」(leisure=hot_spring) と node「湯畑源泉」
   * (natural=hot_spring) の2件に割れていて、どちらも中途半端な順位に沈んでいた。
   *
   * ここでは isSamePlace(名前の包含 + 150m 以内)で同じ場所とみなせるものを1件に寄せる。
   * 名前は「短い方」を残す。湯畑源泉(55m)と湯畑(75m)なら、fetchSpots が距離順に
   * 並べている都合で先に来るのは湯畑源泉だが、人が探すのは「湯畑」の方であり、
   * 修飾の付いた長い名前は下位概念(源泉・入口・駐車場)であることが多いため。
   * 裏付け(公式サイト・wikipedia 紐づけ)は両方から拾い上げて失わない。
   */
  function mergeOsmDuplicates(items) {
    var kept = [];
    items.forEach(function (item) {
      for (var i = 0; i < kept.length; i++) {
        if (!isSamePlace(kept[i], item)) continue;
        var base = kept[i];
        // 片方にしか無い裏付けは捨てない
        var website = base.website || item.website || null;
        var openingHours = base.openingHours || item.openingHours || null;
        var wikipediaTitle = base.wikipediaTitle || item.wikipediaTitle || null;
        var wikidataId = base.wikidataId || item.wikidataId || null;
        // 短い名前(＝より一般に通る呼び名)の方を代表にする
        if (item.name.length < base.name.length) {
          base.id = item.id;
          base.name = item.name;
          base.lat = item.lat;
          base.lon = item.lon;
          base.distanceM = item.distanceM;
          base.category = item.category;
          base.categoryLabel = item.categoryLabel;
        }
        // カテゴリは分類できている方を優先する('other' は「分からなかった」の意)
        if (base.category === 'other' && item.category !== 'other') {
          base.category = item.category;
          base.categoryLabel = item.categoryLabel;
        }
        base.website = website;
        base.openingHours = openingHours;
        base.wikipediaTitle = wikipediaTitle;
        base.wikidataId = wikidataId;
        return;
      }
      kept.push(item);
    });
    return kept;
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
          // 名前の無い OSM 要素は提案しても意味がないので落とす。
          // 併せて観光対象でない名前(学校・病院・役所など)もここで落とす。
          // OSM にも tourism=attraction を付けた公共施設が混ざるため、
          // wiki 側と同じ語のルールを通す(extract は無いので名前だけで判定)。
          if (typeof spot.name !== 'string' || !spot.name.trim()) return;
          if (isExcludedName(spot.name)) return;
          var item = fromOsmSpot(spot, h);
          if (isHotelItself(item, h)) return;
          items.push(item);
        });
      }
      return mergeOsmDuplicates(items);
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
        // R80: 語で落ちる記事でも、既に確定した osmItems(= Overpass の観光タグを
        // 通ってきた要素)に同じ場所があれば通す。タグという構造化証拠を語より優先する。
        // osmItems はこの時点で必ず確定済み(上の buildOsmItems)なので参照して安全。
        if (isExcludedArticle(article.title, article.extract)
          && !hasOsmTagEvidence(article, osmItems)) return;
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

    // geosearch は 1回 50件が上限で、宿の周りに記事が密集していると打ち切り半径が
    // 数km まで縮む(箱根では 3.7km で頭打ち)。その外側にある大涌谷・彫刻の森美術館は
    // 「記事があるのに wiki 側の候補に現れない」ため osm 単独のままだった。
    // OSM 要素自身の wikipedia / wikidata タグは記事の存在を示す独立した裏付けなので、
    // 突き合わせに失敗しても 2ソース一致として扱う(写真・要約は無いままで、
    // 付くのは SOURCE_BOTH の加点だけ。rank の重みには手を触れていない)。
    merged.forEach(function (item) {
      if (item.source !== 'osm') return;
      if (item.wikipediaTitle || item.wikidataId) item.source = 'both';
    });

    // R127: 統合・昇格の後で、英語名だけの OSM 単独候補を落とす。
    // 日本語UIに「Kinosaki Ropeway」のような要約も写真も無いカードが出るのを防ぐ。
    // 4条件すべてが揃う場合だけ落とす(緩めると松山城のような統合済み候補まで消える)。
    //   1. item.source === 'osm'(上のループで 'both' に昇格しなかった=統合先が無い単独候補)
    //   2. 表示名に日本語文字が1つも無い(ラテン文字のみの名前)
    //   3. 要約(summary)が無い
    //   4. wikipediaTitle も wikidataId も無い(記事の裏付けが無い)
    merged = merged.filter(function (item) {
      if (item.source !== 'osm') return true;
      if (hasJapaneseChar(item.name)) return true;
      if (item.summary) return true;
      if (item.wikipediaTitle || item.wikidataId) return true;
      return false;
    });

    // R143: 動物園・水族館の「中の展示」(動物の種名そのもの)を落とす。
    // 「動物園そのもの」(ワンダーラクテンチ動物園・だっこしてZOO ほか)は絶対に巻き込まない。
    // 4条件すべてが揃う場合だけ落とす(緩めると正当な動物園まで消える)。
    //   1. item.source === 'osm'(統合で 'both' に昇格していない単独候補)
    //   2. item.category が zoo/aquarium(タグ由来。geo.js の detectCategory が付与)
    //   3. 記事の裏付けも公式サイトも無い(summary/wikipediaTitle/wikidataId/website 無し)
    //   4. 名前が施設語(ZOO_FACILITY_WORD)を1つも含まない(= 動物園そのものではなく中の展示)
    merged = merged.filter(function (item) {
      if (item.source !== 'osm') return true;
      if (item.category !== 'zoo' && item.category !== 'aquarium') return true;
      if (item.summary || item.wikipediaTitle || item.wikidataId || item.website) return true;
      var hasFacilityWord = ZOO_FACILITY_WORD.some(function (w) { return item.name.indexOf(w) > -1; });
      if (hasFacilityWord) return true;
      return false;
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

  /**
   * R84: 基礎スコアの内訳。`?debug=1` で「なぜこの順位か」を画面上で追うための純粋関数。
   * 加算の順序は baseScore と完全に同じにすること(浮動小数の加算順が変われば
   * 同点判定がぶれて並びが変わりうるため)。重み・閾値は一切変えない。
   */
  function scoreBreakdown(item, now) {
    var score = 0;
    var image = item.imageUrl ? WEIGHT.WIKI_IMAGE : 0;
    if (image) score += image;
    var summary = item.summary ? WEIGHT.WIKI_SUMMARY : 0;
    if (summary) score += summary;
    var official = safeUrl(item.website) ? WEIGHT.OFFICIAL_SITE : 0;
    if (official) score += official;
    var both = item.source === 'both' ? WEIGHT.SOURCE_BOTH : 0;
    if (both) score += both;
    var distance = -((item.distanceM || 0) / 1000 * WEIGHT.DISTANCE_PER_KM);
    score -= (item.distanceM || 0) / 1000 * WEIGHT.DISTANCE_PER_KM;
    var season = seasonBonus(item, now);
    score += season;
    return {
      image: image,
      summary: summary,
      official: official,
      both: both,
      distance: distance,
      season: season,
      base: score
    };
  }

  /** 裏付け + 距離減衰 + 季節ヒントの基礎スコア。カテゴリ多様性は後段で引く。 */
  function baseScore(item, now) {
    return scoreBreakdown(item, now).base;
  }

  /**
   * R151: カードに「なぜこれを出したか」の1文を作る。純粋関数(rank の重み・並び順には触れない)。
   * `card._debug` と `cardsInView`(present で slice 済みの cards 配列)だけから計算する。
   * 「記事と写真がある」単独、「宿から徒歩N分」は理由にしない(カードに既に出ている情報の重複になるため)。
   * 優先順に1つだけ返す。どれにも当たらなければ null(呼び出し側は行ごと出さない)。
   * @param {Object} card present() が作った Card(_debug 付き)
   * @param {Array} cardsInView 同じ画面に出ている cards 配列(母数。more/far は含めない)
   * @returns {?string}
   */
  function reasonFor(card, cardsInView) {
    var d = card && card._debug;
    if (!d) return null;
    var label = card.categoryLabel || 'スポット';

    if (d.categoryIndex === 0) {
      // 'other' は「カテゴリが分からなかった」なので唯一/一番近いを名乗らせない
      var sameCat = (Array.isArray(cardsInView) ? cardsInView : []).filter(function (c) {
        return c && c.categoryLabel === label && c._debug && c._debug.category === d.category;
      });
      if (d.category !== 'other') {
        if (sameCat.length === 1) return 'この一帯で唯一の' + label;
        if (sameCat.length >= 2) return label + 'ではいちばん近い';
      }
    }

    // R152 規則6: 同カテゴリの2番目以降でも、rank が無条件で許している枠
    // (CATEGORY_FREE_SLOTS)の内側なら「その土地でそのカテゴリを名乗れる一軒」とみなす。
    // 1番目しか拾わない従来規則だと、湯畑・松山城・別府地獄めぐり・大滝乃湯のような
    // 「2番目の有名どころ」が理由なしで落ちるため。
    // 母数に同カテゴリが2件以上あることを条件にし、1件しかないものは上の
    // 「この一帯で唯一の」に任せる(文言の重複を避ける)。
    if (d.categoryIndex >= 1 && d.categoryIndex <= CATEGORY_FREE_SLOTS && d.category !== 'other') {
      var sameCat2 = (Array.isArray(cardsInView) ? cardsInView : []).filter(function (c) {
        return c && c.categoryLabel === label && c._debug && c._debug.category === d.category;
      });
      if (sameCat2.length >= 2) return label + 'ならここも外せない';
    }

    if (d.image && d.summary && d.official && d.both) {
      return '写真・解説・公式サイトが揃っている';
    }
    var proofCount = (d.image ? 1 : 0) + (d.summary ? 1 : 0) + (d.official ? 1 : 0) + (d.both ? 1 : 0);
    if (proofCount >= 3) {
      return '記事と公式サイトで裏が取れている';
    }
    return null;
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
      var breakdown = scoreBreakdown(item, ctx.now);
      return { item: item, score: breakdown.base, breakdown: breakdown };
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
      entry.breakdown.categoryIndex = seen;
      if (seen >= CATEGORY_FREE_SLOTS) {
        // 3件目以降は出るほど重く減点し、同じカテゴリが延々と続くのを防ぐ
        entry.score -= WEIGHT.CATEGORY_PENALTY * (seen - CATEGORY_FREE_SLOTS + 1);
        entry.breakdown.categoryPenalty = -(WEIGHT.CATEGORY_PENALTY * (seen - CATEGORY_FREE_SLOTS + 1));
      }
    });

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.item.distanceM || 0) - (b.item.distanceM || 0);
    });

    // R84: `?debug=1` 用の内訳を item にぶら下げるだけ。並び順・スコアには一切影響しない
    // (常に付ける。engine 側にフラグ分岐を作らない方が「有無で不変」をテストで比べられて安全)。
    return scored.map(function (entry, i) {
      var d = { rank: i + 1, source: entry.item.source, category: entry.item.category,
                distanceM: entry.item.distanceM, total: entry.score,
                categoryPenalty: 0, categoryIndex: -1 };
      var keys = Object.keys(entry.breakdown);
      for (var k = 0; k < keys.length; k++) d[keys[k]] = entry.breakdown[keys[k]];
      entry.item._debug = d;
      return entry.item;
    });
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
      links: buildLinks(item, hotel),
      source: item.source || 'osm',
      openingHours: item.openingHours || null,
      wikipediaTitle: item.wikipediaTitle || null, // R123: 要約が無くても記事の存在を示す裏付け
      wikidataId: item.wikidataId || null, // R123: 同上(wikipediaタグが無い場合の裏付け)
      _debug: item._debug || null, // R84: ?debug=1 のときだけ描画する。通常動作では読まれない
      reason: null // R151: present() で cards 確定後に reasonFor() が埋める。more/far には付けない
    };
  }

  /**
   * 並んだ候補をカードにして、近いもの(cards)と遠いもの(far)に分ける。
   * 車で60分を超えるものは「もっと遠く」側に静かに回す(v3では×表示をしない)。
   *
   * @param {Array} items rank 済みの候補
   * @param {Object} hotel
   * @returns {{cards:Array, more:Array, far:Array}}
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

    // R151: 理由は「候補の母数」だけを母数に数える。more/far を母数に入れると
    // 視界に入っていない候補で「唯一」を名乗ることになり嘘になるため付けない。
    // R152: 母数は上位 REASON_POOL 件のまま固定し、切り出しだけ 5/10 にする。
    var pool = cards.slice(0, REASON_POOL);
    pool.forEach(function (card) {
      card.reason = reasonFor(card, pool);
    });

    // R152: 理由を付けられなかった候補は出さない(「件数だけ多い」の構造的な原因)。
    var withReason = pool.filter(function (card) { return !!card.reason; });
    // 理由付きが1件も無いエリアでは従来どおり上位から出す(空フィード回避のフォールバック)。
    var picked = withReason.length ? withReason : pool;

    return {
      cards: picked.slice(0, MAX_CARDS),
      more: picked.slice(MAX_CARDS, MAX_CARDS + MAX_MORE),
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
   * @param {Function} [onProgress] (stage, partial, meta) partial は {cards, more, far, osmFailed}、
   *        meta は {osmFailed:boolean}(OSM だけ落ちて Wikipedia で補った、の意)
   * @returns {Promise<{cards:Array, more:Array, far:Array, osmFailed:boolean}>}
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

  // ---------------------------------------------------------------------------
  // bundle: カードを「テーマの束」にまとめる(R157)
  // ---------------------------------------------------------------------------

  // category(22種)→ テーマ5〜6種への写像。カテゴリをそのまま束にすると
  // 25件に11〜13本の見出しが立って画面が見出しだらけになるため、粗くまとめる。
  // 表に無い category は FALLBACK_THEME に落とす(geo.js に key が増えても落ちない)。
  var FALLBACK_THEME = 'この土地の名物';
  var THEME_OF = {
    place_of_worship: '歴史を歩く',
    castle: '歴史を歩く',
    monument: '歴史を歩く',
    memorial: '歴史を歩く',
    ruins: '歴史を歩く',

    public_bath: '湯を楽しむ',
    hot_spring: '湯を楽しむ',
    spring: '湯を楽しむ',

    // 塔(viewpoint)も山も滝も「景色を見にいく」なら無理がない。
    // 「自然を見る」にするとタワーが浮き、viewpoint を分けると1件束ができる。
    peak: '景色を見にいく',
    waterfall: '景色を見にいく',
    viewpoint: '景色を見にいく',
    cave: '景色を見にいく',
    nature: '景色を見にいく',
    picnic_site: '景色を見にいく',
    lighthouse: '景色を見にいく',

    park: '緑をゆっくり',
    garden: '緑をゆっくり',

    museum: '屋内でじっくり',
    theme_park: '屋内でじっくり',
    zoo: '屋内でじっくり',
    aquarium: '屋内でじっくり',

    attraction: FALLBACK_THEME,
    other: FALLBACK_THEME
  };

  /**
   * カード配列をテーマの束にまとめる。純関数。
   *
   * 返すのは元配列の添字だけを持つ [{ label, indices: [...] }]。
   * indices は昇順(= rank 順)のままで、束の並びは「その束の最小の添字」の昇順
   * (= 上位カードを持つ束が上)。
   *
   * R158: 呼び出し側はこの indices の順にカードを並べ替えて描画する。
   * 見出しだけを rank 順の並びに挿すと、見出しの下に他の束のカードが混ざり
   * 「興味のない束を読み飛ばす」という目的が果たせないため(R157 の不具合)。
   * 添字そのものは保持するので、番号バッジ・data-index は rank 順のまま動かない。
   *
   * 1件しかない束は作らず FALLBACK_THEME へ寄せる(見出し1本に中身1件を構造的に作らない)。
   * 寄せた結果 FALLBACK_THEME も1件なら label を null にして見出しを出さない。
   */
  function bundle(cards) {
    var list = Array.isArray(cards) ? cards : [];
    var order = [];   // label の初出順
    var byLabel = {};

    list.forEach(function (card, i) {
      var cat = card && card._debug ? card._debug.category : null;
      var label = (cat && THEME_OF[cat]) || FALLBACK_THEME;
      if (!byLabel[label]) { byLabel[label] = []; order.push(label); }
      byLabel[label].push(i);
    });

    // R158: 1件だけの束は「見出し1本に中身1件」になるので見出しを持てない。
    // R157 はこれを FALLBACK_THEME(「この土地の名物」)へ寄せていたが、
    // 公園1件が「この土地の名物」の見出しの下に並ぶなど**見出しが嘘になる**ため、
    // 寄せるのをやめ、ラベルを持たない束(label: null)に集めて最後に置く。
    // これで「見出しの下にはその束のカードしか無い」が構造的に保証される。
    var strays = [];
    order.forEach(function (label) {
      if (byLabel[label].length === 1) {
        strays.push(byLabel[label][0]);
        byLabel[label] = [];
      }
    });

    var out = order.filter(function (label) {
      return byLabel[label] && byLabel[label].length;
    }).map(function (label) {
      return { label: label, indices: byLabel[label] };
    });

    // 束の並び = その束の最上位カード(最小の添字)の順位が高い順
    out.sort(function (a, b) { return a.indices[0] - b.indices[0]; });

    // 見出しの付かない端数は必ず最後。並びは rank 順のまま
    if (strays.length) {
      out.push({ label: null, indices: strays.sort(function (a, b) { return a - b; }) });
    }

    return out;
  }

  global.YadoEngine = {
    suggest: suggest,
    // テスト・差し替え用に3段を個別に公開する
    collect: collect,
    rank: rank,
    present: present,
    bundle: bundle
  };
})(typeof window !== 'undefined' ? window : globalThis);
