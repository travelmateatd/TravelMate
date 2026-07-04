(() => {
  const CFG = {
    NOMINATIM_BASE: "https://nominatim.openstreetmap.org",
    OSRM_BASE: "https://router.project-osrm.org",
    OSRM_FALLBACK: "https://routing.openstreetmap.de",
    TILE_URL: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

    PK_VIEWBOX: "60.87,37.10,77.84,23.63",
    COUNTRY_CODE: "pk",
    ALLOWED_CITIES: new Set(["abbottabad", "rawalpindi", "islamabad", "peshawar"]),

    VEHICLE_RATES: { Economy: 65, Comfort: 75, Luxury: 150 },
    WHATSAPP_NUMBER: "923065616131"
  };

  // DOM
  const pickupInput = document.getElementById("pickupInput");
  const dropInput = document.getElementById("dropInput");
  const pickupSug = document.getElementById("pickupSug");
  const dropSug = document.getElementById("dropSug");
  const clearPickup = document.getElementById("clearPickup");
  const clearDrop = document.getElementById("clearDrop");

  const btnWhatsApp = document.getElementById("btnWhatsApp");
  const phoneInput = document.getElementById("phoneInput");
  const btnLocate = document.getElementById("btnLocate");
  const btnInstall = document.getElementById("btnInstall");
  const splashEl = document.getElementById("splash");
  const pinPickup = document.getElementById("pinPickup");
  const pinDrop = document.getElementById("pinDrop");
  const btnPanelToggle = document.getElementById("btnPanelToggle");
  const mapEl = document.getElementById("map");
  const panelGlass = document.querySelector(".panel-glass");

  const statusChip = document.getElementById("statusChip");
  const metricsChip = document.getElementById("metricsChip");
  const ruleChip = document.getElementById("ruleChip");
  const distanceText = document.getElementById("distanceText");
  const etaText = document.getElementById("etaText");
  const fareChip = document.getElementById("fareChip");
  const fareText = document.getElementById("fareText");

  const vehicleCards = Array.from(document.querySelectorAll(".vehicle-card"));

  function vehicleRate(name) {
    return CFG.VEHICLE_RATES[name] || CFG.VEHICLE_RATES.Economy;
  }

  function updateVehiclePrices(distKm) {
    vehicleCards.forEach(function (card) {
      const priceEl = card.querySelector("[data-price]");
      if (!priceEl) return;
      if (distKm == null) {
        priceEl.textContent = "—";
        return;
      }
      const rate = vehicleRate(card.dataset.vehicle);
      priceEl.textContent = fmtRs(distKm * rate);
    });
  }

  // State
  let map, pickupMarker, dropMarker, routeLine;
  let selectedVehicle = "Economy";
  let pickup = null; // { name, lat, lon, cityKey, raw }
  let drop = null;
  let lastRoute = null;
  let routeInFlight = false;
  let pickingFor = null; // "pickup" | "drop" | null

  // Utils
  const fmtKm = (km) => (km < 10 ? km.toFixed(2) : km.toFixed(1)) + " km";
  const fmtMin = (min) => (min < 60 ? String(Math.round(min)) + " min" : String(Math.floor(min / 60)) + "h " + String(Math.round(min % 60)) + "m");
  const fmtRs = (rs) => "Rs. " + String(Math.round(rs));

  function setStatus(text) {
    statusChip.textContent = text;
    statusChip.classList.add("chip-live");
    if (!statusChip.querySelector(".pulse")) {
      const pulse = document.createElement("span");
      pulse.className = "pulse";
      pulse.setAttribute("aria-hidden", "true");
      statusChip.prepend(pulse);
    }
  }

  function showRule(message) {
    ruleChip.hidden = false;
    ruleChip.textContent = message;
  }
  function hideRule() {
    ruleChip.hidden = true;
    ruleChip.textContent = "";
  }

  function setWhatsAppEnabled(enabled) {
    btnWhatsApp.classList.toggle("disabled", !enabled);
    btnWhatsApp.setAttribute("aria-disabled", String(!enabled));
    if (!enabled) btnWhatsApp.setAttribute("href", "#");
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function closeSuggestions(box) {
    box.classList.remove("open");
    box.innerHTML = "";
  }
  function openSuggestions(box) {
    box.classList.add("open");
  }

  // City extraction
  function cityKeyFromAddress(addr) {
    addr = addr || {};
    const fields = [
      addr.city, addr.town, addr.village, addr.municipality,
      addr.county, addr.state_district, addr.city_district,
      addr.suburb, addr.state
    ].filter(Boolean).map((s) => String(s).toLowerCase());

    const combined = fields.join(" ");
    for (const allowed of CFG.ALLOWED_CITIES) {
      if (combined.indexOf(allowed) !== -1) return allowed;
    }
    return null;
  }

  function isPakistanPlace(r) {
    const cc = r && r.address && r.address.country_code;
    return cc && String(cc).toLowerCase() === CFG.COUNTRY_CODE;
  }

  function isAllowedCity(r) {
    const key = cityKeyFromAddress(r && r.address);
    return key && CFG.ALLOWED_CITIES.has(key);
  }

  function placeLabel(r) {
    const display = (r && r.display_name) ? r.display_name : "";
    const parts = display.split(",").map(s => s.trim()).filter(Boolean);
    return {
      title: parts.slice(0, 2).join(", ") || display,
      sub: parts.slice(2, 6).join(", ")
    };
  }

  // Map init
  function initMap() {
    map = L.map("map", { zoomControl: true, attributionControl: true });
    map.setView([33.6844, 73.0479], 11);

    L.tileLayer(CFG.TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
    }).addTo(map);
  }

  const PIN_GREEN = "#19e28c";
  const PIN_RED = "#ff5252";

  function pinSVG(color) {
    return (
      '<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" ' +
      'style="display:block;filter:drop-shadow(0 10px 14px rgba(0,0,0,0.45))">' +
      '<path d="M15 0.5C7.05 0.5 0.6 6.95 0.6 14.9c0 10.9 14.4 26.1 14.4 26.1s14.4-15.2 14.4-26.1C29.4 6.95 22.95 0.5 15 0.5z" ' +
      'fill="' + color + '" stroke="rgba(255,255,255,0.85)" stroke-width="1.4"/>' +
      '<circle cx="15" cy="15" r="5.8" fill="#ffffff"/>' +
      "</svg>"
    );
  }

  // The booking panel floats on top of the map, bottom-anchored. Any time we
  // fit/pan the map to show markers or a route, we need to bias the visible
  // area upward so points don't land underneath that panel.
  function panelClearance() {
    const h = panelGlass ? panelGlass.getBoundingClientRect().height : 0;
    return Math.round(h + 24);
  }

  function ensureMarker(which, lat, lon) {
    const color = which === "pickup" ? PIN_GREEN : PIN_RED;
    const icon = L.divIcon({
      className: "tm-pin",
      html: pinSVG(color),
      iconSize: [30, 42],
      iconAnchor: [15, 40],
      popupAnchor: [0, -36]
    });
    const marker = L.marker([lat, lon], { icon, draggable: true, autoPan: true }).addTo(map);

    marker.on("dragstart", function () {
      marker._tmPrevLatLng = marker.getLatLng();
    });
    marker.on("dragend", function () {
      onMarkerDragEnd(which, marker);
    });

    return marker;
  }

  function updateMarkers() {
    if (pickup) {
      if (!pickupMarker) pickupMarker = ensureMarker("pickup", pickup.lat, pickup.lon);
      pickupMarker.setLatLng([pickup.lat, pickup.lon]);
    } else if (pickupMarker) {
      map.removeLayer(pickupMarker);
      pickupMarker = null;
    }

    if (drop) {
      if (!dropMarker) dropMarker = ensureMarker("drop", drop.lat, drop.lon);
      dropMarker.setLatLng([drop.lat, drop.lon]);
    } else if (dropMarker) {
      map.removeLayer(dropMarker);
      dropMarker = null;
    }
  }

  function panToPoint(lat, lon) {
    map.setView([lat, lon], Math.max(map.getZoom(), 14), { animate: true });
    map.panBy([0, -panelClearance() / 2], { animate: true });
  }

  function clearRouteLine() {
    if (routeLine) {
      if (routeLine._tmGlow) map.removeLayer(routeLine._tmGlow);
      map.removeLayer(routeLine);
      routeLine = null;
    }
  }

  function invalidateRoute() {
    lastRoute = null;

    metricsChip.hidden = true;
    distanceText.textContent = "—";
    etaText.textContent = "—";

    fareChip.hidden = true;
    fareText.textContent = "—";

    updateVehiclePrices(null);
    setWhatsAppEnabled(false);
    clearRouteLine();
  }

  function drawLine(latlngs, mainColor, glowColor, dashed) {
    clearRouteLine();

    routeLine = L.polyline(latlngs, {
      color: mainColor,
      weight: 6,
      opacity: 0.95,
      lineJoin: "round",
      lineCap: "round",
      dashArray: dashed ? "10 10" : null
    }).addTo(map);

    const glow = L.polyline(latlngs, {
      color: glowColor,
      weight: 12,
      opacity: 0.9,
      lineJoin: "round",
      lineCap: "round",
      dashArray: dashed ? "10 10" : null
    }).addTo(map);

    routeLine._tmGlow = glow;
    map.fitBounds(routeLine.getBounds(), {
      paddingTopLeft: [28, 28],
      paddingBottomRight: [28, panelClearance()],
      animate: true,
      duration: 0.7
    });
  }

  // ---- Polyline6 decode (fallback if OSRM returns polyline)
  function decodePolyline(str, precision) {
    precision = precision || 6;
    let index = 0, lat = 0, lng = 0;
    const coordinates = [];
    const factor = Math.pow(10, precision);

    while (index < str.length) {
      let b, shift = 0, result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0; result = 0;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      coordinates.push([lat / factor, lng / factor]); // [lat,lng]
    }
    return coordinates;
  }

  function tryDrawFromRoute(route) {
    // GeoJSON
    if (route && route.geometry && route.geometry.coordinates && route.geometry.coordinates.length) {
      const latlngs = route.geometry.coordinates.map(c => [c[1], c[0]]);
      drawLine(latlngs, "#19e28c", "rgba(25,226,140,0.35)", false);
      return true;
    }
    // Polyline6 string
    if (route && typeof route.geometry === "string" && route.geometry.length > 10) {
      const latlngs = decodePolyline(route.geometry, 6);
      drawLine(latlngs, "#19e28c", "rgba(25,226,140,0.35)", false);
      return true;
    }
    return false;
  }

  function osrmUrl(base, a, b, geometries) {
    // use reference-like URL string
    return base + "/route/v1/driving/"
      + a.lon + "," + a.lat + ";" + b.lon + "," + b.lat
      + "?overview=full&geometries=" + encodeURIComponent(geometries)
      + "&steps=false";
  }

  async function osrmFetchRoute(a, b) {
    const bases = [CFG.OSRM_BASE, CFG.OSRM_FALLBACK];
    const geometriesTry = ["geojson", "polyline6"]; // second try ensures we can draw

    let lastErr = null;

    for (const base of bases) {
      for (const geom of geometriesTry) {
        try {
          const url = osrmUrl(base, a, b, geom);
          const res = await fetch(url, { headers: { "Accept": "application/json" } });
          const data = await res.json().catch(() => null);

          if (!res.ok) throw new Error("OSRM HTTP " + res.status + " @ " + base);
          if (!data || !data.routes || !data.routes.length) throw new Error("OSRM empty routes @ " + base);

          return data.routes[0];
        } catch (e) {
          lastErr = e;
        }
      }
    }

    throw lastErr || new Error("OSRM routing failed");
  }

  function normalizePhone(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("03")) return "92" + digits.slice(1);
    if (digits.length === 12 && digits.startsWith("923")) return digits;
    if (digits.length === 13 && digits.startsWith("0923")) return "92" + digits.slice(3);
    return null;
  }

  function isValidPhone(raw) {
    return !!normalizePhone(raw);
  }

  function mapsLink(point) {
    return "https://maps.google.com/?q=" + point.lat.toFixed(6) + "," + point.lon.toFixed(6);
  }

  function buildWhatsAppLink() {
    if (!pickup || !drop || !lastRoute) return;

    const msg =
      "TravelMate Booking Request\n" +
      "Vehicle: " + selectedVehicle + "\n" +
      "Customer Phone: " + phoneInput.value.trim() + "\n" +
      "Pickup: " + pickup.name + "\n" +
      "Pickup Location: " + mapsLink(pickup) + "\n" +
      "Drop: " + drop.name + "\n" +
      "Drop Location: " + mapsLink(drop) + "\n" +
      "Distance: " + fmtKm(lastRoute.distanceKm) + "\n" +
      "ETA: " + fmtMin(lastRoute.durationMin) + "\n" +
      "Estimated Fare: " + fmtRs(lastRoute.fareRs) + "\n\n" +
      "Please confirm availability.";

    btnWhatsApp.href = "https://wa.me/" + CFG.WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg);
  }

  async function routeNow() {
    if (routeInFlight) return;
    if (!pickup || !drop) return;

    if (!pickup.cityKey || !CFG.ALLOWED_CITIES.has(pickup.cityKey) ||
        !drop.cityKey || !CFG.ALLOWED_CITIES.has(drop.cityKey)) {
      showRule("Bookings are available only in Abbottabad, Rawalpindi, Islamabad, or Peshawar.");
      return;
    }

    routeInFlight = true;
    hideRule();
    setStatus("Routing…");

    try {
      const route = await osrmFetchRoute(pickup, drop);

      const distKm = (Number(route.distance) || 0) / 1000;
      const durMin = (Number(route.duration) || 0) / 60;
      const fareRs = Math.round(distKm * vehicleRate(selectedVehicle));

      lastRoute = { distanceKm: distKm, durationMin: durMin, fareRs: fareRs };

      metricsChip.hidden = false;
      distanceText.textContent = fmtKm(distKm);
      etaText.textContent = fmtMin(durMin);

      fareChip.hidden = false;
      fareText.textContent = fmtRs(fareRs);
      updateVehiclePrices(distKm);

      const drawn = tryDrawFromRoute(route);
      let fallbackWarned = false;
      if (!drawn) {
        showRule("Road route line unavailable. Showing straight-line fallback.");
        fallbackWarned = true;
        const latlngs = [[pickup.lat, pickup.lon], [drop.lat, drop.lon]];
        drawLine(latlngs, "rgba(185,255,229,0.95)", "rgba(185,255,229,0.18)", true);
      }

      setStatus("Route ready");
      if (isValidPhone(phoneInput.value)) {
        setWhatsAppEnabled(true);
        buildWhatsAppLink();
      } else {
        setWhatsAppEnabled(false);
        if (!fallbackWarned) showRule("Enter your phone number to book via WhatsApp.");
      }
    } catch (e) {
      invalidateRoute();
      showRule("Route failed: " + ((e && e.message) ? e.message : "Unknown error"));
      setStatus("Ready");
      console.error(e);
    } finally {
      routeInFlight = false;
    }
  }

  const triggerAutoRoute = debounce(function () {
    if (pickup && drop) routeNow();
  }, 250);

  // Nominatim Search (PK only)
  async function nominatimSearch(q) {
    const url = new URL(CFG.NOMINATIM_BASE + "/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "8");
    url.searchParams.set("countrycodes", CFG.COUNTRY_CODE);
    url.searchParams.set("viewbox", CFG.PK_VIEWBOX);
    url.searchParams.set("bounded", "1");

    const res = await fetch(url.toString(), {
      headers: { "Accept": "application/json", "Accept-Language": "en" }
    });
    if (!res.ok) throw new Error("Search failed");
    return res.json();
  }

  // Minor/obscure localities (e.g. small colonies) often return zero results
  // when chained with a city name in one query. Retry with the last word
  // dropped a couple of times before giving up.
  async function nominatimSearchSmart(q) {
    let results = await nominatimSearch(q);
    if (results && results.length) return results;

    const words = q.trim().split(/\s+/);
    for (let i = words.length - 1; i >= 2 && (!results || !results.length); i--) {
      const shorter = words.slice(0, i).join(" ");
      try {
        results = await nominatimSearch(shorter);
      } catch {
        results = [];
      }
    }
    return results || [];
  }

  async function nominatimReverse(lat, lon) {
    const url = new URL(CFG.NOMINATIM_BASE + "/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "18");

    const res = await fetch(url.toString(), {
      headers: { "Accept": "application/json", "Accept-Language": "en" }
    });
    if (!res.ok) throw new Error("Reverse geocode failed");
    const data = await res.json();
    if (!data || data.error) throw new Error("No address found for that point");
    return data;
  }

  function renderSuggestions(box, items, onPick) {
    if (!items.length) return closeSuggestions(box);
    box.innerHTML = "";
    items.forEach(function (it) {
      const label = placeLabel(it);
      const row = document.createElement("div");
      row.className = "sug-item";
      row.setAttribute("role", "option");
      row.innerHTML = '<div class="sug-title"></div><div class="sug-sub"></div>';
      row.querySelector(".sug-title").textContent = label.title;
      row.querySelector(".sug-sub").textContent = label.sub;
      row.addEventListener("click", function () { onPick(it); });
      box.appendChild(row);
    });
    openSuggestions(box);
  }

  const onPickupInput = debounce(async function () {
    const q = pickupInput.value.trim();
    if (q.length < 3) return closeSuggestions(pickupSug);
    try {
      const results = await nominatimSearchSmart(q);
      renderSuggestions(pickupSug, results.filter(isPakistanPlace), selectPickup);
    } catch {
      closeSuggestions(pickupSug);
    }
  }, 220);

  const onDropInput = debounce(async function () {
    const q = dropInput.value.trim();
    if (q.length < 3) return closeSuggestions(dropSug);
    try {
      const results = await nominatimSearchSmart(q);
      renderSuggestions(dropSug, results.filter(isPakistanPlace), selectDrop);
    } catch {
      closeSuggestions(dropSug);
    }
  }, 220);

  function selectPickup(result) {
    if (!isPakistanPlace(result)) { showRule("Pickup must be in Pakistan (PK)."); closeSuggestions(pickupSug); return; }
    if (!isAllowedCity(result)) { showRule("Pickup must be within Abbottabad, Rawalpindi, Islamabad, or Peshawar."); closeSuggestions(pickupSug); return; }

    hideRule();
    const label = placeLabel(result);

    pickup = {
      name: label.title,
      lat: Number(result.lat),
      lon: Number(result.lon),
      cityKey: cityKeyFromAddress(result.address),
      raw: result
    };

    pickupInput.value = label.title;
    closeSuggestions(pickupSug);
    updateMarkers();
    if (!drop) panToPoint(pickup.lat, pickup.lon);
    invalidateRoute();
    triggerAutoRoute();
  }

  function selectDrop(result) {
    if (!isPakistanPlace(result)) { showRule("Drop must be in Pakistan (PK)."); closeSuggestions(dropSug); return; }
    if (!isAllowedCity(result)) { showRule("Drop must be within Abbottabad, Rawalpindi, Islamabad, or Peshawar."); closeSuggestions(dropSug); return; }

    hideRule();
    const label = placeLabel(result);

    drop = {
      name: label.title,
      lat: Number(result.lat),
      lon: Number(result.lon),
      cityKey: cityKeyFromAddress(result.address),
      raw: result
    };

    dropInput.value = label.title;
    closeSuggestions(dropSug);
    updateMarkers();
    if (!pickup) panToPoint(drop.lat, drop.lon);
    invalidateRoute();
    triggerAutoRoute();
  }

  // ---- Pick exact location on the map (tap a pin button, then tap the map;
  // or drag an existing pin to fine-tune it) ----

  let manuallyCollapsed = false;

  function updatePanelCollapse() {
    if (panelGlass) panelGlass.classList.toggle("collapsed", manuallyCollapsed);
    if (btnPanelToggle) btnPanelToggle.setAttribute("aria-expanded", String(!manuallyCollapsed));
  }

  function startPicking(which) {
    pickingFor = which;
    mapEl.classList.add("picking-mode");
    pinPickup.classList.toggle("active", which === "pickup");
    pinDrop.classList.toggle("active", which === "drop");
    setStatus(which === "pickup" ? "Tap the map to set pickup…" : "Tap the map to set drop…");
  }

  function stopPicking() {
    pickingFor = null;
    mapEl.classList.remove("picking-mode");
    pinPickup.classList.remove("active");
    pinDrop.classList.remove("active");
    setStatus(lastRoute ? "Route ready" : "Ready");
  }

  async function applyMapPoint(which, lat, lon, opts) {
    opts = opts || {};
    const label_ = which === "pickup" ? "Pickup" : "Drop";
    const warn = function (msg) { if (!opts.silent) showRule(msg); };
    try {
      const result = await nominatimReverse(lat, lon);

      if (!isPakistanPlace(result)) {
        warn(label_ + " must be in Pakistan (PK).");
        if (opts.revert) opts.revert();
        return false;
      }
      if (!isAllowedCity(result)) {
        warn(label_ + " must be within Abbottabad, Rawalpindi, Islamabad, or Peshawar.");
        if (opts.revert) opts.revert();
        return false;
      }

      hideRule();
      const label = placeLabel(result);
      // Keep the exact tapped/dragged coordinates rather than a snapped
      // rooftop point, since the whole point is precise pin placement.
      const point = {
        name: label.title || "Pinned location",
        lat: lat,
        lon: lon,
        cityKey: cityKeyFromAddress(result.address),
        raw: result
      };

      if (which === "pickup") {
        pickup = point;
        pickupInput.value = point.name;
        closeSuggestions(pickupSug);
      } else {
        drop = point;
        dropInput.value = point.name;
        closeSuggestions(dropSug);
      }

      updateMarkers();
      if (which === "pickup" && !drop) panToPoint(pickup.lat, pickup.lon);
      if (which === "drop" && !pickup) panToPoint(drop.lat, drop.lon);
      invalidateRoute();
      triggerAutoRoute();
      return true;
    } catch (e) {
      warn("Couldn't resolve that spot. Try tapping again.");
      if (opts.revert) opts.revert();
      return false;
    }
  }

  // ---- Auto-fetch the customer's current location as pickup ----

  function getCurrentPosition(geoOpts) {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, geoOpts);
    });
  }

  let locating = false;

  async function locateAndSetPickup(opts) {
    opts = opts || {};
    const silent = !!opts.silent;

    if (locating) return;
    if (!navigator.geolocation) {
      if (!silent) showRule("Geolocation isn't supported on this device or browser.");
      return;
    }

    locating = true;
    if (!silent) {
      btnLocate.classList.add("busy");
      setStatus("Locating…");
    }

    try {
      const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
      const ok = await applyMapPoint("pickup", pos.coords.latitude, pos.coords.longitude, { silent: silent });
      if (!silent && ok) hideRule();
    } catch (e) {
      if (!silent) {
        if (e && e.code === 1) showRule("Location permission denied. Search or tap the map instead.");
        else if (e && e.code === 3) showRule("Location request timed out. Try again.");
        else showRule("Couldn't get your location. Search or tap the map instead.");
      }
    } finally {
      locating = false;
      if (!silent) {
        btnLocate.classList.remove("busy");
        setStatus(lastRoute ? "Route ready" : "Ready");
      }
    }
  }

  async function onMapClick(e) {
    if (!pickingFor) return;
    const which = pickingFor;
    const lat = e.latlng.lat, lon = e.latlng.lng;

    const ok = await applyMapPoint(which, lat, lon);
    if (!ok) return; // bad tap (outside service area/country) — stay collapsed, let them retry

    stopPicking(); // point set — restore the fields to their normal position
  }

  function onMarkerDragEnd(which, marker) {
    const ll = marker.getLatLng();
    const prev = marker._tmPrevLatLng;
    applyMapPoint(which, ll.lat, ll.lng, {
      revert: function () { if (prev) marker.setLatLng(prev); }
    });
  }

  function initPicking() {
    map.on("click", onMapClick);

    pinPickup.addEventListener("click", function () {
      if (pickingFor === "pickup") stopPicking();
      else startPicking("pickup");
    });
    pinDrop.addEventListener("click", function () {
      if (pickingFor === "drop") stopPicking();
      else startPicking("drop");
    });

    if (btnPanelToggle) {
      btnPanelToggle.addEventListener("click", function () {
        manuallyCollapsed = !manuallyCollapsed;
        updatePanelCollapse();
      });
    }
  }

  function initVehicles() {
    vehicleCards.forEach(function (card) {
      card.addEventListener("click", function () {
        vehicleCards.forEach(function (c) {
          c.classList.remove("selected");
          c.setAttribute("aria-checked", "false");
        });
        card.classList.add("selected");
        card.setAttribute("aria-checked", "true");
        selectedVehicle = card.dataset.vehicle || "Economy";

        if (lastRoute) {
          lastRoute.fareRs = Math.round(lastRoute.distanceKm * vehicleRate(selectedVehicle));
          fareText.textContent = fmtRs(lastRoute.fareRs);
          buildWhatsAppLink();
        }
      });
    });
  }

  function initInputs() {
    phoneInput.addEventListener("input", function () {
      if (!lastRoute) return;
      if (isValidPhone(phoneInput.value)) {
        hideRule();
        setWhatsAppEnabled(true);
        buildWhatsAppLink();
      } else {
        setWhatsAppEnabled(false);
      }
    });

    pickupInput.addEventListener("input", function () {
      pickup = null;
      updateMarkers();
      invalidateRoute();
      onPickupInput();
      hideRule();
    });

    dropInput.addEventListener("input", function () {
      drop = null;
      updateMarkers();
      invalidateRoute();
      onDropInput();
      hideRule();
    });

    clearPickup.addEventListener("click", function () {
      pickupInput.value = "";
      pickup = null;
      updateMarkers();
      invalidateRoute();
      closeSuggestions(pickupSug);
      pickupInput.focus();
    });

    clearDrop.addEventListener("click", function () {
      dropInput.value = "";
      drop = null;
      updateMarkers();
      invalidateRoute();
      closeSuggestions(dropSug);
      dropInput.focus();
    });

    document.addEventListener("click", function (e) {
      const inPickup = pickupSug.contains(e.target) || pickupInput.contains(e.target);
      const inDrop = dropSug.contains(e.target) || dropInput.contains(e.target);
      if (!inPickup) closeSuggestions(pickupSug);
      if (!inDrop) closeSuggestions(dropSug);
    });
  }

  function initEvents() {
    btnWhatsApp.addEventListener("click", function (e) {
      if (btnWhatsApp.classList.contains("disabled")) {
        e.preventDefault();
        showRule("Select valid pickup & drop first (within service cities).");
      }
    });

    btnLocate.addEventListener("click", function () {
      locateAndSetPickup({ silent: false });
    });
  }

  async function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try { await navigator.serviceWorker.register("./sw.js", { scope: "./" }); } catch {}
  }

  // ---- Splash screen: shown for a fixed 5s on launch ----
  function initSplash() {
    if (!splashEl) return;
    setTimeout(function () {
      splashEl.classList.add("hide");
      setTimeout(function () {
        if (splashEl.parentNode) splashEl.parentNode.removeChild(splashEl);
      }, 550);
    }, 5000);
  }

  // ---- Install button (Add to Home Screen / desktop install) ----
  let deferredInstallPrompt = null;

  function isStandaloneDisplay() {
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function initInstall() {
    if (!btnInstall) return;

    if (isStandaloneDisplay()) {
      btnInstall.hidden = true;
      return;
    }

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      btnInstall.hidden = false;
    });

    btnInstall.addEventListener("click", async function () {
      if (!deferredInstallPrompt) return;
      btnInstall.hidden = true;
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      promptEvent.prompt();
      try { await promptEvent.userChoice; } catch {}
    });

    window.addEventListener("appinstalled", function () {
      btnInstall.hidden = true;
      deferredInstallPrompt = null;
    });
  }

  function boot() {
    initMap();
    initVehicles();
    initInputs();
    initEvents();
    initPicking();
    initInstall();
    registerSW();
    setStatus("Ready");
    setWhatsAppEnabled(false);

    // Map now safely exists — safe to auto-fetch the customer's location.
    if (!pickup) locateAndSetPickup({ silent: true });
  }

  window.addEventListener("DOMContentLoaded", function () {
    initSplash();
    let waited = 0;
    const wait = setInterval(function () {
      if (window.L) {
        clearInterval(wait);
        boot();
        return;
      }
      waited += 50;
      if (waited >= 15000) {
        clearInterval(wait);
        showRule("Map failed to load. Check your connection and reload the page.");
        setStatus("Offline");
      }
    }, 50);
  });
})();
