// script.js

// ─── Persistence ────────────────────────────────────────────────────────────

const STORAGE_KEY = "pick_a_movie_state_v1";

let state = {
  classifications: {},
  rankingWatchlist: [],
  rankingSeen: [],
  comparisonCounts: {},
  comparedPairs: { watchlist: {}, seen: {} },
  wins: { watchlist: {}, seen: {} }  // wins[mode][winnerId] = [loserId, ...]
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    if (parsed.classifications) state.classifications = parsed.classifications;
    if (Array.isArray(parsed.rankingWatchlist)) state.rankingWatchlist = parsed.rankingWatchlist;
    if (Array.isArray(parsed.rankingSeen)) state.rankingSeen = parsed.rankingSeen;
    if (parsed.comparisonCounts) state.comparisonCounts = parsed.comparisonCounts;
    if (parsed.comparedPairs) state.comparedPairs = parsed.comparedPairs;
    if (parsed.wins) state.wins = parsed.wins;
    // Back-compat: ensure wins exists
    if (!state.wins) state.wins = { watchlist: {}, seen: {} };
    if (!state.wins.watchlist) state.wins.watchlist = {};
    if (!state.wins.seen) state.wins.seen = {};
    if (!state.comparedPairs.watchlist) state.comparedPairs.watchlist = {};
    if (!state.comparedPairs.seen) state.comparedPairs.seen = {};
  } catch (err) {
    console.warn("Failed to load state:", err);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    if (err.name === "QuotaExceededError" || err.code === 22) {
      showToast("⚠ Storage full — please export your data");
    }
  }
}

function exportStateToFile() {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), state }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pick_a_movie_data.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Data exported");
}

