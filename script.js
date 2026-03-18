
const films = {
  fomapan200: { name: "Fomapan 200", boxIso: 200, suggestedIso: 160 },
  hp5: { name: "Ilford HP5 Plus", boxIso: 400, suggestedIso: 320 },
  fp4: { name: "Ilford FP4 Plus", boxIso: 125, suggestedIso: 100 },
  trix400: { name: "Kodak Tri-X 400", boxIso: 400, suggestedIso: 320 },
};

const filters = {
  none: { label: "No filter", factor: 1, stops: 0 },
  yellow8: { label: "Yellow Filter (#8)", factor: 2, stops: 1 },
  orange21: { label: "Orange Filter (#21)", factor: 4, stops: 2 },
  red25: { label: "Red Filter (#25)", factor: 8, stops: 3 },
  green11: { label: "Green Filter (#11)", factor: 2, stops: 1 },
  nd8: { label: "ND 0.9 (ND8)", factor: 8, stops: 3 },
};

const lightingPresets = {
  auto: { label: "Auto from uploaded image", ev: 12 },
  sunny: { label: "Sunny daylight", ev: 15 },
  overcast: { label: "Overcast daylight", ev: 13 },
  shade: { label: "Open shade", ev: 12 },
  indoor: { label: "Bright indoor window light", ev: 9 },
  dim: { label: "Dim interior / night street", ev: 5 },
};

const apertures = ["f/2.8", "f/4", "f/5.6", "f/8", "f/11", "f/16"];

let analyzedEv = null;
let imageStats = null;

const $ = (id) => document.getElementById(id);

function fillSelect(select, items, mapFn) {
  Object.entries(items).forEach(([key, value]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = mapFn(value);
    select.appendChild(opt);
  });
}

function fillArraySelect(select, items) {
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    select.appendChild(opt);
  });
}

function parseAperture(ap) {
  return Number(ap.replace("f/", ""));
}

function secondsToLabel(seconds) {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (secs === 0) return `${mins} min`;
    return `${mins} min ${secs} sec`;
  }
  if (seconds >= 1) return `${Number(seconds.toFixed(seconds >= 10 ? 0 : 1))} sec`;
  const denominator = Math.max(1, Math.round(1 / seconds));
  return `1/${denominator} sec`;
}

