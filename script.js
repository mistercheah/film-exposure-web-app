const APP_VERSION = "v9.2";

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
  autoSaveCurrentSettings();
  const film = films[result.filmKey];
  const filter = filters[result.filterKey];
  const metered = `${secondsToLabel(result.meteredSeconds)} at ${result.aperture}`;
  const final = `${secondsToLabel(result.finalSeconds)} at ${result.aperture}`;
  const practicalShutterSeconds = roundToNegativeFriendlyShutter(result.finalSeconds);
  const practicalLabel = `${secondsToLabel(practicalShutterSeconds)} at ${result.aperture}`;
  const calculatedLabel = `${secondsToLabel(result.finalSeconds)} at ${result.aperture}`;
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
  $("resCalculated").textContent = calculatedLabel;
  $("resRoundingNote").textContent = roundingNote;
  $("resReciprocity").textContent = result.reciprocityApplied ? "Applied" : "Not needed";
  $("resSceneBias").textContent = describeSceneBias(result.sceneBias);
  $("resReciprocityNote").textContent = result.reciprocityApplied
    ? "Exposure time extended to correct for reciprocity failure."
    : "Exposure is short enough that no reciprocity correction is needed.";

  $("resFinalPractical").textContent = practicalLabel;
  $("resFinalNote").textContent = `Adjusted for ${filter.stops ? "filter and " : ""}${result.reciprocityApplied ? "reciprocity failure" : "selected filter"}`;
  $("resFinal").textContent = `Calculated exposure: ${calculatedLabel}`;
  $("resRoundingSummary").textContent = roundingNote;
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

function setScreen(screen) {
  const isInput = screen === "input";
  $("inputScreen").classList.toggle("hidden", !isInput);
  $("resultScreen").classList.toggle("hidden", isInput);
  $("showInputBtn").classList.toggle("active", isInput);
  $("showResultBtn").classList.toggle("active", !isInput);
}


