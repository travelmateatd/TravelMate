/**
 * SwiftRide — script.js
 * OpenStreetMap + Leaflet + Nominatim geocoding
 * No API key required. Works on GitHub Pages.
 *
 * ✏️  EASY CONFIG — edit below
 */
const CONFIG = {
  companyName:    'TravelMate',
  whatsappNumber: '923065616131',  // International format, no + or spaces
  email:          'travelmate.atd@gmail.com',
  city:           'Abbottabad, Pakistan',
  // Map default center (Pakistan)
  mapCenter:      [34.1463, 73.2117],  // Abbottabad, Pakistan
  mapZoom:        12,
};

/**
 * ✏️ RAFFLE — Monthly Cashback Raffle settings
 * Toggle the whole section on/off, change the prize, and update
 * last month's winner — all from right here, no other code changes needed.
 */
const RAFFLE = {
  enabled:          true,    // false = hides the entire raffle section from the site
  prize:            '1,000 PKR',
  countdownEnabled: false,   // true = shows live countdown timer to drawDate
  drawDate:         '2026-07-01T23:59:59', // only used when countdownEnabled is true
  lastWinnerName:   '',      // e.g. 'Ali from Abbottabad'
  lastWinnerPrize:  '',      // e.g. '500 PKR'
  lastWinnerEntry:  '',      // e.g. 'TM-20260530-4821'
};

/**
 * ✏️ MAJOR CITIES — one-way fare at the car's NORMAL rate.
 * The driver reliably finds a return booking from these cities,
 * so no round-trip surcharge applies.
 * Add/remove city names below (case-insensitive, partial match).
 */
const MAJOR_CITIES = ['islamabad', 'rawalpindi', 'peshawar', 'abbottabad'];

/**
 * ✏️ TOLL CITIES — one-way fare, but at the car's flat ROUND-TRIP RATE
 * (e.g. 80 PKR/km), NOT doubled. Used for cities where the driver gets
 * a return booking (so no empty-return surcharge) but high toll taxes
 * along the route eat into the margin at the normal rate.
 * Add/remove city names below (case-insensitive, partial match).
 */
const TOLL_CITIES = ['lahore', 'kasur', 'sheikhupura', 'gujranwala', 'sialkot', 'faisalabad'];

/**
 * All other destinations (not in either list above) are charged the
 * flat round-trip rate DOUBLED, since the driver returns to base empty.
 */

const CARS = [
  {
    id: 'economy', name: 'Economy', tag: 'Best Value',
    desc: '1000cc and below. Fuel-efficient for budget-friendly solo & short trips.',
    seats: 4, ac: false, luggage: 1, rate: 60, roundTripRate: 80, icon: 'fa-car',
  },
  {
    id: 'sedan', name: 'Sedan', tag: 'Most Popular',
    desc: 'Above 1000cc to 1800cc. Air-conditioned comfort for families & business.',
    seats: 4, ac: true, luggage: 2, rate: 70, roundTripRate: 80, icon: 'fa-car-side',
  },
  {
    id: 'group', name: 'Hiace / Coaster', tag: 'Group Travel',
    desc: 'Hiace Van (12 seater) or Coaster (24 seater) for groups, families, weddings & tours.',
    seats: '12–24', ac: true, luggage: 6, rate: null, callOnly: true, icon: 'fa-van-shuttle',
  },
];

const FAQS = [
  {
    q: 'How is the fare calculated?',
    a: 'Your fare is: Distance (km) x Rate per km for the selected vehicle. The map calculates straight-line distance between pickup and drop-off. No hidden charges — waiting time may be billed separately.',
  },
  {
    q: 'How does the map distance work?',
    a: 'We use OpenStreetMap to pin your pickup and drop-off locations. The distance shown is the straight-line (as-the-crow-flies) distance. Actual road distance may vary slightly, which the driver will confirm.',
  },
  {
    q: 'How do I confirm my booking?',
    a: "Click the 'Book via WhatsApp' button. Your full booking details including locations and fare are pre-filled. Send it and our team confirms your driver within minutes.",
  },
  {
    q: 'Can I book for a future date?',
    a: 'Yes — select any future date in the booking form. We recommend booking at least 2 hours in advance for guaranteed availability.',
  },
  {
    q: 'Are the drivers verified?',
    a: 'All drivers go through a background check and vehicle inspection before joining the SwiftRide fleet. You will receive the driver name and contact before your trip.',
  },
  {
    q: 'What if I need to cancel?',
    a: 'Contact us on WhatsApp as soon as possible. Cancellations made more than 1 hour before pickup are free. Late cancellations may incur a small fee.',
  },
];

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
let selectedCar   = null;
let map           = null;
let pickupMarker  = null;
let dropoffMarker = null;
let routeLine     = null;
let pickupCoords  = null;  // [lat, lng]
let dropoffCoords = null;  // [lat, lng]
let acTimers      = {};    // debounce timers per field

/* Structured city/region name for the drop-off point, resolved from
 * Nominatim's address breakdown (city/town/county/state_district) rather
 * than the truncated display text shown in the input field. This is what
 * decides major/toll/round-trip pricing — independent of how the visible
 * address text happens to be worded or truncated. */
let dropoffCityResolved = '';

/* Full, untruncated display_name string from Nominatim for the drop-off
 * point — kept as a third fallback signal alongside dropoffCityResolved
 * and the visible text field, since it's the most complete address
 * string available and almost always contains the city name somewhere
 * in it even when structured address fields are inconsistent. */
let dropoffFullDisplayName = '';

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  // Safety net: force horizontal scroll position back to 0 in case the
  // browser restored a stale scroll position (can happen after navigating
  // back/forward, or on some Android WebViews after a layout shift).
  window.scrollTo(0, window.scrollY);
  if (document.documentElement.scrollLeft !== 0 || document.body.scrollLeft !== 0) {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }

  applyConfig();
  renderCars();
  renderFAQs();
  initTheme();
  initNavbar();
  initMap();
  initPinModeButtons();
  initAutocomplete();
  initGPSButton();
  initBookingForm();
  initRememberMe();
  initBackToTop();
  initShareButton();
  initRaffle();
  initFAQAccordion();
  initScrollAnimations();
  initInstallPrompt();
  setFooterYear();
  hideSplashScreen();
});

/* Extra safety: re-check after window resize/orientation change, since
   mobile browsers sometimes reset layout in ways that can shift scroll. */
window.addEventListener('resize', function () {
  if (document.documentElement.scrollLeft !== 0) document.documentElement.scrollLeft = 0;
  if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0;
});

/* PWA splash screen — fades out shortly after the app shell is ready.
   Minimum display time avoids an awkward flash on fast connections,
   while a safety timeout guarantees it never gets stuck on slow ones. */