function roundToPracticalShutter(seconds) {
  const standardSeconds = [
    1/8000, 1/4000, 1/2000, 1/1000, 1/500, 1/250, 1/125, 1/60, 1/30, 1/15, 1/8, 1/4, 1/2,
    1, 2, 4, 8, 15, 30, 60, 120, 240, 480
  ];
  let best = standardSeconds[0];
  let bestDiff = Math.abs(Math.log2(seconds / best));
  for (const s of standardSeconds) {
    const diff = Math.abs(Math.log2(seconds / s));
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best;
}

function roundToNegativeFriendlyShutter(seconds) {
  const standardSeconds = [
    1/8000, 1/4000, 1/2000, 1/1000, 1/500, 1/250, 1/125, 1/60, 1/30, 1/15, 1/8, 1/4, 1/2,
    1, 2, 4, 8, 15, 30, 60, 120, 240, 480
  ];
  // choose same or longer exposure for negative film friendliness
  let candidate = standardSeconds[standardSeconds.length - 1];
  for (const s of standardSeconds) {
    if (s >= seconds) {
      candidate = s;
      break;
    }
  }
  return candidate;
}

function shutterRoundingNote(actualSeconds, practicalSeconds) {
  const stopDiff = Math.log2(practicalSeconds / actualSeconds);
  const abs = Math.abs(stopDiff);
  const rounded = abs < 0.05 ? "0.0" : abs.toFixed(1);
  if (abs < 0.05) return "Already close to a standard shutter speed.";
  if (stopDiff > 0) return `Rounded to a longer exposure for practical use (+${rounded} stop).`;
  return `Rounded to a shorter exposure for practical use (-${rounded} stop).`;
}

function reciprocityAdjustedSeconds(filmKey, seconds) {
  if (seconds < 1) return { applied: false, adjusted: seconds };
  switch (filmKey) {
    case "fomapan200": return { applied: true, adjusted: seconds * 2.5 };
    case "fp4": return { applied: true, adjusted: seconds * 2 };
    case "hp5": return { applied: true, adjusted: seconds * 1.6 };
    case "trix400": return { applied: true, adjusted: seconds * 1.8 };
    default: return { applied: false, adjusted: seconds };
  }
}

function getSceneBias() {
  if (!imageStats) return 0;
  if (imageStats.contrast > 0.45) {
    if (imageStats.shadowMean < 0.22) return -0.7;
    if (imageStats.highlightMean > 0.82) return 0.5;
  }
  return 0;
}

function calculateExposure() {
  const filmKey = $("filmStock").value;
  const filmId = $("filmId").value || "";
  const ratedIso = Number($("ratedIso").value) || films[filmKey].suggestedIso;
  const aperture = $("aperture").value;
  const lightingKey = $("lightingSource").value;
  const filterKey = $("filter").value;
  const compensation = Number($("compensation").value || 0);
  const lensCompensation = Number($("lensCompensation").value || 0);
  const priority = $("priority").value;

  let ev100 = (lightingKey === "auto" && typeof analyzedEv === "number")
    ? analyzedEv
    : lightingPresets[lightingKey].ev;

  if (priority === "Protect Highlights") ev100 += 0.5;
  if (priority === "Open Shadows") ev100 -= 0.5;

  const sceneBias = getSceneBias();
  ev100 += sceneBias;
  ev100 -= compensation;

  const effectiveRatedIso = ratedIso * Math.pow(2, lensCompensation);
  const fNumber = parseAperture(aperture);
  const evAtIso = ev100 + Math.log2(effectiveRatedIso / 100);
  const baseSeconds = (fNumber * fNumber) / Math.pow(2, evAtIso);
  const filterAdjusted = baseSeconds * filters[filterKey].factor;
  const reciprocity = reciprocityAdjustedSeconds(filmKey, filterAdjusted);

  return {
    filmKey,
    filmId,
    ratedIso,
    effectiveRatedIso,
    aperture,
    lightingKey,
    filterKey,
    ev100,
    sceneBias,
    meteredSeconds: filterAdjusted,
    finalSeconds: reciprocity.adjusted,
    reciprocityApplied: reciprocity.applied,
    priority
  };
}

function updateFilmFields() {
  const film = films[$("filmStock").value];
  $("boxIso").value = film.boxIso;
  $("suggestedIso").value = film.suggestedIso;
  $("ratedIso").value = film.suggestedIso;
  updateAll();
}

function getTip(result) {
  if (result.priority === "Open Shadows") return "Expose for the shadows.";
  if (result.priority === "Protect Highlights") return "Protect the highlights.";
  if (result.sceneBias < 0) return "High contrast detected. Extra shadow detail bias applied.";
  if (result.sceneBias > 0) return "Bright highlights detected. Highlight protection applied.";
  return "Balanced negative placement.";
}

function describeSceneBias(sceneBias) {
  if (sceneBias > 0) return `-${sceneBias.toFixed(1)} EV toward highlight protection`;
  if (sceneBias < 0) return `+${Math.abs(sceneBias).toFixed(1)} EV toward shadow detail`;
  return "No extra scene bias";
}

function updateAll() {
  const result = calculateExposure();
  const film = films[result.filmKey];
  const filter = filters[result.filterKey];
  const metered = `${secondsToLabel(result.meteredSeconds)} at ${result.aperture}`;
  const final = `${secondsToLabel(result.finalSeconds)} at ${result.aperture}`;
  const practicalShutterSeconds = roundToNegativeFriendlyShutter(result.finalSeconds);
  const practicalLabel = `${secondsToLabel(practicalShutterSeconds)} at ${result.aperture}`;
  const roundingNote = shutterRoundingNote(result.finalSeconds, practicalShutterSeconds);
  const sceneEvValue = (analyzedEv ?? result.ev100).toFixed(1);

  $("lightingSummary").textContent =
    result.lightingKey === "auto" && analyzedEv !== null
      ? `Estimated from uploaded image · EV ${analyzedEv}`
      : `${lightingPresets[result.lightingKey].label} · EV ${lightingPresets[result.lightingKey].ev}`;

  $("sumFilm").textContent = film.name;
  $("sumFilmId").textContent = result.filmId || "-";
  $("sumRatedIso").textContent = result.ratedIso;
  $("sumEffectiveIso").textContent = Math.round(result.effectiveRatedIso);
  $("sumFilter").textContent = filter.label;
  $("sumMetered").textContent = metered;
  $("sumFinal").textContent = final;
  $("sumSceneEv").textContent = sceneEvValue;

  $("resFilm").textContent = film.name;
  $("resBoxIso").textContent = film.boxIso;
  $("resSuggestedIso").textContent = film.suggestedIso;
  $("resRatedIso").textContent = result.ratedIso;
  $("resEffectiveIso").textContent = Math.round(result.effectiveRatedIso);
  $("resFilmId").textContent = result.filmId || "-";

  $("resFilterType").textContent = filter.label;
  $("resFilterFactor").textContent = `x${filter.factor}`;
  $("resFilterComp").textContent = filter.stops ? `+${filter.stops} stop` : "0 stop";

  $("resMetered").textContent = metered;
  $("resPracticalShutter").textContent = practicalLabel;
  $("resRoundingNote").textContent = roundingNote;
  $("resReciprocity").textContent = result.reciprocityApplied ? "Applied" : "Not needed";
  $("resSceneBias").textContent = describeSceneBias(result.sceneBias);
  $("resReciprocityNote").textContent = result.reciprocityApplied
    ? "Exposure time extended to correct for reciprocity failure."
    : "Exposure is short enough that no reciprocity correction is needed.";

  $("resFinal").textContent = final;
  $("resFinalNote").textContent = `Adjusted for ${filter.stops ? "filter and " : ""}${result.reciprocityApplied ? "reciprocity failure" : "selected filter"}`;
  $("resFinalPractical").textContent = `Use ${practicalLabel} as the nearest practical shutter setting.`;
  $("resEv").textContent = `EV ${sceneEvValue}`;
  $("resTip").textContent = getTip(result);
}

function analyzeImage(file) {
  const nameEl = $("uploadedName");
  const statusEl = $("analysisStatus");
  const img = $("imagePreview");
  const canvas = $("analysisCanvas");
  const ctx = canvas.getContext("2d");

  nameEl.textContent = file.name;
  nameEl.classList.remove("hidden");
  statusEl.textContent = "Analyzing uploaded image...";

  const url = URL.createObjectURL(file);
  img.src = url;
  img.classList.remove("hidden");

  img.onload = () => {
    const maxWidth = 200;
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const lumas = [];
    let total = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumas.push(luma);
      total += luma;
    }

    lumas.sort((a, b) => a - b);
    const pixels = lumas.length;
    const avg = total / pixels;
    const lowCount = Math.max(1, Math.floor(pixels * 0.1));
    const highCount = Math.max(1, Math.floor(pixels * 0.1));
    const shadowMean = lumas.slice(0, lowCount).reduce((a, b) => a + b, 0) / lowCount;
    const highlightMean = lumas.slice(-highCount).reduce((a, b) => a + b, 0) / highCount;
    const contrast = highlightMean - shadowMean;

    analyzedEv = Number((Math.max(5, Math.min(16, 5 + avg * 11))).toFixed(1));
    imageStats = { avgLuma: avg, shadowMean, highlightMean, contrast };

    $("lightingSource").value = "auto";
    statusEl.textContent = `Image analyzed. Estimated scene EV ${analyzedEv}. Contrast ${contrast.toFixed(2)}.`;
    updateAll();
  };
}



