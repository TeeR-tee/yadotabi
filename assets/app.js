/* やどたび v1 - app.js
   UI制御のみを担当する。地理情報検索(geo.js)・プラン生成(planner.js)・
   「行った！」記録(visits.js)は window.YadoGeo / YadoPlanner / YadoVisits の
   契約に従って呼び出す。

   状態は state ひとつに集約し、描き直しはすべて render() を通す。
   「行った！」のトグルも、人気度(enrichFame)取得後の更新も、
   state を書き換えて render() を呼ぶだけで済むようにするための構成。 */

(function () {
  "use strict";

  // ---- 状態 ----
  // hotel: 確定したホテル / spots: 取得したスポット配列(enrichFameで書き換わる)
  // reco : buildRecommendation の結果 / nights・mode: 検索条件
  const state = {
    hotel: null,
    spots: [],
    reco: null,
    nights: 1,
    mode: "transit",
  };

  let map = null;
  let mapMarkers = [];
  let mapTileLayer = null;

  // ---- DOM ----
  const hotelInput = document.getElementById("hotel-input");
  const nightsSeg = document.getElementById("nights-seg");
  const modeSeg = document.getElementById("mode-seg");
  const searchBtn = document.getElementById("search-btn");
  const statusArea = document.getElementById("status-area");
  const candidatesArea = document.getElementById("candidates-area");
  const candidatesList = document.getElementById("candidates-list");
  const resultArea = document.getElementById("result-area");
  const visitSummary = document.getElementById("visit-summary");
  const classicsArea = document.getElementById("classics-area");
  const classicsTitle = document.getElementById("classics-title");
  const classicsNote = document.getElementById("classics-note");
  const classicsList = document.getElementById("classics-list");
  const discoveriesArea = document.getElementById("discoveries-area");
  const discoveriesList = document.getElementById("discoveries-list");
  const boxesArea = document.getElementById("boxes-area");
  const planBoxesEl = document.getElementById("plan-boxes");
  const excludedArea = document.getElementById("excluded-area");
  const excludedList = document.getElementById("excluded-list");

  const RADIUS_BY_MODE = { walk: 4000, transit: 15000, car: 40000 };
  const BADGE_CLASS = { walk: "badge--ok", transit: "badge--caution", car: "badge--caution", unreachable: "badge--ng" };

  // ---- セグメント選択の共通処理 ----
  function setupSegment(container) {
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg__btn");
      if (!btn) return;
      container.querySelectorAll(".seg__btn").forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
    });
  }
  setupSegment(nightsSeg);
  setupSegment(modeSeg);

  function getSegValue(container) {
    const active = container.querySelector(".seg__btn.is-active");
    return active ? active.dataset.value : null;
  }

  // ---- 状態表示 ----
  function showStatus(html) {
    statusArea.innerHTML = html;
    statusArea.hidden = false;
  }
  function hideStatus() {
    statusArea.hidden = true;
    statusArea.innerHTML = "";
  }
  function showSpinner(message) {
    showStatus(
      '<div class="yado-spinner" aria-hidden="true"></div><span>' + escapeHtml(message) + "</span>"
    );
  }
  function showError(message) {
    showStatus(
      '<div class="alert alert--danger" style="width:100%;"><span>⚠️</span><div><p class="alert__title">エラー</p><p class="mb-0">' +
        escapeHtml(message) +
        "</p></div></div>"
    );
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  function resetResult() {
    state.hotel = null;
    state.spots = [];
    state.reco = null;
    resultArea.hidden = true;
    candidatesArea.hidden = true;
    candidatesList.innerHTML = "";
    classicsList.innerHTML = "";
    discoveriesList.innerHTML = "";
    planBoxesEl.innerHTML = "";
    excludedList.innerHTML = "";
    classicsArea.hidden = true;
    discoveriesArea.hidden = true;
    boxesArea.hidden = true;
    excludedArea.hidden = true;
    visitSummary.hidden = true;
  }

  // ---- 検索ボタン ----
  searchBtn.addEventListener("click", async () => {
    const query = hotelInput.value.trim();
    if (!query) {
      showError("ホテル名を入力してください。");
      return;
    }
    if (typeof window.YadoGeo === "undefined") {
      showError("YadoGeo未定義: geo.js が読み込まれていません。");
      return;
    }

    resetResult();
    hideStatus();
    showSpinner("宿を探しています…");
    searchBtn.disabled = true;

    try {
      const candidates = await window.YadoGeo.geocodeHotel(query);

      if (!candidates || candidates.length === 0) {
        hideStatus();
        showError("見つかりませんでした。ホテル名や住所を変えて試してください。");
        return;
      }

      if (candidates.length === 1) {
        await selectHotel(candidates[0]);
      } else {
        hideStatus();
        renderCandidates(candidates);
      }
    } catch (err) {
      hideStatus();
      showError(err && err.message ? err.message : "検索中にエラーが発生しました。");
    } finally {
      searchBtn.disabled = false;
    }
  });

  hotelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchBtn.click();
  });

  // ---- 候補リスト表示 ----
  function renderCandidates(candidates) {
    candidatesList.innerHTML = "";
    candidates.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "candidate-btn";
      btn.textContent = c.displayName || c.name;
      btn.addEventListener("click", () => {
        candidatesArea.hidden = true;
        searchBtn.disabled = true;
        selectHotel(c).finally(() => {
          searchBtn.disabled = false;
        });
      });
      candidatesList.appendChild(btn);
    });
    candidatesArea.hidden = false;
  }

  // ---- ホテル確定後の処理 ----
  // 段階的に見せる: スポット取得 → 先に描画 → 人気度が揃ったら描き直す。
  // enrichFame は数秒かかるので、待たせずに一度描いてしまうのが肝。
  async function selectHotel(hotel) {
    candidatesArea.hidden = true;

    if (typeof window.YadoPlanner === "undefined") {
      showError("YadoPlanner未定義: planner.js が読み込まれていません。");
      return;
    }

    state.hotel = { name: hotel.name, lat: hotel.lat, lon: hotel.lon, displayName: hotel.displayName };
    state.mode = getSegValue(modeSeg) || "transit";
    state.nights = parseInt(getSegValue(nightsSeg), 10) === 2 ? 2 : 1;

    const radiusM = RADIUS_BY_MODE[state.mode];

    showSpinner("周辺のスポットを集めています…");

    try {
      state.spots = await window.YadoGeo.fetchSpots(hotel.lat, hotel.lon, radiusM);
    } catch (err) {
      hideStatus();
      showError(err && err.message ? err.message : "スポット取得中にエラーが発生しました。");
      return;
    }

    if (!state.spots.length) {
      hideStatus();
      showError("このホテルの周辺では観光スポットが見つかりませんでした。移動手段を「車」にすると範囲が広がります。");
      return;
    }

    // 人気度が無いまま一度描く(体感速度優先)
    if (!rebuildReco()) return;
    render();

    // 人気度を取りに行き、揃ったら同じ state を描き直す
    showSpinner("みんなの人気度を調べています…");
    try {
      await window.YadoGeo.enrichFame(state.spots);
    } catch (err) {
      // enrichFame は例外を投げない契約だが、念のため握りつぶして描画を続ける
    }
    hideStatus();
    if (!rebuildReco()) return;
    render();
  }

  /** state.spots から推薦を組み直す。失敗したらエラー表示して false。 */
  function rebuildReco() {
    try {
      state.reco = window.YadoPlanner.buildRecommendation({
        hotel: { name: state.hotel.name, lat: state.hotel.lat, lon: state.hotel.lon },
        spots: state.spots,
        nights: state.nights,
        mode: state.mode,
      });
      return true;
    } catch (err) {
      hideStatus();
      showError(err && err.message ? err.message : "プランの作成に失敗しました。");
      return false;
    }
  }

  // ---- 描画(state を丸ごと描き直す) ----
  function render() {
    if (!state.hotel || !state.reco) return;
    const reco = state.reco;

    resultArea.hidden = false;
    renderMap();
    renderVisitSummary();
    renderClassics(reco.classics || []);
    renderDiscoveries(reco.discoveries || []);
    renderPlanBoxes(reco.boxes || []);
    renderExcluded(reco.excluded || []);
  }

  // ---- 地図 ----
  // map もタイルレイヤーも1回だけ生成する。再検索ではマーカーだけ入れ替える。
  // (v0ではここで毎回 tileLayer を追加していて、タイルが重なっていた)
  function renderMap() {
    const hotel = state.hotel;
    const mapEl = document.getElementById("map");

    if (!map) {
      map = L.map(mapEl);
    }
    if (!mapTileLayer) {
      mapTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
    }

    mapMarkers.forEach((m) => map.removeLayer(m));
    mapMarkers = [];

    const bounds = [];

    const hotelIcon = L.divIcon({
      className: "",
      html: '<div style="background:var(--c-primary,#3b82f6);width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    const hotelMarker = L.marker([hotel.lat, hotel.lon], { icon: hotelIcon }).addTo(map);
    hotelMarker.bindPopup("🏨 " + escapeHtml(hotel.name));
    mapMarkers.push(hotelMarker);
    bounds.push([hotel.lat, hotel.lon]);

    // 同じスポットが定番と箱の両方に出るので、座標キーで重複マーカーを避ける
    const seen = Object.create(null);
    const allItems = [];
    const reco = state.reco;
    [reco.classics, reco.discoveries, reco.excluded].forEach((list) => {
      (list || []).forEach((item) => allItems.push(item));
    });
    (reco.boxes || []).forEach((box) => allItems.push(...(box.items || [])));

    allItems.forEach((item) => {
      const spot = item.spot;
      if (!spot) return;
      const key = spot.id != null ? String(spot.id) : spot.lat + "," + spot.lon;
      if (seen[key]) return;
      seen[key] = true;

      const marker = L.marker([spot.lat, spot.lon]).addTo(map);
      marker.bindPopup(escapeHtml(spot.name) + " " + escapeHtml(item.badgeLabel || ""));
      mapMarkers.push(marker);
      bounds.push([spot.lat, spot.lon]);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [24, 24] });
    } else {
      map.setView(bounds[0], 15);
    }

    setTimeout(() => map.invalidateSize(), 100);
  }

  // ---- あなたの記録 ----
  function renderVisitSummary() {
    if (typeof window.YadoVisits === "undefined" || !state.hotel) {
      visitSummary.hidden = true;
      return;
    }
    const hotelKey = window.YadoVisits.hotelKeyOf(state.hotel);
    const here = window.YadoVisits.listByHotel(hotelKey).length;
    const all = window.YadoVisits.countAll();
    visitSummary.textContent = "あなたの記録: このホテルで " + here + "件 / 全体 " + all + "件";
    visitSummary.hidden = false;
  }

  // ---- 定番 ----
  function renderClassics(classics) {
    if (!classics.length) {
      classicsArea.hidden = true;
      return;
    }
    const fallback = Boolean(classics[0] && classics[0].fallback);

    if (fallback) {
      // 「定番」と言い切れる人気度のスポットが無かったケース。
      // 人気度が取れなかった場合と、取れたが基準に届かなかった場合の両方があるので、
      // どちらでも嘘にならない書き方にする(盛らないことが信頼の源泉)。
      classicsTitle.textContent = "まずはここ(周辺の主要スポット)";
      classicsNote.textContent =
        "この周辺には「定番」と言い切れるほど広く知られたスポットが見つかりませんでした。距離と種類をもとに選んでいます。";
      classicsNote.hidden = false;
    } else {
      classicsTitle.textContent = "🏨 " + state.hotel.name + "に泊まる人の定番";
      classicsNote.hidden = true;
      classicsNote.textContent = "";
    }

    classicsList.innerHTML = "";
    classics.forEach((item) => classicsList.appendChild(renderPlanItemCard(item)));
    classicsArea.hidden = false;
  }

  // ---- 発見 ----
  function renderDiscoveries(discoveries) {
    if (!discoveries.length) {
      discoveriesArea.hidden = true;
      return;
    }
    discoveriesList.innerHTML = "";
    discoveries.forEach((item) => discoveriesList.appendChild(renderPlanItemCard(item)));
    discoveriesArea.hidden = false;
  }

  // ---- 時間枠プラン ----
  function renderPlanBoxes(boxes) {
    const filled = boxes.filter((box) => (box.items || []).length > 0);
    if (!filled.length) {
      boxesArea.hidden = true;
      return;
    }
    planBoxesEl.innerHTML = "";
    filled.forEach((box) => {
      const section = document.createElement("div");
      section.className = "plan-box";

      const title = document.createElement("div");
      title.className = "plan-box__title";
      title.textContent = box.label;
      section.appendChild(title);

      (box.items || []).forEach((item) => {
        section.appendChild(renderPlanItemCard(item));
      });

      planBoxesEl.appendChild(section);
    });
    boxesArea.hidden = false;
  }

  // ---- 近そうで行けない ----
  function renderExcluded(excluded) {
    if (!excluded || excluded.length === 0) {
      excludedArea.hidden = true;
      return;
    }
    excludedList.innerHTML = "";
    excluded.forEach((item) => {
      excludedList.appendChild(renderPlanItemCard(item, true));
    });
    excludedArea.hidden = false;
  }

  // ---- スポットカード ----
  function renderPlanItemCard(item, isExcluded) {
    const spot = item.spot || {};
    const card = document.createElement("div");
    card.className = "card plan-item";

    const badgeClass = BADGE_CLASS[item.badge] || "badge--caution";

    const mapsUrl =
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(spot.lat + "," + spot.lon);

    const meta =
      escapeHtml(spot.categoryLabel || "") +
      (spot.distanceM != null ? " ・ " + escapeHtml(formatDistance(spot.distanceM)) : "") +
      (item.stayMin ? " ・ 滞在目安 " + item.stayMin + "分" : "") +
      (item.travelLabel && item.travelLabel !== "−" ? " ・ " + escapeHtml(item.travelLabel) : "");

    // 根拠の行。人気度(fameLabel)が取れていればそれを、無ければ選定理由を出す。
    const evidence = item.fameLabel
      ? '<div class="plan-item__fame">📊 ' + escapeHtml(item.fameLabel) + "</div>"
      : "";
    const reason = item.reason
      ? '<div class="plan-item__reason">' + escapeHtml(item.reason) + "</div>"
      : "";

    const website = isSafeUrl(spot.website)
      ? '<a class="plan-item__link" href="' + escapeHtml(spot.website) + '" target="_blank" rel="noopener">公式サイト →</a>'
      : "";

    card.innerHTML =
      '<div class="card__body">' +
      '<div class="plan-item__header">' +
      '<span class="plan-item__name">' + escapeHtml(spot.name || "") + "</span>" +
      '<span class="badge ' + badgeClass + '">' + escapeHtml(item.badgeLabel || "") + "</span>" +
      "</div>" +
      '<div class="plan-item__meta">' + meta + "</div>" +
      evidence +
      reason +
      '<div class="plan-item__actions">' +
      '<a class="plan-item__link" href="' + mapsUrl + '" target="_blank" rel="noopener">Googleマップで見る →</a>' +
      website +
      "</div>" +
      "</div>";

    if (!isExcluded) {
      card.querySelector(".plan-item__actions").appendChild(buildVisitButton(spot));
    }

    return card;
  }

  /** 「行った！」トグルボタン。描画のたびに YadoVisits.has で現在の状態を復元する。 */
  function buildVisitButton(spot) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--sm visit-btn";

    const visits = window.YadoVisits;
    const hotelKey = visits ? visits.hotelKeyOf(state.hotel) : null;
    const applyLabel = (on) => {
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "✓ 行った！" : "行った！";
    };

    applyLabel(Boolean(visits && spot.id && visits.has(hotelKey, spot.id)));

    btn.addEventListener("click", () => {
      if (!visits || !spot.id) return;
      const on = visits.toggle(state.hotel, spot);
      applyLabel(on);
      // 同じスポットが別セクションにも出ているので、まとめて描き直す
      render();
    });

    return btn;
  }

  /** 距離の表示。planner の formatDistance があればそれに合わせる。 */
  function formatDistance(distanceM) {
    if (window.YadoPlanner && typeof window.YadoPlanner.formatDistance === "function") {
      return window.YadoPlanner.formatDistance(distanceM);
    }
    return distanceM >= 1000 ? (distanceM / 1000).toFixed(1) + "km" : Math.round(distanceM) + "m";
  }

  /** OSMのwebsiteタグは値が自由なので、http(s)以外は表示しない(javascript: 対策)。 */
  function isSafeUrl(url) {
    if (typeof url !== "string") return false;
    return /^https?:\/\//i.test(url.trim());
  }
})();