/* ══════════════════════════════════════════════
   PWA SPLASH SCREEN + INSTALL PROMPT (combined)
   The splash screen now doubles as an install screen:
   - Chrome/Edge/Android: shows an "Install App" button that
     triggers the native install prompt right on the splash.
   - iOS Safari: shows manual "Add to Home Screen" instructions
     (no install API exists on iOS).
   - Everyone: a "Continue to Website" link/timeout always moves
     forward into the site, install or not.
══════════════════════════════════════════════ */
var deferredInstallEvent = null;
var splashDismissed      = false;

function isAppAlreadyInstalled() {
  // Standalone display mode = already running as installed PWA
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true; // older iOS Safari flag
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

/* Capture the browser's install-eligibility event as early as possible —
   registered immediately (outside DOMContentLoaded) so we don't miss it
   if it fires before the rest of the page finishes initializing. */
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();        // stop the default mini-infobar
  deferredInstallEvent = e;  // save it to trigger later via our buttons
  showInstallUI();
});

window.addEventListener('appinstalled', function () {
  hideInstallUI();
  showToast('TravelMate installed successfully!');
});

/* Reveal whichever install UI is relevant once we know the browser supports it */
function showInstallUI() {
  if (isAppAlreadyInstalled()) return;
  var navBtn    = document.getElementById('installBtn');
  var splashBtn = document.getElementById('splashInstallBtn');
  if (navBtn)    navBtn.style.display    = 'flex';
  if (splashBtn && !splashDismissed) splashBtn.style.display = 'flex';
}

function hideInstallUI() {
  var navBtn    = document.getElementById('installBtn');
  var splashBtn = document.getElementById('splashInstallBtn');
  if (navBtn)    navBtn.style.display    = 'none';
  if (splashBtn) splashBtn.style.display = 'none';
}

/* Shared handler — used by both the navbar button and the splash button */
function triggerInstallPrompt(onDone) {
  if (!deferredInstallEvent) { if (onDone) onDone(); return; }
  deferredInstallEvent.prompt();
  deferredInstallEvent.userChoice.then(function (choice) {
    if (choice.outcome === 'accepted') {
      showToast('TravelMate installed! Check your home screen.');
      hideInstallUI();
    }
    deferredInstallEvent = null;
    if (onDone) onDone();
  });
}

function initInstallPrompt() {
  var installBtn   = document.getElementById('installBtn');
  var splashBtn    = document.getElementById('splashInstallBtn');
  var splashIosHint = document.getElementById('splashIosHint');
  var iosBanner    = document.getElementById('iosInstallBanner');
  var iosClose     = document.getElementById('iosBannerClose');

  if (isAppAlreadyInstalled()) return;

  // Navbar button — install, then stay on the page
  if (installBtn) {
    installBtn.addEventListener('click', function () {
      triggerInstallPrompt();
    });
  }

  // Splash button — install, then continue into the site either way
  if (splashBtn) {
    splashBtn.addEventListener('click', function () {
      triggerInstallPrompt(function () { dismissSplashScreen(); });
    });
  }

  // iOS Safari: no install API — show manual instructions instead, both
  // on the splash screen and (if dismissed) as the floating bottom banner.
  if (isIOSDevice()) {
    if (splashIosHint) splashIosHint.style.display = 'flex';

    var dismissed = localStorage.getItem('travelmate-ios-banner-dismissed');
    if (!dismissed && iosBanner) {
      setTimeout(function () { iosBanner.style.display = 'flex'; }, 6500); // after splash screen
    }
  }
  if (iosClose && iosBanner) {
    iosClose.addEventListener('click', function () {
      iosBanner.style.display = 'none';
      localStorage.setItem('travelmate-ios-banner-dismissed', '1');
    });
  }
}

/* ══════════════════════════════════════════════
   SPLASH SCREEN DISPLAY / DISMISSAL
══════════════════════════════════════════════ */
function hideSplashScreen() {
  var splash = document.getElementById('splashScreen');
  var skipBtn = document.getElementById('splashSkipBtn');
  if (!splash) return;

  var MIN_DISPLAY_MS = 5000;

  // "Continue to Website" — dismiss immediately on click
  if (skipBtn) {
    skipBtn.addEventListener('click', function () { dismissSplashScreen(); });
  }

  // Auto-dismiss after the minimum display time regardless
  setTimeout(function () { dismissSplashScreen(); }, MIN_DISPLAY_MS);
}

function dismissSplashScreen() {
  if (splashDismissed) return;
  splashDismissed = true;
  var splash = document.getElementById('splashScreen');
  if (!splash) return;
  splash.classList.add('splash-hidden');
  setTimeout(function () {
    if (splash.parentNode) splash.parentNode.removeChild(splash);
  }, 500); // matches CSS fade-out transition duration
}

function applyConfig() {
  document.querySelectorAll('.logo-text').forEach(function(el) { el.textContent = CONFIG.companyName; });
  document.title = CONFIG.companyName + ' — Taxi Booking';
  var cWA = document.getElementById('contactWA');
  if (cWA) cWA.textContent = '+' + CONFIG.whatsappNumber;
}

/* ══════════════════════════════════════════════
   LEAFLET MAP
══════════════════════════════════════════════ */
/* Which pin the next map click will place: 'pickup' or 'dropoff' */
var activePinMode = 'pickup';

function initMap() {
  map = L.map('map', {
    center: CONFIG.mapCenter,
    zoom: CONFIG.mapZoom,
    zoomControl: true,
    attributionControl: true,
  });

  // OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // Clicking the map always places the currently active pin (pickup or dropoff)
  map.on('click', function(e) {
    reverseGeocode(e.latlng.lat, e.latlng.lng, activePinMode);
    // After placing pickup, auto-switch to dropoff mode so the next click is logical
    if (activePinMode === 'pickup' && !dropoffCoords) {
      setPinMode('dropoff');
    }
  });
}

/* Switch which pin gets placed on the next map click, and update button UI */
function setPinMode(mode) {
  activePinMode = mode;
  var pickBtn = document.getElementById('pinModePickup');
  var dropBtn = document.getElementById('pinModeDropoff');
  if (pickBtn) pickBtn.classList.toggle('active', mode === 'pickup');
  if (dropBtn) dropBtn.classList.toggle('active', mode === 'dropoff');
  setMapStatus(
    mode === 'pickup' ? 'Tap the map to set your PICKUP point' : 'Tap the map to set your DROP-OFF point',
    false
  );
}

function initPinModeButtons() {
  var pickBtn = document.getElementById('pinModePickup');
  var dropBtn = document.getElementById('pinModeDropoff');
  if (pickBtn) pickBtn.addEventListener('click', function() { setPinMode('pickup'); });
  if (dropBtn) dropBtn.addEventListener('click', function() { setPinMode('dropoff'); });
}

/* Custom marker icons */
function makeIcon(color) {
  var svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">'
    + '<path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 26 14 26S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="' + color + '"/>'
    + '<circle cx="14" cy="14" r="6" fill="#fff"/>'
    + '</svg>';
  return L.divIcon({
    html: svgStr,
    className: '',
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -40],
  });
}