const STORAGE_SETTINGS_KEY = "filmMeterSettings";
const STORAGE_HISTORY_KEY = "filmMeterHistory";

function getCurrentState() {
  const result = calculateExposure();
  const film = films[result.filmKey];
  const filter = filters[result.filterKey];
  const sceneEvValue = Number((analyzedEv ?? result.ev100).toFixed(1));
  return {
    id: `meter_${Date.now()}`,
    timestamp: new Date().toISOString(),
    appVersion: "v8.0",
    film: {
      key: result.filmKey,
      name: film.name,
      boxIso: film.boxIso,
      suggestedIso: film.suggestedIso,
      ratedIso: result.ratedIso,
      effectiveIso: Math.round(result.effectiveRatedIso),
      filmId: result.filmId || ""
    },
    lens: {
      lensCompensationStops: Number($("lensCompensation").value || 0)
    },
    scene: {
      lightingSource: result.lightingKey,
      estimatedEv: sceneEvValue,
      averageLuma: imageStats ? Number(imageStats.avgLuma.toFixed(3)) : null,
      shadowMean: imageStats ? Number(imageStats.shadowMean.toFixed(3)) : null,
      highlightMean: imageStats ? Number(imageStats.highlightMean.toFixed(3)) : null,
      contrast: imageStats ? Number(imageStats.contrast.toFixed(3)) : null,
      sceneBiasEv: Number(result.sceneBias.toFixed(1))
    },
    exposure: {
      preferredAperture: result.aperture,
      meteringMode: $("meteringMode").value,
      zonePriority: $("priority").value,
      exposureCompensationEv: Number($("compensation").value || 0),
      filterKey: result.filterKey,
      filterLabel: filter.label,
      filterFactor: filter.factor,
      filterStops: filter.stops
    },
    result: {
      meteredExposureSeconds: Number(result.meteredSeconds.toFixed(4)),
      meteredExposureLabel: `${secondsToLabel(result.meteredSeconds)} at ${result.aperture}`,
      finalExposureSeconds: Number(result.finalSeconds.toFixed(4)),
      finalExposureLabel: `${secondsToLabel(result.finalSeconds)} at ${result.aperture}`,
      practicalExposureLabel: `${secondsToLabel(roundToNegativeFriendlyShutter(result.finalSeconds))} at ${result.aperture}`,
      reciprocityApplied: result.reciprocityApplied
    }
  };
}