function importStateFromFile(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!parsed?.state) { alert("This file doesn't look like Pick A Movie data."); return; }
      const s = parsed.state;
      if (!s.classifications || !Array.isArray(s.rankingWatchlist) || !Array.isArray(s.rankingSeen)) {
        alert("Imported data is missing required fields."); return;
      }
      if (!s.comparisonCounts) s.comparisonCounts = {};
      if (!s.comparedPairs) s.comparedPairs = { watchlist: {}, seen: {} };
      if (!s.wins) s.wins = { watchlist: {}, seen: {} };
      state = s;
      saveState();
      recomputeStats();
      showToast("Data imported");
    } catch {
      alert("There was a problem reading that file.");
    }
  };
  reader.readAsText(file);
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function showToast(msg, count) {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span class="dot"></span><span>${msg}</span>${count ? `<span class="count">+${count}</span>` : ""}`;
  wrap.appendChild(t);
  setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; }, 2000);
  setTimeout(() => t.remove(), 2400);
}

// ─── Screen navigation ───────────────────────────────────────────────────────

const SCREENS = ["home", "discovery", "ranking", "stats", "settings"];

function showScreen(name) {
  if (!SCREENS.includes(name)) name = "home";

  SCREENS.forEach(s => {
    const el = document.getElementById("screen-" + s);
    if (el) el.classList.toggle("hidden", s !== name);
  });

  const appbar = document.getElementById("appbar");
  if (appbar) appbar.style.display = name === "home" ? "" : "none";

  document.querySelectorAll(".tab").forEach(t => {
    t.classList.toggle("active", t.dataset.nav === name);
  });

  const body = document.getElementById("app-body");
  if (body) body.scrollTo({ top: 0, behavior: "instant" });
}

// ─── Stats & home screen ─────────────────────────────────────────────────────

function recomputeStats() {
  let watchlistCount = 0, seenCount = 0, notInterestedCount = 0;
  MOVIES.forEach(m => {
    const c = state.classifications[m.id];
    if (c === "watchlist") watchlistCount++;
    else if (c === "seen") seenCount++;
    else if (c === "not_interested") notInterestedCount++;
  });
  const unreviewedCount = MOVIES.length - (watchlistCount + seenCount + notInterestedCount);

  setText("stat-watchlist-count", watchlistCount);
  setText("stat-seen-count", seenCount);
  setText("stat-not-interested-count", notInterestedCount);
  setText("stat-unreviewed-count", unreviewedCount);
  setText("badge-unreviewed", unreviewedCount);

  updateTonightsPick();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function updateTonightsPick() {
  const ranking = state.rankingWatchlist;
  const titleEl = document.getElementById("tonight-title");
  const metaEl  = document.getElementById("tonight-meta");
  const ratingEl = document.getElementById("tonight-rating");
  const posterEl = document.getElementById("tonight-poster");
  const lbl = document.getElementById("tonight-poster-lbl");

  if (!ranking || ranking.length === 0) {
    if (titleEl) titleEl.textContent = "Add movies to your watchlist to get a pick";
    if (metaEl) metaEl.textContent = "";
    if (ratingEl) ratingEl.textContent = "";
    return;
  }

  const topId = ranking[0];
  const movie = MOVIES.find(m => m.id === topId);
  const metadata = MOVIE_METADATA?.[topId];

  if (titleEl) titleEl.textContent = movie?.title || "Unknown";
  if (metaEl) {
    const parts = [];
    if (movie?.year) parts.push(movie.year);
    const genre = movie?.genres?.split(",")[0]?.trim();
    if (genre) parts.push(genre);
    metaEl.textContent = parts.join(" · ");
  }
  if (ratingEl) ratingEl.textContent = metadata?.rating ? `★ ${metadata.rating.toFixed(1)} IMDB` : "";
  if (posterEl) {
    if (metadata?.poster) { posterEl.src = metadata.poster; if (lbl) lbl.style.display = "none"; }
    else { posterEl.src = ""; if (lbl) lbl.style.display = ""; }
  }
}

// ─── Discovery Filters ───────────────────────────────────────────────────────

let discoveryFilters = { genres: [], decades: [], minRating: 0 };

function populateDecadeChips() {
  const el = document.getElementById("decade-filters");
  if (!el) return;
  const decades = ["2020s","2010s","2000s","1990s","1980s","1970s","1960s","1950s","1940s","1930s","1920s"];
  el.innerHTML = "";
  decades.forEach(decade => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = decade;
    chip.dataset.decade = decade;
    chip.addEventListener("click", () => {
      const idx = discoveryFilters.decades.indexOf(decade);
      if (idx === -1) { discoveryFilters.decades.push(decade); chip.classList.add("active"); }
      else { discoveryFilters.decades.splice(idx, 1); chip.classList.remove("active"); }
    });
    el.appendChild(chip);
  });
}

function clearAllFilters() {
  discoveryFilters = { genres: [], decades: [], minRating: 0 };
  document.querySelectorAll("#decade-filters .chip").forEach(c => c.classList.remove("active"));
  document.querySelectorAll("#rating-chips .chip").forEach(c => c.classList.remove("active"));
  const anyChip = document.querySelector('#rating-chips .chip[data-rating="0"]');
  if (anyChip) anyChip.classList.add("active");
  showToast("Filters cleared");
}

function applyFiltersToMovies() {
  let filtered = MOVIES.filter(m => !state.classifications[m.id]);
  if (discoveryFilters.genres.length > 0) {
    filtered = filtered.filter(m => {
      if (!m.genres) return false;
      return discoveryFilters.genres.some(g => m.genres.includes(g));
    });
  }
  if (discoveryFilters.decades.length > 0) {
    filtered = filtered.filter(m => {
      return discoveryFilters.decades.some(dec => {
        const start = parseInt(dec);
        return m.year >= start && m.year < start + 10;
      });
    });
  }
  if (discoveryFilters.minRating > 0) {
    filtered = filtered.filter(m => {
      const meta = MOVIE_METADATA?.[m.id];
      return meta && meta.rating >= discoveryFilters.minRating;
    });
  }
  return filtered;
}

// ─── Discovery Queue ─────────────────────────────────────────────────────────

const DISCOVERY_BATCH_SIZE = 10;
let currentBatch = [];
let currentBatchIndex = 0;
let currentBatchNumber = 1;

function buildDiscoveryBatch() {
  const pool = applyFiltersToMovies();
  if (pool.length === 0) { currentBatch = []; currentBatchIndex = 0; return; }
  const shuffled = pool.sort(() => Math.random() - 0.5);
  currentBatch = shuffled.slice(0, DISCOVERY_BATCH_SIZE).map(m => m.id);
  currentBatchIndex = 0;
}

function startDiscovery() {
  buildDiscoveryBatch();
  currentBatchNumber++;
  showScreen("discovery");
  renderDiscovery();
}

function renderDiscovery() {
  const totalDone = Object.keys(state.classifications).length;
  setText("discovery-reviewed-count", totalDone + " DONE");
  setText("discovery-batch-label", "Batch " + currentBatchNumber);

  // Dots
  const dotsEl = document.getElementById("d-dots");
  if (dotsEl) {
    dotsEl.innerHTML = "";
    for (let i = 0; i < Math.max(currentBatch.length, 1); i++) {
      const cls = i < currentBatchIndex ? "on" : i === currentBatchIndex ? "cur" : "";
      dotsEl.innerHTML += `<i class="${cls}"></i>`;
    }
  }

  if (currentBatch.length === 0) {
    showDiscoveryEmpty("You've reviewed all movies matching your filters. Adjust filters in Settings or rank your watchlist!");
    return;
  }

  if (currentBatchIndex >= currentBatch.length) {
    showDiscoveryEmpty("Batch complete! Great work. Go back or start another batch.");
    return;
  }

  setText("discovery-progress", `${currentBatchIndex + 1} OF ${currentBatch.length}`);

  const movieId = currentBatch[currentBatchIndex];
  const movie = MOVIES.find(m => m.id === movieId);
  const metadata = MOVIE_METADATA?.[movieId];

  // Overlay title
  const titleEl = document.getElementById("discovery-movie-title");
  if (titleEl) titleEl.textContent = movie?.title || "Unknown movie";

  // Overlay meta (compact: year · genre · rating)
  const metaEl = document.getElementById("discovery-movie-meta");
  if (metaEl) {
    const parts = [];
    if (movie?.year) parts.push(movie.year);
    const firstGenre = movie?.genres?.split(",")[0]?.trim();
    if (firstGenre) parts.push(firstGenre);
    if (metadata?.rating) parts.push(`★ ${metadata.rating.toFixed(1)}`);
    metaEl.textContent = parts.join(" · ");
  }

  // Poster
  const posterEl = document.getElementById("discovery-poster");
  if (posterEl) {
    if (metadata?.poster) { posterEl.src = metadata.poster; posterEl.alt = movie?.title || ""; }
    else posterEl.src = "";
  }

  // Fact chips
  const chipsEl = document.getElementById("discovery-chips");
  if (chipsEl) {
    const chips = [];
    if (movie?.genres) {
      movie.genres.split(",").slice(0, 3).forEach(g => chips.push(`<span class="chip">${g.trim()}</span>`));
    }
    if (metadata?.rating) chips.push(`<span class="chip star">★ ${metadata.rating.toFixed(1)}</span>`);
    chipsEl.innerHTML = chips.join("");
  }

  // Overview
  const overviewEl = document.getElementById("discovery-movie-overview");
  if (overviewEl) {
    overviewEl.textContent = metadata?.overview || "";
    overviewEl.style.display = metadata?.overview ? "block" : "none";
  }

  // Credits
  const creditsEl = document.getElementById("discovery-movie-credits");
  if (creditsEl) {
    const parts = [];
    if (metadata?.director) parts.push(`<b>Dir.</b> ${metadata.director}`);
    if (metadata?.cast?.length) parts.push(`<b>With</b> ${metadata.cast.slice(0, 2).join(", ")}`);
    creditsEl.innerHTML = parts.join(" · ");
    creditsEl.style.display = parts.length ? "block" : "none";
  }

  // Empty message
  setText("discovery-empty-message", "");
  setDiscoveryButtonsEnabled(true);
}

function showDiscoveryEmpty(msg) {
  setText("discovery-movie-title", "");
  setText("discovery-progress", "");
  setText("discovery-movie-meta", "");
  const posterEl = document.getElementById("discovery-poster");
  if (posterEl) posterEl.src = "";
  const chipsEl = document.getElementById("discovery-chips");
  if (chipsEl) chipsEl.innerHTML = "";
  const overviewEl = document.getElementById("discovery-movie-overview");
  if (overviewEl) { overviewEl.textContent = ""; overviewEl.style.display = "none"; }
  const creditsEl = document.getElementById("discovery-movie-credits");
  if (creditsEl) { creditsEl.textContent = ""; creditsEl.style.display = "none"; }
  setText("discovery-empty-message", msg);
  setDiscoveryButtonsEnabled(false);
}

function setDiscoveryButtonsEnabled(enabled) {
  ["btn-discovery-seen", "btn-discovery-watchlist", "btn-discovery-not-interested", "btn-discovery-skip"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

function classifyCurrentMovie(category) {
  if (!currentBatch.length || currentBatchIndex >= currentBatch.length) return;
  const movieId = currentBatch[currentBatchIndex];
  state.classifications[movieId] = category;
  syncRankingArraysForClassificationChange(movieId, category);
  saveState();
  recomputeStats();

  const labels = { watchlist: "Added to watchlist", seen: "Marked as seen", not_interested: "Hidden" };
  showToast(labels[category] || "Done");

  currentBatchIndex++;
  renderDiscovery();
}

function skipCurrentMovie() {
  if (!currentBatch.length || currentBatchIndex >= currentBatch.length) return;
  currentBatchIndex++;
  renderDiscovery();
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

let currentRankingMode = "watchlist";
let currentLeftId = null;
let currentRightId = null;
let currentStatsMode = "watchlist";

function getIdsForMode(mode) {
  const target = mode === "watchlist" ? "watchlist" : "seen";
  return MOVIES.filter(m => state.classifications[m.id] === target).map(m => m.id);
}

function ensureRankingArray(mode) {
  const ids = getIdsForMode(mode);
  let ranking = mode === "watchlist" ? state.rankingWatchlist : state.rankingSeen;
  ranking = ranking.filter(id => ids.includes(id));
  ids.forEach(id => { if (!ranking.includes(id)) ranking.push(id); });
  if (mode === "watchlist") state.rankingWatchlist = ranking;
  else state.rankingSeen = ranking;
}

function syncRankingArraysForClassificationChange(movieId, category) {
  state.rankingWatchlist = state.rankingWatchlist.filter(id => id !== movieId);
  state.rankingSeen = state.rankingSeen.filter(id => id !== movieId);
  if (category === "watchlist") state.rankingWatchlist.push(movieId);
  else if (category === "seen") state.rankingSeen.push(movieId);
  saveState();
}

function startRanking(mode) {
  currentRankingMode = mode;
  ensureRankingArray(mode);

  // Update seg control
  document.querySelectorAll("#rank-seg button").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  const ids = getIdsForMode(mode);
  const pairArea = document.getElementById("ranking-pair-area");

  if (ids.length < 2) {
    if (pairArea) pairArea.style.display = "none";
    setText("ranking-empty-message", "You need at least 2 movies in this list. Add more via Discover first.");
  } else {
    if (pairArea) pairArea.style.display = "";
    setText("ranking-empty-message", "");
  }

  if (mode === "watchlist") {
    setText("ranking-title", "Rank");
    setText("ranking-description", "Which would you rather watch next?");
  } else {
    setText("ranking-title", "Rank");
    setText("ranking-description", "Which movie do you like more?");
  }

  showScreen("ranking");
  updateRankingProgress();
  renderRankingList();
  pickNextPair();
}

function updateRankingProgress() {
  const ranking = currentRankingMode === "watchlist" ? state.rankingWatchlist : state.rankingSeen;
  const n = ranking.length;
  const totalPairs = n > 1 ? (n * (n - 1)) / 2 : 0;
  const comparedCount = Object.keys(state.comparedPairs[currentRankingMode] || {}).length;
  const pct = totalPairs > 0 ? Math.min(100, Math.round((comparedCount / totalPairs) * 100)) : 0;

  const fillEl = document.getElementById("r-fill");
  if (fillEl) fillEl.style.width = pct + "%";
  setText("r-stable", pct + "%");
  setText("r-count", comparedCount + " pairs");

  // Inferred count (entries with value 'inferred')
  const inferredCount = Object.values(state.comparedPairs[currentRankingMode] || {}).filter(v => v === "inferred").length;
  setText("r-inferred", "+" + inferredCount);
}

function renderRankingList() {
  const ranking = currentRankingMode === "watchlist" ? state.rankingWatchlist : state.rankingSeen;
  const listEl = document.getElementById("ranking-list");
  if (!listEl) return;

  const top = ranking.slice(0, 5);
  listEl.innerHTML = "";
  top.forEach((id, idx) => {
    const movie = MOVIES.find(m => m.id === id);
    if (!movie) return;
    const count = state.comparisonCounts[id] || 0;
    const row = document.createElement("div");
    row.className = "cr-row" + (idx < 3 ? " top" : "");
    row.innerHTML = `
      <div class="n">${idx + 1}</div>
      <div class="p"></div>
      <div><div class="t">${movie.title}</div><div class="mt">${count} ${count === 1 ? "comparison" : "comparisons"}</div></div>
    `;
    listEl.appendChild(row);
  });

  setText("ranking-list-label", `TOP ${Math.min(top.length, 5)}`);
}

function getPairKey(id1, id2) {
  return id1 < id2 ? `${id1}_${id2}` : `${id2}_${id1}`;
}

function pickNextPair() {
  const ranking = currentRankingMode === "watchlist" ? state.rankingWatchlist : state.rankingSeen;
  if (!ranking || ranking.length < 2) return;

  const comparedPairs = state.comparedPairs[currentRankingMode];
  const n = ranking.length;
  const maxAttempts = n * n;
  let found = false;

  for (let attempt = 0; attempt < maxAttempts && !found; attempt++) {
    const li = Math.floor(Math.random() * n);
    const ri = Math.floor(Math.random() * n);
    if (li === ri) continue;
    const leftId = ranking[li];
    const rightId = ranking[ri];
    const key = getPairKey(leftId, rightId);
    if (!comparedPairs[key]) {
      currentLeftId = leftId;
      currentRightId = rightId;
      found = true;
    }
  }

  const pairArea = document.getElementById("ranking-pair-area");
  if (!found) {
    if (pairArea) pairArea.style.display = "none";
    setText("ranking-empty-message", "You've compared all possible pairs! Your ranking is complete.");
    return;
  }

  if (pairArea) pairArea.style.display = "";
  setText("ranking-empty-message", "");

  const leftMovie  = MOVIES.find(m => m.id === currentLeftId);
  const rightMovie = MOVIES.find(m => m.id === currentRightId);
  const leftMeta   = MOVIE_METADATA?.[currentLeftId];
  const rightMeta  = MOVIE_METADATA?.[currentRightId];

  setText("rank-left-title",  leftMovie?.title  || "Unknown");
  setText("rank-right-title", rightMovie?.title || "Unknown");

  // Posters
  const lpImg = document.getElementById("rank-left-poster");
  const rpImg = document.getElementById("rank-right-poster");
  const llbl  = document.getElementById("rank-left-poster-lbl");
  const rlbl  = document.getElementById("rank-right-poster-lbl");

  if (lpImg) { lpImg.src = leftMeta?.poster || ""; if (llbl) llbl.style.display = leftMeta?.poster ? "none" : ""; }
  if (rpImg) { rpImg.src = rightMeta?.poster || ""; if (rlbl) rlbl.style.display = rightMeta?.poster ? "none" : ""; }

  // Meta
  const leftMetaParts = [];
  if (leftMeta?.rating) leftMetaParts.push(`★ ${leftMeta.rating.toFixed(1)}`);
  if (leftMovie?.year) leftMetaParts.push(leftMovie.year);
  const firstLGenre = leftMovie?.genres?.split(",")[0]?.trim();
  if (firstLGenre) leftMetaParts.push(firstLGenre);
  setText("rank-left-meta", leftMetaParts.join(" · "));

  const rightMetaParts = [];
  if (rightMeta?.rating) rightMetaParts.push(`★ ${rightMeta.rating.toFixed(1)}`);
  if (rightMovie?.year) rightMetaParts.push(rightMovie.year);
  const firstRGenre = rightMovie?.genres?.split(",")[0]?.trim();
  if (firstRGenre) rightMetaParts.push(firstRGenre);
  setText("rank-right-meta", rightMetaParts.join(" · "));

  // Credits
  function buildCredits(meta) {
    const parts = [];
    if (meta?.director) parts.push(`<b>Dir.</b> ${meta.director}`);
    if (meta?.cast?.length) parts.push(`<b>With</b> ${meta.cast.slice(0, 2).join(", ")}`);
    return parts.join(" · ");
  }
  const lc = document.getElementById("rank-left-credits");
  if (lc) { lc.innerHTML = buildCredits(leftMeta); lc.style.display = leftMeta?.director ? "block" : "none"; }
  const rc = document.getElementById("rank-right-credits");
  if (rc) { rc.innerHTML = buildCredits(rightMeta); rc.style.display = rightMeta?.director ? "block" : "none"; }

  // Reset pick animation
  document.querySelectorAll(".pick").forEach(p => p.classList.remove("picked"));
}

function handleRankingChoice(winnerId, loserId) {
  const ranking = currentRankingMode === "watchlist" ? state.rankingWatchlist : state.rankingSeen;
  const winnerIdx = ranking.indexOf(winnerId);
  const loserIdx  = ranking.indexOf(loserId);
  if (winnerIdx === -1 || loserIdx === -1) { pickNextPair(); return; }

  // Record direct comparison
  const pairKey = getPairKey(winnerId, loserId);
  state.comparedPairs[currentRankingMode][pairKey] = winnerId;

  // Track wins for transitive closure
  if (!state.wins[currentRankingMode][winnerId]) state.wins[currentRankingMode][winnerId] = [];
  state.wins[currentRankingMode][winnerId].push(loserId);

  // Increment comparison counts
  state.comparisonCounts[winnerId] = (state.comparisonCounts[winnerId] || 0) + 1;
  state.comparisonCounts[loserId]  = (state.comparisonCounts[loserId]  || 0) + 1;

  // Update ranking order
  if (winnerIdx > loserIdx) {
    ranking.splice(winnerIdx, 1);
    const newIdx = ranking.indexOf(loserId);
    ranking.splice(newIdx, 0, winnerId);
  }
  if (currentRankingMode === "watchlist") state.rankingWatchlist = ranking;
  else state.rankingSeen = ranking;

  // Transitive closure
  const inferred = applyTransitiveClosure(winnerId, loserId);

  saveState();
  updateRankingProgress();
  renderRankingList();

  showToast("Preferred", inferred > 0 ? inferred : undefined);

  // Brief pick animation, then next pair
  const chosenCard = document.getElementById(winnerId === currentLeftId ? "btn-rank-left" : "btn-rank-right");
  if (chosenCard) chosenCard.classList.add("picked");
  setTimeout(() => pickNextPair(), 220);
}

function applyTransitiveClosure(winnerId, loserId) {
  const comparedPairs = state.comparedPairs[currentRankingMode];
  const wins = state.wins[currentRankingMode];
  let count = 0;

  // If A > B and B > C → A > C
  const loserWins = wins[loserId] || [];
  loserWins.forEach(c => {
    const key = getPairKey(winnerId, c);
    if (!comparedPairs[key]) { comparedPairs[key] = "inferred"; count++; }
  });

  // If D > A and A > B → D > B
  Object.entries(wins).forEach(([d, dWins]) => {
    if (d !== winnerId && d !== loserId && dWins.includes(winnerId)) {
      const key = getPairKey(d, loserId);
      if (!comparedPairs[key]) { comparedPairs[key] = "inferred"; count++; }
    }
  });

  return count;
}

// ─── Top Picks (Stats) screen ─────────────────────────────────────────────────

function showTopPicks(mode) {
  currentStatsMode = mode || "watchlist";

  // Update seg
  document.querySelectorAll("#stats-seg button").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === currentStatsMode);
  });

  ensureRankingArray(currentStatsMode);
  const ranking = currentStatsMode === "watchlist" ? state.rankingWatchlist : state.rankingSeen;
  const listEl  = document.getElementById("stats-ranking-list");

  // Tonight's pick hero
  if (ranking.length > 0) {
    const topMovie = MOVIES.find(m => m.id === ranking[0]);
    setText("stats-top-title", topMovie?.title || "—");
  } else {
    setText("stats-top-title", ranking.length === 0 ? "No movies yet" : "—");
  }

  if (!listEl) return;
  listEl.innerHTML = "";
  ranking.slice(0, 10).forEach((id, idx) => {
    const movie = MOVIES.find(m => m.id === id);
    const meta  = MOVIE_METADATA?.[id];
    if (!movie) return;

    const cls = idx === 0 ? "gold" : idx === 1 ? "silver" : idx === 2 ? "bronze" : "";
    const row = document.createElement("div");
    row.className = `top-row ${cls}`;
    const ratingStr = meta?.rating ? `★ ${meta.rating.toFixed(1)}` : "";
    const pairCount = state.comparisonCounts[id] || 0;
    const n = ranking.length;
    const totalPairs = n > 1 ? (n - 1) : 1;
    const confPct = Math.min(100, Math.round((pairCount / totalPairs) * 100));

    row.innerHTML = `
      <div class="rank">${idx + 1}</div>
      <div class="p">${meta?.poster ? `<img src="${meta.poster}" alt="${movie.title}" />` : ""}</div>
      <div>
        <div class="t">${movie.title}</div>
        <div class="mt">${movie.year}${ratingStr ? ` · <span class="s">${ratingStr}</span>` : ""}</div>
      </div>
      <div class="conf">${pairCount > 0 ? confPct + "%" : "—"}</div>
    `;
    listEl.appendChild(row);
  });

  // Insights
  const n = ranking.length;
  const totalPairs = n > 1 ? (n * (n - 1)) / 2 : 0;
  const comparedCount = Object.keys(state.comparedPairs[currentStatsMode] || {}).length;
  const inferredCount = Object.values(state.comparedPairs[currentStatsMode] || {}).filter(v => v === "inferred").length;
  const pct = totalPairs > 0 ? Math.min(100, Math.round((comparedCount / totalPairs) * 100)) : 0;
  const remaining = Math.max(0, Math.round((0.9 - comparedCount / totalPairs) * totalPairs));

  setText("stats-confidence", pct + "%");
  const confBar = document.getElementById("stats-conf-bar");
  if (confBar) confBar.style.width = pct + "%";
  setText("stats-conf-desc", pct < 90 && remaining > 0 ? `~${remaining} more pairs to 90%` : "Ranking complete!");
  setText("stats-inferred", "+" + inferredCount);

  showScreen("stats");
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function clearRankings(mode) {
  const name = mode === "watchlist" ? "Watchlist" : "Seen Movies";
  const ranking = mode === "watchlist" ? state.rankingWatchlist : state.rankingSeen;
  if (ranking.length === 0) { showToast("No " + name + " rankings to clear"); return; }
  if (!confirm(`Clear all ranking comparisons for your ${name}? Your classifications are kept.`)) return;
  state.comparedPairs[mode] = {};
  state.wins[mode] = {};
  ranking.forEach(id => delete state.comparisonCounts[id]);
  saveState();
  showToast(name + " rankings cleared");
}

// ─── Event listeners ─────────────────────────────────────────────────────────

function attachEventListeners() {
  // Tab bar
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const nav = tab.dataset.nav;
      if (nav === "ranking") startRanking(currentRankingMode);
      else if (nav === "stats") showTopPicks(currentStatsMode);
      else if (nav === "discovery") startDiscovery();
      else showScreen(nav);
    });
  });

  // Back buttons
  document.getElementById("btn-discovery-back")?.addEventListener("click", () => { showScreen("home"); recomputeStats(); });
  document.getElementById("btn-ranking-back")?.addEventListener("click", () => { showScreen("home"); recomputeStats(); });
  document.getElementById("btn-stats-back")?.addEventListener("click", () => showScreen("home"));
  document.getElementById("btn-settings-back")?.addEventListener("click", () => showScreen("home"));

  // Home buttons
  document.getElementById("btn-settings")?.addEventListener("click", () => showScreen("settings"));
  document.getElementById("btn-start-discovery")?.addEventListener("click", startDiscovery);
  document.getElementById("btn-rank-watchlist")?.addEventListener("click", () => startRanking("watchlist"));
  document.getElementById("btn-top-picks")?.addEventListener("click", () => showTopPicks("watchlist"));
  document.getElementById("btn-view-all")?.addEventListener("click", () => showTopPicks("watchlist"));
  document.getElementById("btn-reshuffle")?.addEventListener("click", () => {
    // Shuffle tonight's pick: move top to bottom, reveal second
    if (state.rankingWatchlist.length > 1) {
      const first = state.rankingWatchlist.shift();
      state.rankingWatchlist.push(first);
      updateTonightsPick();
      showToast("Shuffled tonight's pick");
    }
  });

  // Discovery classify
  document.getElementById("btn-discovery-watchlist")?.addEventListener("click", () => classifyCurrentMovie("watchlist"));
  document.getElementById("btn-discovery-seen")?.addEventListener("click", () => classifyCurrentMovie("seen"));
  document.getElementById("btn-discovery-not-interested")?.addEventListener("click", () => classifyCurrentMovie("not_interested"));
  document.getElementById("btn-discovery-skip")?.addEventListener("click", skipCurrentMovie);

  // Ranking picks (whole card is clickable)
  document.getElementById("btn-rank-left")?.addEventListener("click", () => {
    if (currentLeftId && currentRightId) handleRankingChoice(currentLeftId, currentRightId);
  });
  document.getElementById("btn-rank-right")?.addEventListener("click", () => {
    if (currentLeftId && currentRightId) handleRankingChoice(currentRightId, currentLeftId);
  });
  document.getElementById("btn-rank-skip")?.addEventListener("click", () => {
    showToast("Skipped");
    pickNextPair();
  });

  // Ranking seg control
  document.getElementById("rank-seg")?.addEventListener("click", e => {
    const btn = e.target.closest("button[data-mode]");
    if (btn) startRanking(btn.dataset.mode);
  });

  // Stats seg control
  document.getElementById("stats-seg")?.addEventListener("click", e => {
    const btn = e.target.closest("button[data-mode]");
    if (btn) showTopPicks(btn.dataset.mode);
  });

  // Stats buttons
  document.getElementById("btn-stats-rank")?.addEventListener("click", () => startRanking(currentStatsMode));
  document.getElementById("btn-stats-reshuffle")?.addEventListener("click", () => {
    const ranking = currentStatsMode === "watchlist" ? state.rankingWatchlist : state.rankingSeen;
    if (ranking.length > 1) {
      const first = ranking.shift();
      ranking.push(first);
      showTopPicks(currentStatsMode);
      showToast("Shuffled");
    }
  });

  // Settings: export / import
  document.getElementById("btn-export-data")?.addEventListener("click", exportStateToFile);
  document.getElementById("btn-import-data")?.addEventListener("click", () => {
    const inp = document.getElementById("import-file-input");
    if (inp) { inp.value = ""; inp.click(); }
  });
  document.getElementById("import-file-input")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) importStateFromFile(file);
  });

  // Settings: clear rankings
  document.getElementById("btn-clear-watchlist-rankings")?.addEventListener("click", () => clearRankings("watchlist"));
  document.getElementById("btn-clear-seen-rankings")?.addEventListener("click", () => clearRankings("seen"));

  // Settings: filters — rating chips
  document.getElementById("rating-chips")?.addEventListener("click", e => {
    const chip = e.target.closest(".chip[data-rating]");
    if (!chip) return;
    document.querySelectorAll("#rating-chips .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    discoveryFilters.minRating = parseFloat(chip.dataset.rating) || 0;
  });

  // Settings: clear filters
  document.getElementById("btn-clear-filters")?.addEventListener("click", clearAllFilters);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  populateDecadeChips();
  recomputeStats();
  attachEventListeners();
  showScreen("home");
});