var pickupIcon  = makeIcon('#22c55e');
var dropoffIcon = makeIcon('#ef4444');

/* Place a marker */
function placeMarker(lat, lng, type, label) {
  if (type === 'pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.marker([lat, lng], { icon: pickupIcon, draggable: true })
      .addTo(map)
      .bindPopup('<b>Pickup:</b> ' + label + '<br><small>Drag pin to fine-tune</small>');
    pickupCoords = [lat, lng];
    pickupMarker.on('dragend', function(e) {
      var pos = e.target.getLatLng();
      onMarkerDragged(pos.lat, pos.lng, 'pickup');
    });
  } else {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = L.marker([lat, lng], { icon: dropoffIcon, draggable: true })
      .addTo(map)
      .bindPopup('<b>Drop-off:</b> ' + label + '<br><small>Drag pin to fine-tune</small>');
    dropoffCoords = [lat, lng];
    dropoffMarker.on('dragend', function(e) {
      var pos = e.target.getLatLng();
      onMarkerDragged(pos.lat, pos.lng, 'dropoff');
    });
  }
  updateRouteAndDistance();
}

/* When customer drags a pin to a new spot — re-geocode address and recalc route */
function onMarkerDragged(lat, lng, type) {
  if (type === 'pickup') { pickupCoords = [lat, lng]; }
  else                   { dropoffCoords = [lat, lng]; }

  setMapStatus('Updating location...', false);

  var url = 'https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=' + lat + '&lon=' + lng;
  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'TravelMateTaxiApp/1.0' } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var label = data.display_name
        ? data.display_name.split(',').slice(0, 3).join(',')
        : lat.toFixed(4) + ', ' + lng.toFixed(4);
      var input = document.getElementById(type);
      if (input) input.value = label;

      // Store the structured city name + full display name for accurate route-type pricing
      if (type === 'dropoff') {
        dropoffCityResolved    = extractCityFromAddress(data.address) || label.toLowerCase();
        dropoffFullDisplayName = (data.display_name || '').toLowerCase();
      }

      var marker = (type === 'pickup') ? pickupMarker : dropoffMarker;
      if (marker) marker.setPopupContent('<b>' + (type === 'pickup' ? 'Pickup' : 'Drop-off') + ':</b> ' + label + '<br><small>Drag pin to fine-tune</small>');
      showToast((type === 'pickup' ? 'Pickup' : 'Drop-off') + ' updated');
    })
    .catch(function() {})
    .finally(function() {
      updateRouteAndDistance();
    });
}

/* ══════════════════════════════════════════════
   OSRM ROAD ROUTING — real road distance & route
   Free, no API key. Uses router.project-osrm.org
══════════════════════════════════════════════ */
function updateRouteAndDistance() {
  if (!pickupCoords || !dropoffCoords) return;

  // Remove old route
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }

  // Show loading state
  setMapStatus('Calculating road distance...', false);

  // OSRM public API — driving route
  var url = 'https://router.project-osrm.org/route/v1/driving/'
    + pickupCoords[1] + ',' + pickupCoords[0] + ';'
    + dropoffCoords[1] + ',' + dropoffCoords[0]
    + '?overview=full&geometries=geojson&steps=false';

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.routes || data.routes.length === 0) {
        // Fallback to straight-line if OSRM fails
        fallbackStraightLine();
        return;
      }

      var route    = data.routes[0];
      var distM    = route.distance;          // metres
      var durationS = route.duration;         // seconds
      var kmRoad   = Math.round(distM / 1000);
      var mins     = Math.round(durationS / 60);
      var timeStr  = mins >= 60
        ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'min'
        : mins + ' min';

      // Draw actual road geometry
      var coords = route.geometry.coordinates.map(function(c) {
        return [c[1], c[0]]; // OSRM returns [lng,lat], Leaflet wants [lat,lng]
      });
      routeLine = L.polyline(coords, {
        color: '#16a34a',
        weight: 4,
        opacity: 0.9,
      }).addTo(map);

      // Fit map
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

      // Fill distance field
      var kmInput = document.getElementById('kilometers');
      if (kmInput) {
        kmInput.value = kmRoad;
        kmInput.setAttribute('readonly', 'true');
        var badge = document.getElementById('autoBadge');
        if (badge) badge.style.display = 'inline-flex';
      }

      // Status bar
      setMapStatus('Road distance: ' + kmRoad + ' km  |  Est. drive: ' + timeStr, true);

      recalcFare();
    })
    .catch(function() {
      fallbackStraightLine();
    });
}

/* Fallback: straight-line distance if OSRM is unreachable */
function fallbackStraightLine() {
  if (routeLine) map.removeLayer(routeLine);

  routeLine = L.polyline([pickupCoords, dropoffCoords], {
    color: '#16a34a',
    weight: 3,
    dashArray: '8, 8',
    opacity: 0.75,
  }).addTo(map);

  map.fitBounds(L.latLngBounds([pickupCoords, dropoffCoords]), { padding: [50, 50] });

  var km = haversineKm(pickupCoords[0], pickupCoords[1], dropoffCoords[0], dropoffCoords[1]);
  var kmRounded = Math.round(km);

  var kmInput = document.getElementById('kilometers');
  if (kmInput) {
    kmInput.value = kmRounded;
    kmInput.setAttribute('readonly', 'true');
    var badge = document.getElementById('autoBadge');
    if (badge) badge.style.display = 'inline-flex';
  }

  setMapStatus('Straight-line: ' + kmRounded + ' km (road routing unavailable)', false);
  recalcFare();
}

/* Haversine — straight-line fallback */
function haversineKm(lat1, lon1, lat2, lon2) {
  var R    = 6371;
  var dLat = deg2rad(lat2 - lat1);
  var dLon = deg2rad(lon2 - lon1);
  var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2)
           + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2))
           * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function deg2rad(deg) { return deg * (Math.PI / 180); }

function setMapStatus(text, isSuccess) {
  var el   = document.getElementById('mapStatus');
  var span = document.getElementById('mapStatusText');
  if (!el || !span) return;
  span.textContent = text;
  if (isSuccess) { el.classList.add('success'); }
  else           { el.classList.remove('success'); }
}

/* ══════════════════════════════════════════════
   NOMINATIM GEOCODING (OpenStreetMap — Free)
══════════════════════════════════════════════ */
function geocodeAddress(query, callback) {
  var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q='
          + encodeURIComponent(query);
  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'SwiftRideTaxiApp/1.0' } })
    .then(function(r) { return r.json(); })
    .then(callback)
    .catch(function() { showToast('Location search failed. Check your internet.', true); });
}

/* Extract a combined, lowercase string of every relevant city/region
 * field from a Nominatim "address" object. Previously this returned only
 * the FIRST non-empty field (city, then town, then county, etc.) — but
 * landmarks/squares (e.g. "D-Chowk, F-5, Islamabad") sometimes have an
 * irrelevant or narrower field populated (like "suburb": "F-5") while
 * the actual city name only appears in a different field (e.g. "county"
 * or "state_district"). Combining ALL fields means a match on ANY of
 * them is enough — much more reliable than picking just one. */