function saveSettings() {
  const settings = {
    appVersion: "v8.0",
    filmStock: $("filmStock").value,
    filmId: $("filmId").value || "",
    ratedIso: $("ratedIso").value,
    lightingSource: $("lightingSource").value,
    preferredAperture: $("aperture").value,
    exposureCompensation: $("compensation").value,
    lensCompensation: $("lensCompensation").value,
    meteringMode: $("meteringMode").value,
    zonePriority: $("priority").value,
    filter: $("filter").value
  };
  localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return;
    const settings = JSON.parse(raw);
    if (settings.filmStock && films[settings.filmStock]) $("filmStock").value = settings.filmStock;
    $("filmId").value = settings.filmId || "";
    if (settings.ratedIso) $("ratedIso").value = settings.ratedIso;
    if (settings.lightingSource && lightingPresets[settings.lightingSource]) $("lightingSource").value = settings.lightingSource;
    if (settings.preferredAperture) $("aperture").value = settings.preferredAperture;
    if (settings.exposureCompensation !== undefined) $("compensation").value = settings.exposureCompensation;
    if (settings.lensCompensation !== undefined) $("lensCompensation").value = settings.lensCompensation;
    if (settings.meteringMode) $("meteringMode").value = settings.meteringMode;
    if (settings.zonePriority) $("priority").value = settings.zonePriority;
    if (settings.filter && filters[settings.filter]) $("filter").value = settings.filter;
  } catch (e) {
    console.error("Failed to load settings", e);
  }
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_HISTORY_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
}