function buildCurrentPayload(result) {
  const film = films[result.filmKey];
  const filter = filters[result.filterKey];
  const practicalShutterSeconds = roundToNegativeFriendlyShutter(result.finalSeconds);
  const practicalLabel = `${secondsToLabel(practicalShutterSeconds)} at ${result.aperture}`;
  const finalLabel = `${secondsToLabel(result.finalSeconds)} at ${result.aperture}`;
  const meteredLabel = `${secondsToLabel(result.meteredSeconds)} at ${result.aperture}`;
  const sceneEvValue = Number((analyzedEv ?? result.ev100).toFixed(1));
  const roundingStops = Number(Math.log2(practicalShutterSeconds / result.finalSeconds).toFixed(2));
  const imageNameEl = $("uploadedName");
  const imageFileName = imageNameEl && !imageNameEl.classList.contains("hidden") ? imageNameEl.textContent : "";

  return {
    timestamp: new Date().toISOString(),
    appVersion: APP_VERSION,
    film: {
      key: result.filmKey,
      name: film.name,
      boxIso: film.boxIso,
      suggestedIso: film.suggestedIso,
      ratedIso: result.ratedIso,
      effectiveIso: Math.round(result.effectiveRatedIso),
      filmId: result.filmId || ""
    },
    settings: {
      aperture: result.aperture,
      lensCompensation: Number($("lensCompensation").value || 0),
      exposureCompensation: Number($("compensation").value || 0),
      meteringMode: $("meteringMode").value,
      zonePriority: result.priority,
      filterKey: result.filterKey,
      filterLabel: filter.label,
      filterFactor: filter.factor,
      filterStops: filter.stops,
      lightingSource: result.lightingKey
    },
    scene: {
      estimatedEv: sceneEvValue,
      averageLuma: imageStats ? Number(imageStats.avgLuma.toFixed(4)) : null,
      shadowMean: imageStats ? Number(imageStats.shadowMean.toFixed(4)) : null,
      highlightMean: imageStats ? Number(imageStats.highlightMean.toFixed(4)) : null,
      contrast: imageStats ? Number(imageStats.contrast.toFixed(4)) : null,
      sceneBiasEv: Number(result.sceneBias.toFixed(2))
    },
    result: {
      meteredExposureLabel: meteredLabel,
      calculatedExposureLabel: finalLabel,
      practicalExposureLabel: practicalLabel,
      meteredExposureSeconds: Number(result.meteredSeconds.toFixed(6)),
      calculatedExposureSeconds: Number(result.finalSeconds.toFixed(6)),
      practicalExposureSeconds: Number(practicalShutterSeconds.toFixed(6)),
      roundingStops,
      reciprocityApplied: result.reciprocityApplied
    },
    image: {
      fileName: imageFileName || ""
    }
  };
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getSavedHistory() {
  try {
    return JSON.parse(localStorage.getItem("filmMeterHistory") || "[]");
  } catch (e) {
    return [];
  }
}

function saveResultToLocal() {
  const payload = buildCurrentPayload(calculateExposure());
  const history = getSavedHistory();
  history.push(payload);
  localStorage.setItem("filmMeterHistory", JSON.stringify(history));
  alert(`Result saved on this device. History count: ${history.length}.`);
}



function exportHistory() {
  const history = getSavedHistory();
  if (!history.length) {
    alert("No saved history to export yet.");
    return;
  }

  const jsonPayload = {
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    count: history.length,
    history
  };

  const csvRows = [
    [
      "timestamp",
      "appVersion",
      "filmId",
      "film",
      "boxIso",
      "suggestedIso",
      "ratedIso",
      "effectiveIso",
      "aperture",
      "lensCompensation",
      "exposureCompensation",
      "meteringMode",
      "zonePriority",
      "filter",
      "filterFactor",
      "filterStops",
      "lightingSource",
      "estimatedEv",
      "averageLuma",
      "shadowMean",
      "highlightMean",
      "contrast",
      "sceneBiasEv",
      "meteredExposureLabel",
      "calculatedExposureLabel",
      "practicalExposureLabel",
      "meteredExposureSeconds",
      "calculatedExposureSeconds",
      "practicalExposureSeconds",
      "roundingStops",
      "reciprocityApplied",
      "imageFileName"
    ]
  ];

  for (const item of history) {
    csvRows.push([
      item.timestamp ?? "",
      item.appVersion ?? "",
      item.film?.filmId ?? "",
      item.film?.name ?? "",
      item.film?.boxIso ?? "",
      item.film?.suggestedIso ?? "",
      item.film?.ratedIso ?? "",
      item.film?.effectiveIso ?? "",
      item.settings?.aperture ?? "",
      item.settings?.lensCompensation ?? "",
      item.settings?.exposureCompensation ?? "",
      item.settings?.meteringMode ?? "",
      item.settings?.zonePriority ?? "",
      item.settings?.filterLabel ?? "",
      item.settings?.filterFactor ?? "",
      item.settings?.filterStops ?? "",
      item.settings?.lightingSource ?? "",
      item.scene?.estimatedEv ?? "",
      item.scene?.averageLuma ?? "",
      item.scene?.shadowMean ?? "",
      item.scene?.highlightMean ?? "",
      item.scene?.contrast ?? "",
      item.scene?.sceneBiasEv ?? "",
      item.result?.meteredExposureLabel ?? "",
      item.result?.calculatedExposureLabel ?? "",
      item.result?.practicalExposureLabel ?? "",
      item.result?.meteredExposureSeconds ?? "",
      item.result?.calculatedExposureSeconds ?? "",
      item.result?.practicalExposureSeconds ?? "",
      item.result?.roundingStops ?? "",
      item.result?.reciprocityApplied ?? "",
      item.image?.fileName ?? ""
    ]);
  }

  const escapeCsv = (value) => {
    const str = String(value ?? "");
    if (/[\",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const csvContent = csvRows.map(row => row.map(escapeCsv).join(",")).join("\n");
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, "-");

  downloadFile(`film_meter_history_${stamp}.json`, JSON.stringify(jsonPayload, null, 2), "application/json");
  downloadFile(`film_meter_history_${stamp}.csv`, csvContent, "text/csv;charset=utf-8;");
}


function autoSaveCurrentSettings() {
  const filmKey = $("filmStock").value;
  const payload = {
    appVersion: APP_VERSION,
    timestamp: new Date().toISOString(),
    defaultFilm: filmKey,
    boxIso: films[filmKey].boxIso,
    suggestedIso: films[filmKey].suggestedIso,
    ratedIso: Number($("ratedIso").value) || films[filmKey].suggestedIso,
    filmId: $("filmId").value || "",
    lensCompensation: Number($("lensCompensation").value || 0),
    lightingSource: $("lightingSource").value,
    preferredAperture: $("aperture").value,
    exposureCompensation: Number($("compensation").value || 0),
    meteringMode: $("meteringMode").value,
    zonePriority: $("priority").value,
    filter: $("filter").value
  };
  localStorage.setItem("filmMeterSettings", JSON.stringify(payload));
}

function loadSavedSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem("filmMeterSettings") || "null");
    if (!settings) return;
    if (settings.defaultFilm && films[settings.defaultFilm]) $("filmStock").value = settings.defaultFilm;
    updateFilmFields();
    if (settings.ratedIso !== undefined) $("ratedIso").value = settings.ratedIso;
    if (settings.filmId !== undefined) $("filmId").value = settings.filmId;
    if (settings.lensCompensation !== undefined) $("lensCompensation").value = settings.lensCompensation;
    if (settings.lightingSource && lightingPresets[settings.lightingSource]) $("lightingSource").value = settings.lightingSource;
    if (settings.preferredAperture) $("aperture").value = settings.preferredAperture;
    if (settings.exposureCompensation !== undefined) $("compensation").value = settings.exposureCompensation;
    if (settings.meteringMode) $("meteringMode").value = settings.meteringMode;
    if (settings.zonePriority) $("priority").value = settings.zonePriority;
    if (settings.filter && filters[settings.filter]) $("filter").value = settings.filter;
  } catch (e) {}
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

  updateFilmFields();
  loadSavedSettings();

  ["filmId","ratedIso","lightingSource","aperture","compensation","lensCompensation","meteringMode","priority","filter"].forEach(id => {
    $(id).addEventListener("input", updateAll);
    $(id).addEventListener("change", updateAll);
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
  $("saveResultBtn").addEventListener("click", saveResultToLocal);
  $("exportHistoryBtn").addEventListener("click", exportHistory);

  updateAll();
}

document.addEventListener("DOMContentLoaded", init);