function extractCityFromAddress(address) {
  if (!address) return '';
  var fields = [
    address.city,
    address.town,
    address.municipality,
    address.county,
    address.state_district,
    address.suburb,
    address.city_district,
    address.state,
  ];
  return fields.filter(Boolean).join(' ').toLowerCase();
}

function reverseGeocode(lat, lng, type) {
  var url = 'https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=' + lat + '&lon=' + lng;
  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'SwiftRideTaxiApp/1.0' } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var label = data.display_name
        ? data.display_name.split(',').slice(0, 3).join(',')
        : lat.toFixed(4) + ', ' + lng.toFixed(4);
      var input = document.getElementById(type);
      if (input) input.value = label;

      // Store the structured city name + full display name for accurate route-type pricing
      if (type === 'dropoff') {
        dropoffCityResolved    = extractCityFromAddress(data.address) || label.toLowerCase();
        dropoffFullDisplayName = (data.display_name || '').toLowerCase();
      }

      placeMarker(lat, lng, type, label);
      showToast((type === 'pickup' ? 'Pickup' : 'Drop-off') + ' set from map click');
    })
    .catch(function() {});
}

/* ══════════════════════════════════════════════
   AUTOCOMPLETE
══════════════════════════════════════════════ */
function initAutocomplete() {
  setupAutocomplete('pickup',  'pickupSuggestions');
  setupAutocomplete('dropoff', 'dropoffSuggestions');
}

function setupAutocomplete(inputId, listId) {
  var input  = document.getElementById(inputId);
  var list   = document.getElementById(listId);
  if (!input || !list) return;

  input.addEventListener('input', function() {
    var val = input.value.trim();

    // If user manually types in km field, unlock it
    if (inputId === 'pickup' || inputId === 'dropoff') {
      var kmInput = document.getElementById('kilometers');
      if (kmInput && kmInput.hasAttribute('readonly') && val === '') {
        // Only reset if user clears the field
      }
    }

    clearTimeout(acTimers[inputId]);
    if (val.length < 3) { closeList(list); return; }

    acTimers[inputId] = setTimeout(function() {
      geocodeAddress(val, function(results) {
        renderSuggestions(results, list, input, inputId);
      });
    }, 400);
  });

  // Close on outside click
  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !list.contains(e.target)) closeList(list);
  });

  input.addEventListener('keydown', function(e) {
    var items = list.querySelectorAll('li');
    var active = list.querySelector('li.active');
    var idx = active ? Array.from(items).indexOf(active) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var next = items[idx + 1] || items[0];
      if (active) active.classList.remove('active');
      if (next) next.classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = items[idx - 1] || items[items.length - 1];
      if (active) active.classList.remove('active');
      if (prev) prev.classList.add('active');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active) active.click();
    } else if (e.key === 'Escape') {
      closeList(list);
    }
  });
}

function renderSuggestions(results, list, input, type) {
  list.innerHTML = '';
  if (!results || results.length === 0) { closeList(list); return; }

  results.forEach(function(r) {
    var li    = document.createElement('li');
    var label = r.display_name.split(',').slice(0, 4).join(',');
    li.innerHTML = '<i class="fa-solid fa-location-dot"></i><span>' + label + '</span>';
    li.addEventListener('click', function() {
      input.value = label;
      closeList(list);

      // Store the structured city name + full display name for accurate route-type pricing
      if (type === 'dropoff') {
        dropoffCityResolved    = extractCityFromAddress(r.address) || label.toLowerCase();
        dropoffFullDisplayName = (r.display_name || '').toLowerCase();
      }

      placeMarker(parseFloat(r.lat), parseFloat(r.lon), type, label);
      showToast((type === 'pickup' ? 'Pickup' : 'Drop-off') + ' set: ' + label.split(',')[0]);
      clearFieldError(type);
    });
    list.appendChild(li);
  });

  list.classList.add('open');
}

function closeList(list) {
  list.innerHTML = '';
  list.classList.remove('open');
}

/* ══════════════════════════════════════════════
   GPS / CURRENT LOCATION BUTTON
══════════════════════════════════════════════ */
function initGPSButton() {
  var btn = document.getElementById('gpsBtn');
  if (!btn) return;

  btn.addEventListener('click', function() {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported by your browser.', true); return;
    }
    btn.classList.add('loading');
    setMapStatus('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        btn.classList.remove('loading');
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        reverseGeocode(lat, lng, 'pickup');
        map.setView([lat, lng], 13);
        showToast('Current location set as pickup');
        if (!dropoffCoords) setPinMode('dropoff');
      },
      function() {
        btn.classList.remove('loading');
        showToast('Could not get location. Check permissions.', true);
        setMapStatus('Location access denied');
      },
      { timeout: 10000 }
    );
  });
}

/* ══════════════════════════════════════════════
   CARS
══════════════════════════════════════════════ */
function renderCars() {
  var grid = document.getElementById('carsGrid');
  if (!grid) return;
  grid.innerHTML = CARS.map(function(car) {
    var ariaLabel = car.callOnly
      ? 'Contact us for ' + car.name + ' rates'
      : 'Select ' + car.name;

    var bottomContent = car.callOnly
      ? '<button class="btn-call" data-car-id="' + car.id + '">'
          + '<i class="fa-brands fa-whatsapp"></i> WhatsApp</button>'
      : '<div class="car-fare-badge" id="fare-badge-' + car.id + '" style="display:none;"></div>'
        + '<div class="car-select-circle"></div>';

    return '<article class="car-card' + (car.callOnly ? ' car-card-call' : '') + '" id="car-' + car.id + '" data-car-id="' + car.id + '" role="button" tabindex="0" aria-label="' + ariaLabel + '">'
      + '<div class="car-img-wrap">'
      + '<i class="fa-solid ' + car.icon + ' car-placeholder-icon"></i>'
      + '</div>'
      + '<div class="car-body">'
      + '<div class="car-name">' + car.name + '</div>'
      + '<div class="car-meta">'
      + '<div class="car-meta-item"><i class="fa-solid fa-user-group"></i><span>' + car.seats + ' Seats</span></div>'
      + '</div>'
      + bottomContent
      + '</div>'
      + '</article>';
  }).join('');

  grid.querySelectorAll('.car-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      var car = CARS.find(function(c) { return c.id === card.dataset.carId; });
      if (car && car.callOnly) {
        contactForCallOnlyCar(car);
        return;
      }
      selectCar(card.dataset.carId);
    });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var car = CARS.find(function(c) { return c.id === card.dataset.carId; });
        if (car && car.callOnly) { contactForCallOnlyCar(car); return; }
        selectCar(card.dataset.carId);
      }
    });
  });
}

