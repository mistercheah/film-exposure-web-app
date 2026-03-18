
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
  if (seconds >= 1) return `${Number(seconds.toFixed(seconds >= 10 ? 0 : 1))} sec`;
  const denominator = Math.max(1, Math.round(1 / seconds));
  return `1/${denominator} sec`;
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

function calculateExposure() {
  const filmKey = $("filmStock").value;
  const ratedIso = Number($("ratedIso").value) || films[filmKey].suggestedIso;
  const aperture = $("aperture").value;
  const lightingKey = $("lightingSource").value;
  const filterKey = $("filter").value;
  const compensation = Number($("compensation").value || 0);
  const priority = $("priority").value;

  let ev100 = (lightingKey === "auto" && typeof analyzedEv === "number")
    ? analyzedEv
    : lightingPresets[lightingKey].ev;

  if (priority === "Protect Highlights") ev100 += 0.5;
  if (priority === "Open Shadows") ev100 -= 0.5;

  ev100 -= compensation;

  const fNumber = parseAperture(aperture);
  const evAtIso = ev100 + Math.log2(ratedIso / 100);
  const baseSeconds = (fNumber * fNumber) / Math.pow(2, evAtIso);
  const filterAdjusted = baseSeconds * filters[filterKey].factor;
  const reciprocity = reciprocityAdjustedSeconds(filmKey, filterAdjusted);

  return {
    filmKey,
    ratedIso,
    aperture,
    lightingKey,
    filterKey,
    ev100,
    meteredSeconds: filterAdjusted,
    finalSeconds: reciprocity.adjusted,
    reciprocityApplied: reciprocity.applied
  };
}

function updateFilmFields() {
  const film = films[$("filmStock").value];
  $("boxIso").value = film.boxIso;
  $("suggestedIso").value = film.suggestedIso;
  $("ratedIso").value = film.suggestedIso;
  updateAll();
}

function getTip(priority) {
  if (priority === "Open Shadows") return "Expose for the shadows.";
  if (priority === "Protect Highlights") return "Protect the highlights.";
  return "Balanced negative placement.";
}

function updateAll() {
  const result = calculateExposure();
  const film = films[result.filmKey];
  const filter = filters[result.filterKey];
  const metered = `${secondsToLabel(result.meteredSeconds)} at ${result.aperture}`;
  const final = `${secondsToLabel(result.finalSeconds)} at ${result.aperture}`;
  const sceneEvValue = (analyzedEv ?? result.ev100).toFixed(1);

  $("lightingSummary").textContent =
    result.lightingKey === "auto" && analyzedEv !== null
      ? `Estimated from uploaded image · EV ${analyzedEv}`
      : `${lightingPresets[result.lightingKey].label} · EV ${lightingPresets[result.lightingKey].ev}`;

  $("sumFilm").textContent = film.name;
  $("sumRatedIso").textContent = result.ratedIso;
  $("sumFilter").textContent = filter.label;
  $("sumMetered").textContent = metered;
  $("sumFinal").textContent = final;
  $("sumSceneEv").textContent = sceneEvValue;

  $("resFilm").textContent = film.name;
  $("resBoxIso").textContent = film.boxIso;
  $("resSuggestedIso").textContent = film.suggestedIso;
  $("resRatedIso").textContent = result.ratedIso;

  $("resFilterType").textContent = filter.label;
  $("resFilterFactor").textContent = `x${filter.factor}`;
  $("resFilterComp").textContent = filter.stops ? `+${filter.stops} stop` : "0 stop";

  $("resMetered").textContent = metered;
  $("resReciprocity").textContent = result.reciprocityApplied ? "Applied" : "Not needed";
  $("resReciprocityNote").textContent = result.reciprocityApplied
    ? "Exposure time extended to correct for reciprocity failure."
    : "Exposure is short enough that no reciprocity correction is needed.";

  $("resFinal").textContent = final;
  $("resFinalNote").textContent = `Adjusted for ${filter.stops ? "filter and " : ""}${result.reciprocityApplied ? "reciprocity failure" : "selected filter"}`;
  $("resEv").textContent = `EV ${sceneEvValue}`;
  $("resTip").textContent = getTip($("priority").value);
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
    let total = 0;
    const pixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    const avg = total / pixels;
    analyzedEv = Number((Math.max(5, Math.min(16, 5 + avg * 11))).toFixed(1));
    $("lightingSource").value = "auto";
    statusEl.textContent = `Image analyzed. Estimated scene EV ${analyzedEv}.`;
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

  ["ratedIso","lightingSource","aperture","compensation","meteringMode","priority","filter"].forEach(id => {
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

  updateAll();
}

document.addEventListener("DOMContentLoaded", init);