function saveCurrentResult() {
  const entry = getCurrentState();
  const history = loadHistory();
  history.unshift(entry);
  saveHistory(history);
  saveSettings();
  renderHistory();
  alert("Result saved on this device.");
}

function renderHistory() {
  const list = $("historyList");
  const history = loadHistory();
  if (!history.length) {
    list.innerHTML = '<div class="emptyState">No saved results yet.</div>';
    return;
  }
  list.innerHTML = history.map(item => `
    <div class="historyItem">
      <div class="historyTop">
        <div>
          <div class="historyTitle">${item.film.filmId || item.film.name}</div>
          <div class="historyMeta">${new Date(item.timestamp).toLocaleString()}</div>
        </div>
        <div class="historyMeta">v${(item.appVersion || "v8.0").replace(/^v/,"")}</div>
      </div>
      <div class="historyGrid">
        <div><strong>Film:</strong> ${item.film.name}</div>
        <div><strong>Rated / Effective ISO:</strong> ${item.film.ratedIso} / ${item.film.effectiveIso}</div>
        <div><strong>Scene EV:</strong> ${item.scene.estimatedEv ?? "-"}</div>
        <div><strong>Filter:</strong> ${item.exposure.filterLabel}</div>
        <div><strong>Final Exposure:</strong> ${item.result.finalExposureLabel}</div>
        <div><strong>Practical Shutter:</strong> ${item.result.practicalExposureLabel}</div>
      </div>
    </div>
  `).join("");
}

function exportHistory() {
  const history = loadHistory();
  const blob = new Blob([JSON.stringify({ history }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "film-meter-history.json";
  a.click();
  URL.revokeObjectURL(url);
}

function clearHistory() {
  if (!confirm("Clear all saved history on this device?")) return;
  localStorage.removeItem(STORAGE_HISTORY_KEY);
  renderHistory();
}

function setScreen(screen) {
  $("inputScreen").classList.toggle("hidden", screen !== "input");
  $("resultScreen").classList.toggle("hidden", screen !== "result");
  $("historyScreen").classList.toggle("hidden", screen !== "history");
  $("showInputBtn").classList.toggle("active", screen === "input");
  $("showResultBtn").classList.toggle("active", screen === "result");
}



function init() {
  fillSelect($("filmStock"), films, v => v.name);
  fillSelect($("lightingSource"), lightingPresets, v => v.label);
  fillSelect($("filter"), filters, v => v.label);
  fillArraySelect($("aperture"), apertures);

  $("filmStock").value = "fomapan200";
  $("lightingSource").value = "auto";
  $("filter").value = "none";
  $("aperture").value = "f/8";

  loadSettings();
  updateFilmFields();

  ["filmId","ratedIso","lightingSource","aperture","compensation","lensCompensation","meteringMode","priority","filter"].forEach(id => {
    $(id).addEventListener("input", () => { updateAll(); saveSettings(); });
    $(id).addEventListener("change", () => { updateAll(); saveSettings(); });
  });

  $("filmStock").addEventListener("change", updateFilmFields);

  $("imageUpload").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) analyzeImage(file);
  });

  $("calculateBtn").addEventListener("click", () => {
    updateAll();
    setScreen("result");
  });

  $("showInputBtn").addEventListener("click", () => setScreen("input"));
  $("showResultBtn").addEventListener("click", () => {
    updateAll();
    setScreen("result");
  });
  $("backBtn").addEventListener("click", () => setScreen("input"));
  $("newCalcBtn").addEventListener("click", () => setScreen("input"));
  $("saveResultBtn").addEventListener("click", saveCurrentResult);
  $("viewHistoryBtn").addEventListener("click", () => { renderHistory(); setScreen("history"); });
  $("exportHistoryBtn").addEventListener("click", exportHistory);
  $("historyBackBtn").addEventListener("click", () => setScreen("input"));
  $("clearHistoryBtn").addEventListener("click", clearHistory);

  renderHistory();
  updateAll();
}

document.addEventListener("DOMContentLoaded", init);