/* For Hiace/Coaster — open WhatsApp inquiry */
function contactForCallOnlyCar(car) {
  var message = 'Hello, I want to inquire about booking a group vehicle (Hiace Van or Coaster).\n\n'
    + 'Please share the rate and availability.\n\n'
    + 'Name: \n'
    + 'Pickup: \n'
    + 'Drop-off: \n'
    + 'Date: \n'
    + 'Number of Passengers: ';
  var waLink = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(message);
  var a = document.createElement('a');
  a.href = waLink; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Opening WhatsApp for group inquiry...');
}

function selectCar(carId) {
  selectedCar = CARS.find(function(c) { return c.id === carId; }) || null;
  // Deselect all cards
  document.querySelectorAll('.car-card').forEach(function(c) { c.classList.remove('selected'); });
  if (selectedCar) {
    var card = document.getElementById('car-' + carId);
    if (card) card.classList.add('selected');
    var pill = document.getElementById('selectedCarName');
    if (pill) pill.textContent = selectedCar.name + ' — ' + selectedCar.rate + ' PKR/km';
    // Scroll to details card if below viewport
    var details = document.getElementById('detailsCard');
    if (details) {
      var rect = details.getBoundingClientRect();
      if (rect.top > window.innerHeight) details.scrollIntoView({ behavior: 'smooth' });
    }
    showToast(selectedCar.name + ' selected');
  }
  recalcFare();
}

/* ══════════════════════════════════════════════
   FARE CALCULATOR
══════════════════════════════════════════════ */
function initBookingForm() {
  var kmInput = document.getElementById('kilometers');
  if (kmInput) {
    kmInput.addEventListener('input', function() {
      // If user manually types, remove readonly lock
      kmInput.removeAttribute('readonly');
      var badge = document.getElementById('autoBadge');
      if (badge) badge.style.display = 'none';
      recalcFare();
    });
  }

  ['custName','custPhone','pickup','dropoff','tripDate'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function() {
      clearFieldError(id);
      updateWhatsappBtn();
      if (id === 'dropoff') {
        // Manual typing invalidates any previously pin-resolved city —
        // fall back to plain text matching until a pin/suggestion is picked again
        dropoffCityResolved    = '';
        dropoffFullDisplayName = '';
        recalcFare(); // re-check major city / round-trip on every keystroke
      }
    });
  });

  var waBtn = document.getElementById('whatsappBtn');
  if (waBtn) waBtn.addEventListener('click', handleWhatsappBooking);

  var dateInput = document.getElementById('tripDate');
  if (dateInput) {
    var today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
  }
}

/* ══════════════════════════════════════════════
   REMEMBER ME — saves name, phone & last pickup
   to localStorage so returning customers don't
   have to re-type their details every visit.
   Drop-off is intentionally NOT saved since every
   trip destination is usually different.
══════════════════════════════════════════════ */
var STORAGE_KEY = 'travelmate_customer';

function initRememberMe() {
  var checkbox  = document.getElementById('rememberMeCheck');
  var clearBtn  = document.getElementById('rememberMeClear');
  var savedWrap = document.getElementById('rememberMeSaved');

  var saved = loadCustomerData();

  if (saved) {
    // Pre-fill name and phone
    var nameEl  = document.getElementById('custName');
    var phoneEl = document.getElementById('custPhone');
    if (nameEl  && saved.name)  nameEl.value  = saved.name;
    if (phoneEl && saved.phone) phoneEl.value = saved.phone;

    // Pre-fill pickup text field
    if (saved.pickupText) {
      var pickupEl = document.getElementById('pickup');
      if (pickupEl) pickupEl.value = saved.pickupText;
    }

    // Auto-place pickup pin on map using saved coords
    if (saved.pickupLat && saved.pickupLng && saved.pickupText) {
      // Wait briefly for the map to fully initialise before placing pin
      setTimeout(function() {
        placeMarker(saved.pickupLat, saved.pickupLng, 'pickup', saved.pickupText);
        showToast('Welcome back! Pickup location restored.');
      }, 800);
    }

    // Show "Saved details" indicator and tick the checkbox
    if (savedWrap) savedWrap.style.display = 'flex';
    if (checkbox)  checkbox.checked = true;
  }

  // Checkbox toggle — saving or forgetting
  if (checkbox) {
    checkbox.addEventListener('change', function() {
      if (!checkbox.checked) {
        clearCustomerData();
        if (savedWrap) savedWrap.style.display = 'none';
        showToast('Saved details cleared.');
      }
      // Actual saving happens when customer taps "Book via WhatsApp"
    });
  }

  // "Clear details" link
  if (clearBtn) {
    clearBtn.addEventListener('click', function(e) {
      e.preventDefault();
      clearCustomerData();
      if (checkbox)  checkbox.checked = false;
      if (savedWrap) savedWrap.style.display = 'none';
      // Clear the pre-filled fields
      var nameEl  = document.getElementById('custName');
      var phoneEl = document.getElementById('custPhone');
      var pickupEl = document.getElementById('pickup');
      if (nameEl)   nameEl.value  = '';
      if (phoneEl)  phoneEl.value = '';
      if (pickupEl) pickupEl.value = '';
      // Remove saved pickup pin
      if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
      pickupCoords = null;
      showToast('Details cleared.');
    });
  }
}

/* Save customer details after a successful booking */
function saveCustomerData() {
  var checkbox = document.getElementById('rememberMeCheck');
  if (!checkbox || !checkbox.checked) return;

  var nameEl   = document.getElementById('custName');
  var phoneEl  = document.getElementById('custPhone');
  var pickupEl = document.getElementById('pickup');

  var data = {
    name:       nameEl   ? nameEl.value.trim()   : '',
    phone:      phoneEl  ? phoneEl.value.trim()  : '',
    pickupText: pickupEl ? pickupEl.value.trim() : '',
    pickupLat:  pickupCoords ? pickupCoords[0] : null,
    pickupLng:  pickupCoords ? pickupCoords[1] : null,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage unavailable (private browsing, storage full) — silently skip
  }
}

function loadCustomerData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearCustomerData() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

/**
 * Determine the route pricing type based on the drop-off location:
 *   'major' — normal car rate, one-way (Islamabad/Rawalpindi/Peshawar)
 *   'toll'  — flat roundTripRate, one-way, NOT doubled (Lahore — high tolls)
 *   'other' — flat roundTripRate, doubled (driver returns empty)
 *
 * Checks three sources together so a match in ANY of them counts:
 *   1. dropoffCityResolved    — structured city/county/district fields
 *   2. dropoffFullDisplayName — the complete, untruncated Nominatim address
 *   3. the visible text field — catches manually-typed city names
 * This redundancy matters because landmarks/squares (e.g. "D-Chowk, F-5,
 * Islamabad") don't always populate the same address fields consistently.
 */
function getRouteType() {
  var dropoffEl = document.getElementById('dropoff');
  if (!dropoffEl) return 'major'; // default: safest assumption if unknown

  var textVal = dropoffEl.value.trim().toLowerCase();
  var combined = (dropoffCityResolved + ' ' + dropoffFullDisplayName + ' ' + textVal).trim();

  if (!combined) return 'major';

  for (var i = 0; i < MAJOR_CITIES.length; i++) {
    if (combined.indexOf(MAJOR_CITIES[i]) !== -1) return 'major';
  }
  for (var j = 0; j < TOLL_CITIES.length; j++) {
    if (combined.indexOf(TOLL_CITIES[j]) !== -1) return 'toll';
  }
  return 'other';
}

function recalcFare() {
  var km        = parseFloat(document.getElementById('kilometers') && document.getElementById('kilometers').value) || 0;
  var routeType = getRouteType(); // 'major' | 'toll' | 'other'

  var effRate, displayRate, total;
  if (!selectedCar) {
    effRate = 0; displayRate = 0; total = 0;
  } else if (routeType === 'major') {
    effRate     = selectedCar.rate;
    displayRate = effRate;
    total       = km > 0 ? km * effRate : 0;
  } else if (routeType === 'toll') {
    effRate     = selectedCar.roundTripRate || selectedCar.rate;
    displayRate = effRate;
    total       = km > 0 ? km * effRate : 0;
  } else {
    effRate     = selectedCar.roundTripRate || selectedCar.rate;
    displayRate = effRate * 2;
    total       = km > 0 ? km * effRate * 2 : 0;
  }

  var sumCar   = document.getElementById('sumCar');
  var sumKm    = document.getElementById('sumKm');
  var sumRate  = document.getElementById('sumRate');
  var notice   = document.getElementById('fareNotice');
  var rtNotice   = document.getElementById('roundTripNotice');
  var tollNotice = document.getElementById('tollNotice');

  if (sumCar)  sumCar.textContent  = selectedCar ? selectedCar.name : '—';
  if (sumKm)   sumKm.textContent   = km > 0 ? km + ' km' + (routeType === 'other' ? ' (round trip)' : '') : '—';
  if (sumRate) sumRate.textContent = displayRate > 0
    ? (routeType === 'other' ? effRate + ' PKR × 2 = ' + displayRate + ' PKR' : displayRate + ' PKR')
    : '—';

  // Show/hide notices
  if (rtNotice)   rtNotice.style.display   = (km > 0 && routeType === 'other') ? 'flex' : 'none';
  if (tollNotice) tollNotice.style.display = (km > 0 && routeType === 'toll')  ? 'flex' : 'none';

  // ── Update fare badge under each car card ──
  CARS.forEach(function(car) {
    var badge = document.getElementById('fare-badge-' + car.id);
    if (!badge || car.callOnly) return;

    if (km > 0) {
      var carEffRate, carTotal;
      if (routeType === 'major') {
        carEffRate = car.rate;
        carTotal   = km * carEffRate;
      } else if (routeType === 'toll') {
        carEffRate = car.roundTripRate || car.rate;
        carTotal   = km * carEffRate;
      } else {
        carEffRate = car.roundTripRate || car.rate;
        carTotal   = km * carEffRate * 2;
      }
      badge.textContent = 'PKR ' + carTotal.toLocaleString('en-PK');
      badge.style.display = 'block';
    } else {
      badge.textContent = '';
      badge.style.display = 'none';
    }
  });

  if (total > 0) {
    animateOdometer(total);
    if (notice) notice.style.display = 'none';
  } else {
    var od = document.getElementById('odometer');
    if (od) od.textContent = '0';
    if (notice) notice.style.display = '';
  }
  updateWhatsappBtn();
}

var odoRaf = null;
function animateOdometer(target) {
  var el = document.getElementById('odometer');
  if (!el) return;
  var start     = parseInt(el.textContent.replace(/,/g, '')) || 0;
  var duration  = 600;
  var startTime = performance.now();
  if (odoRaf) cancelAnimationFrame(odoRaf);
  function step(now) {
    var elapsed  = now - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var ease     = 1 - Math.pow(1 - progress, 3);
    var current  = Math.round(start + (target - start) * ease);
    el.textContent = current.toLocaleString('en-PK');
    if (progress < 1) odoRaf = requestAnimationFrame(step);
  }
  odoRaf = requestAnimationFrame(step);
}

function updateWhatsappBtn() {
  var btn = document.getElementById('whatsappBtn');
  if (!btn) return;
  var km = parseFloat(document.getElementById('kilometers') && document.getElementById('kilometers').value) || 0;
  btn.disabled = !(selectedCar && km > 0);
}

/* ══════════════════════════════════════════════
   VALIDATION
══════════════════════════════════════════════ */
function validateForm() {
  var valid = true;
  var fields = [
    { id: 'custName',   errId: 'errName',    label: 'Name',            check: function(v) { return v.trim().length >= 2; } },
    { id: 'custPhone',  errId: 'errPhone',   label: 'WhatsApp number', check: function(v) { return /^[\d\s\+\-]{7,15}$/.test(v.trim()); } },
    { id: 'pickup',     errId: 'errPickup',  label: 'Pickup location', check: function(v) { return v.trim().length >= 2; } },
    { id: 'dropoff',    errId: 'errDropoff', label: 'Drop-off',        check: function(v) { return v.trim().length >= 2; } },
    { id: 'tripDate',   errId: 'errDate',    label: 'Date',            check: function(v) { return v !== ''; } },
    { id: 'kilometers', errId: 'errKm',      label: 'Distance',        check: function(v) { return parseFloat(v) > 0; } },
  ];
  fields.forEach(function(f) {
    var el    = document.getElementById(f.id);
    var errEl = document.getElementById(f.errId);
    var val   = el ? el.value : '';
    if (!f.check(val)) {
      valid = false;
      if (errEl) errEl.textContent = f.label + ' is required.';
      if (el && el.closest('.form-group')) el.closest('.form-group').classList.add('has-error');
    } else {
      clearFieldError(f.id);
    }
  });
  if (!selectedCar) {
    showToast('Please select a car first.', true);
    document.getElementById('cars') && document.getElementById('cars').scrollIntoView({ behavior: 'smooth' });
    valid = false;
  }
  return valid;
}

function clearFieldError(fieldId) {
  var el = document.getElementById(fieldId);
  if (!el) return;
  var fg = el.closest('.form-group');
  if (fg) {
    fg.classList.remove('has-error');
    var err = fg.querySelector('.field-error');
    if (err) err.textContent = '';
  }
}

/* ══════════════════════════════════════════════
   WHATSAPP BOOKING
══════════════════════════════════════════════ */
function handleWhatsappBooking() {
  if (!validateForm()) return;

  var name      = document.getElementById('custName').value.trim();
  var phone     = document.getElementById('custPhone').value.trim();
  var pickup    = document.getElementById('pickup').value.trim();
  var dropoff   = document.getElementById('dropoff').value.trim();
  var date      = document.getElementById('tripDate').value;
  var km        = parseFloat(document.getElementById('kilometers').value);
  var routeType = getRouteType(); // 'major' | 'toll' | 'other'

  var rate, baseTotal, total, rateLine, fareLine;

  if (routeType === 'major') {
    rate      = selectedCar.rate;
    total     = km * rate;
    rateLine  = 'Rate: ' + rate + ' PKR/km';
    fareLine  = 'Total Price: ' + total.toLocaleString('en-PK') + ' PKR';
  } else if (routeType === 'toll') {
    rate      = selectedCar.roundTripRate || selectedCar.rate; // flat rate, one-way, NOT doubled
    total     = km * rate;
    rateLine  = 'Rate: ' + rate + ' PKR/km (toll route rate)';
    fareLine  = 'Total Price: ' + total.toLocaleString('en-PK') + ' PKR';
  } else { // 'other'
    rate      = selectedCar.roundTripRate || selectedCar.rate;
    baseTotal = km * rate;
    total     = baseTotal * 2;
    rateLine  = 'Rate: ' + rate + ' PKR/km × 2 (round trip)';
    fareLine  = 'Fare Type: Round Trip (return journey included)\n'
              + 'One-Way Fare: ' + baseTotal.toLocaleString('en-PK') + ' PKR\n'
              + 'Total Price (Round Trip): ' + total.toLocaleString('en-PK') + ' PKR';
  }

  var formattedDate = date
    ? new Date(date).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : date;

  var coordsInfo = '';
  if (pickupCoords && dropoffCoords) {
    var pickupMapLink  = 'https://maps.google.com/?q=' + pickupCoords[0].toFixed(5)  + ',' + pickupCoords[1].toFixed(5);
    var dropoffMapLink = 'https://maps.google.com/?q=' + dropoffCoords[0].toFixed(5) + ',' + dropoffCoords[1].toFixed(5);
    coordsInfo = '\nPickup on Google Maps: ' + pickupMapLink
               + '\nDropoff on Google Maps: ' + dropoffMapLink;
  }

  // Raffle entry — only included while RAFFLE.enabled is true
  var raffleInfo = '';
  if (RAFFLE.enabled) {
    var entryId = generateRaffleEntryId();
    raffleInfo = '\n\nRaffle Entry ID: ' + entryId
               + '\n(This booking is your entry for this month\'s cashback raffle. Good luck!)';
  }

  var message = 'Hello, I want to book a taxi.\n\n'
    + 'Customer Name: ' + name + '\n'
    + 'Phone: ' + phone + '\n'
    + 'Car: ' + selectedCar.name + '\n'
    + 'Pickup: ' + pickup + '\n'
    + 'Drop-off: ' + dropoff + '\n'
    + 'Date: ' + formattedDate + '\n'
    + 'Distance: ' + km + ' km (road distance, one-way)\n'
    + rateLine + '\n'
    + fareLine
    + coordsInfo
    + raffleInfo + '\n\n'
    + 'Please confirm my booking. I will share my exact pickup location once confirmed.';

  var waLink = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(message);
  var a = document.createElement('a');
  a.href = waLink;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Opening WhatsApp... Your booking is on the way!');
}

/* ══════════════════════════════════════════════
   FAQs
══════════════════════════════════════════════ */
function renderFAQs() {
  var list = document.getElementById('faqList');
  if (!list) return;
  list.innerHTML = FAQS.map(function(faq, i) {
    return '<div class="faq-item fade-up" data-index="' + i + '">'
      + '<button class="faq-question" aria-expanded="false">'
      + '<span>' + faq.q + '</span>'
      + '<i class="fa-solid fa-chevron-down faq-icon"></i>'
      + '</button>'
      + '<div class="faq-answer" role="region">' + faq.a + '</div>'
      + '</div>';
  }).join('');
}

function initFAQAccordion() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.faq-question');
    if (!btn) return;
    var item   = btn.closest('.faq-item');
    var isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(function(i) {
      i.classList.remove('open');
      i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
  });
}

/* ══════════════════════════════════════════════
   THEME
══════════════════════════════════════════════ */
function initTheme() {
  var stored    = localStorage.getItem('swiftride-theme');
  var preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(stored || preferred);
  var btn = document.getElementById('themeToggle');
  if (btn) btn.addEventListener('click', function() {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('swiftride-theme', theme);
  var icon = document.getElementById('themeIcon');
  if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}

/* ══════════════════════════════════════════════
   NAVBAR
══════════════════════════════════════════════ */
function initNavbar() {
  var navbar    = document.getElementById('navbar');
  var hamburger = document.getElementById('hamburger');
  var navLinks  = document.getElementById('navLinks');
  window.addEventListener('scroll', function() {
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
  if (hamburger) hamburger.addEventListener('click', function() {
    var open = hamburger.classList.toggle('open');
    if (navLinks) navLinks.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  });
}

function closeNav() {
  var hamburger = document.getElementById('hamburger');
  var navLinks  = document.getElementById('navLinks');
  if (hamburger) hamburger.classList.remove('open');
  if (navLinks)  navLinks.classList.remove('open');
}

/* ══════════════════════════════════════════════
   BACK TO TOP
══════════════════════════════════════════════ */
function initBackToTop() {
  var btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', function() {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

/* ══════════════════════════════════════════════
   SHARE WEBSITE
   Uses the native phone share sheet (Web Share API) when available
   — works great on Android/iOS Chrome & Safari. Falls back to a
   custom popup with copy-link + WhatsApp/Facebook/SMS/Email options
   on desktop browsers that don't support native sharing.
══════════════════════════════════════════════ */
/* ══════════════════════════════════════════════
   MONTHLY CASHBACK RAFFLE
   Controlled entirely by the RAFFLE config object at the top
   of this file. Set RAFFLE.enabled = false to hide instantly.
══════════════════════════════════════════════ */
var raffleCountdownInterval = null;

function initRaffle() {
  var navLink      = document.getElementById('navRaffleLink');
  var triggerBtn   = document.getElementById('raffleTriggerBtn');
  var tileBtn      = document.getElementById('raffleTileBtn');

  if (!RAFFLE.enabled) {
    if (navLink)    navLink.style.display    = 'none';
    if (triggerBtn) triggerBtn.style.display = 'none';
    if (tileBtn)    tileBtn.style.display    = 'none';
    return;
  }

  if (triggerBtn) triggerBtn.style.display = 'flex';
  if (tileBtn)    tileBtn.style.display    = 'flex';
  if (navLink)    navLink.style.display    = 'list-item';

  // Update nav link to open modal instead of scrolling
  var navRaffleAnchor = navLink ? navLink.querySelector('a') : null;
  if (navRaffleAnchor) {
    navRaffleAnchor.href = '#';
    navRaffleAnchor.onclick = function(e) { e.preventDefault(); openModal('raffleModal'); };
  }

  // Prize amount
  var prizeEl = document.getElementById('rafflePrizeAmount');
  if (prizeEl) prizeEl.textContent = RAFFLE.prize;

  // Countdown timer (only if explicitly enabled)
  var countdownEl = document.getElementById('raffleCountdown');
  if (RAFFLE.countdownEnabled && countdownEl) {
    countdownEl.style.display = 'flex';
    startRaffleCountdown(RAFFLE.drawDate);
  } else if (countdownEl) {
    countdownEl.style.display = 'none';
  }

  // Last winner banner — only show if a winner name has been set
  var winnerBox  = document.getElementById('raffleWinner');
  var winnerText = document.getElementById('raffleWinnerText');
  if (RAFFLE.lastWinnerName && winnerBox && winnerText) {
    winnerText.textContent = RAFFLE.lastWinnerName + ' won ' + RAFFLE.lastWinnerPrize + '!'
      + (RAFFLE.lastWinnerEntry ? ' (Entry ' + RAFFLE.lastWinnerEntry + ')' : '');
    winnerBox.style.display = 'flex';
  } else if (winnerBox) {
    winnerBox.style.display = 'none';
  }
}

function startRaffleCountdown(drawDateStr) {
  var target = new Date(drawDateStr).getTime();
  if (isNaN(target)) return;

  function tick() {
    var now = new Date().getTime();
    var diff = target - now;

    var dEl = document.getElementById('cdDays');
    var hEl = document.getElementById('cdHours');
    var mEl = document.getElementById('cdMinutes');
    var sEl = document.getElementById('cdSeconds');

    if (diff <= 0) {
      if (dEl) dEl.textContent = '00';
      if (hEl) hEl.textContent = '00';
      if (mEl) mEl.textContent = '00';
      if (sEl) sEl.textContent = '00';
      clearInterval(raffleCountdownInterval);
      return;
    }

    var days    = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (dEl) dEl.textContent = String(days).padStart(2, '0');
    if (hEl) hEl.textContent = String(hours).padStart(2, '0');
    if (mEl) mEl.textContent = String(minutes).padStart(2, '0');
    if (sEl) sEl.textContent = String(seconds).padStart(2, '0');
  }

  tick();
  raffleCountdownInterval = setInterval(tick, 1000);
}

/* Generate a unique raffle entry ID for a booking, e.g. TM-20260619-8432 */
function generateRaffleEntryId() {
  var prefix = (CONFIG.companyName || 'APP').substring(0, 2).toUpperCase();
  var now = new Date();
  var datePart = now.getFullYear()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0');
  var randomPart = Math.floor(1000 + Math.random() * 9000); // 4-digit random
  return prefix + '-' + datePart + '-' + randomPart;
}

function initShareButton() {
  var fab = document.getElementById('shareFab');
  if (!fab) return;

  fab.addEventListener('click', function () {
    triggerShare(
      CONFIG.companyName + ' — Taxi Booking',
      'Book a reliable taxi in Abbottabad at transparent per-km rates with ' + CONFIG.companyName + '!'
    );
  });

  initSharePopup();
}

/* Shared by both the floating Share button and the Raffle "Share & Get Bonus Entry" button */
function triggerShare(title, text) {
  var shareData = { title: title, text: text, url: window.location.href };

  if (navigator.share) {
    // Native share sheet (Android/iOS) — lets user pick WhatsApp, SMS, etc. directly
    navigator.share(shareData).catch(function () {
      // User cancelled the native sheet — no action needed
    });
  } else {
    // Desktop fallback — show our own popup with link + share options
    openSharePopup(text);
  }
}

function openSharePopup(customText) {
  var overlay = document.getElementById('sharePopupOverlay');
  var linkInput = document.getElementById('shareLinkInput');
  if (!overlay) return;

  var url = window.location.href;
  var baseText = customText || ('Book a reliable taxi in Abbottabad at transparent per-km rates with ' + CONFIG.companyName + '!');
  var text = encodeURIComponent(baseText + ' ' + url);

  if (linkInput) linkInput.value = url;

  var wa = document.getElementById('shareWhatsapp');
  var fb = document.getElementById('shareFacebook');
  var sms = document.getElementById('shareSms');
  var email = document.getElementById('shareEmail');

  if (wa)    wa.href    = 'https://wa.me/?text=' + text;
  if (fb)    fb.href    = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
  if (sms)   sms.href   = 'sms:?body=' + text;
  if (email) email.href = 'mailto:?subject=' + encodeURIComponent(CONFIG.companyName + ' — Taxi Booking')
                         + '&body=' + text;

  overlay.style.display = 'flex';
}

function closeSharePopup() {
  var overlay = document.getElementById('sharePopupOverlay');
  if (overlay) overlay.style.display = 'none';
}

function initSharePopup() {
  var overlay  = document.getElementById('sharePopupOverlay');
  var closeBtn = document.getElementById('sharePopupClose');
  var copyBtn  = document.getElementById('shareCopyBtn');
  var linkInput = document.getElementById('shareLinkInput');

  if (closeBtn) closeBtn.addEventListener('click', closeSharePopup);

  // Click outside the popup card closes it
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeSharePopup();
    });
  }

  if (copyBtn && linkInput) {
    copyBtn.addEventListener('click', function () {
      linkInput.select();
      linkInput.setSelectionRange(0, 99999); // mobile Safari fallback
      navigator.clipboard.writeText(linkInput.value).then(function () {
        showToast('Link copied to clipboard!');
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
        setTimeout(function () {
          copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
        }, 2000);
      }).catch(function () {
        showToast('Could not copy — please copy manually.', true);
      });
    });
  }
}

/* ══════════════════════════════════════════════
   SCROLL ANIMATIONS
══════════════════════════════════════════════ */
function initScrollAnimations() {
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.fade-up').forEach(function(el, i) {
    if (el.closest('.cars-grid, .steps-grid, .contact-grid')) {
      el.style.transitionDelay = (i % 4 * 80) + 'ms';
    }
    observer.observe(el);
  });
  document.querySelectorAll('.section-header, .step-card, .contact-card, .faq-item').forEach(function(el) {
    el.classList.add('fade-up');
    observer.observe(el);
  });
}

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
var toastTimer = null;
function showToast(message, isError) {
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.borderColor = isError ? '#ef4444' : 'var(--accent)';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.classList.remove('show'); }, 3000);
}

function setFooterYear() {
  var el = document.getElementById('footerYear');
  if (el) el.textContent = new Date().getFullYear();
}

/* ══════════════════════════════════════════════
   MODAL — used for FAQ and Raffle popups
══════════════════════════════════════════════ */
function openModal(id) {
  var modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // prevent background scroll
}

function closeModal(id) {
  var modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function closeModalOnBg(event, id) {
  // Only close if customer clicked the dark overlay, not the modal box itself
  if (event.target === event.currentTarget) closeModal(id);
}
