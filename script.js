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
  mapCenter:      [30.3753, 69.3451],
  mapZoom:        5,
};

/**
 * ✏️ MAJOR CITIES — one-way fare at the car's NORMAL rate.
 * The driver reliably finds a return booking from these cities,
 * so no round-trip surcharge applies.
 * Add/remove city names below (case-insensitive, partial match).
 */
const MAJOR_CITIES = ['islamabad', 'rawalpindi', 'peshawar'];

/**
 * ✏️ TOLL CITIES — one-way fare, but at the car's flat ROUND-TRIP RATE
 * (e.g. 80 PKR/km), NOT doubled. Used for cities where the driver gets
 * a return booking (so no empty-return surcharge) but high toll taxes
 * along the route eat into the margin at the normal rate.
 * Add/remove city names below (case-insensitive, partial match).
 */
const TOLL_CITIES = [
  'lahore',
  'raiwind',
  'kasur',
  'kot radha kishan',
  'chunian',
  'pattoki',
  'phool nagar',
  'sheikhupura',
  'ferozewala',
  'muridke',
  'sharakpur',
  'safdarabad',
  'nankana sahib',
  'sangla hill',
  'gujranwala',
  'kamoke',
  'wazirabad',
  'hafizabad',
  'okara',
  'renala khurd',
  'deepalpur',
  'sahiwal',
  'faisalabad',
  'chiniot',
  'jaranwala',
  'toba tek singh',
  'mandi bahauddin',
  'gujrat',
  'sialkot',
  'narowal'
];

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
    id: 'hiace', name: 'Hiace Van', tag: 'Group Travel',
    desc: 'Spacious van for groups, families & tours. AC available.',
    seats: 12, ac: true, luggage: 6, rate: null, callOnly: true, icon: 'fa-van-shuttle',
  },
  {
    id: 'coaster', name: 'Coaster', tag: 'Large Group',
    desc: 'Ideal for big groups, weddings & long-distance tours.',
    seats: 24, ac: true, luggage: 12, rate: null, callOnly: true, icon: 'fa-bus',
  },
];

const FAQS = [
  {
    q: 'How is the fare calculated?',
    a: 'Your fare is: Distance (km) x Rate per km for the selected vehicle. The map calculates straight-line distance between pickup and drop-off. No hidden charges — tolls and waiting time may be billed separately.',
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

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
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
  initBackToTop();
  initFAQAccordion();
  initScrollAnimations();
  setFooterYear();
});

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

  var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng;
  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'TravelMateTaxiApp/1.0' } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var label = data.display_name
        ? data.display_name.split(',').slice(0, 3).join(',')
        : lat.toFixed(4) + ', ' + lng.toFixed(4);
      var input = document.getElementById(type);
      if (input) input.value = label;
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

function reverseGeocode(lat, lng, type) {
  var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng;
  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'SwiftRideTaxiApp/1.0' } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var label = data.display_name
        ? data.display_name.split(',').slice(0, 3).join(',')
        : lat.toFixed(4) + ', ' + lng.toFixed(4);
      var input = document.getElementById(type);
      if (input) input.value = label;
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
    var rateBlock, actionBtn, ariaLabel;

    if (car.callOnly) {
      rateBlock = '<div class="car-rate call-rate"><i class="fa-solid fa-phone-volume"></i> Call to Confirm Rate</div>';
      actionBtn = '<button class="btn-select btn-call" data-car-id="' + car.id + '" data-call="true">'
                + '<i class="fa-solid fa-phone"></i> Call / WhatsApp</button>';
      ariaLabel = 'Contact us for ' + car.name + ' rates';
    } else {
      rateBlock = '<div class="car-rate">' + car.rate + ' <span>PKR/km</span></div>';
      actionBtn = '<button class="btn-select" data-car-id="' + car.id + '">Select</button>';
      ariaLabel = 'Select ' + car.name + ' at ' + car.rate + ' PKR per km';
    }

    return '<article class="car-card fade-up' + (car.callOnly ? ' car-card-call' : '') + '" id="car-' + car.id + '" data-car-id="' + car.id + '" role="button" tabindex="0" aria-label="' + ariaLabel + '">'
      + '<div class="car-img-wrap">'
      + '<i class="fa-solid ' + car.icon + ' car-placeholder-icon"></i>'
      + '<div class="car-tag">' + car.tag + '</div>'
      + '</div>'
      + '<div class="car-body">'
      + '<div class="car-name">' + car.name + '</div>'
      + '<div class="car-desc">' + car.desc + '</div>'
      + '<div class="car-meta">'
      + '<div class="car-meta-item"><i class="fa-solid fa-user-group"></i><span>' + car.seats + ' Seats</span></div>'
      + '<div class="car-meta-item"><i class="fa-solid fa-snowflake"></i><span>' + (car.ac ? 'AC' : 'Non-AC') + '</span></div>'
      + '<div class="car-meta-item"><i class="fa-solid fa-suitcase"></i><span>' + car.luggage + ' Bag' + (car.luggage !== 1 ? 's' : '') + '</span></div>'
      + '</div>'
      + '<div class="car-rate-row">'
      + rateBlock
      + actionBtn
      + '</div>'
      + '</div>'
      + '</article>';
  }).join('');

  grid.querySelectorAll('.car-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      var car = CARS.find(function(c) { return c.id === card.dataset.carId; });
      if (car && car.callOnly) {
        if (e.target.closest('.btn-call') || card.contains(e.target)) {
          contactForCallOnlyCar(car);
        }
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

/* For Hiace / Coaster — open WhatsApp directly to ask for rate, no fare calculator */
function contactForCallOnlyCar(car) {
  var message = 'Hello, I want to inquire about booking a ' + car.name + ' (' + car.seats + ' seater).\n\n'
    + 'Please share the rate and availability.\n\n'
    + 'Name: \n'
    + 'Pickup: \n'
    + 'Drop-off: \n'
    + 'Date: \n'
    + 'Number of Passengers: ';

  var waLink = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(message);
  var a = document.createElement('a');
  a.href = waLink;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Opening WhatsApp to inquire about ' + car.name + '...');
}

function selectCar(carId) {
  selectedCar = CARS.find(function(c) { return c.id === carId; }) || null;
  document.querySelectorAll('.car-card').forEach(function(c) { c.classList.remove('selected'); });
  document.querySelectorAll('.btn-select').forEach(function(b) { b.textContent = 'Select'; });
  if (selectedCar) {
    var card = document.getElementById('car-' + carId);
    if (card) { card.classList.add('selected'); card.querySelector('.btn-select').textContent = 'Selected'; }
    var pill = document.getElementById('selectedCarName');
    if (pill) pill.textContent = selectedCar.name + ' — ' + selectedCar.rate + ' PKR/km';
    var bookingSec = document.getElementById('booking');
    if (bookingSec) {
      var rect = bookingSec.getBoundingClientRect();
      if (rect.top > window.innerHeight) bookingSec.scrollIntoView({ behavior: 'smooth' });
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
      if (id === 'dropoff') recalcFare(); // re-check major city / round-trip on every keystroke
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

/**
 * Determine the route pricing type based on the drop-off text:
 *   'major' — normal car rate, one-way (Islamabad/Rawalpindi/Peshawar)
 *   'toll'  — flat roundTripRate, one-way, NOT doubled (Lahore — high tolls)
 *   'other' — flat roundTripRate, doubled (driver returns empty)
 */
function getRouteType() {
  var dropoffEl = document.getElementById('dropoff');
  if (!dropoffEl) return 'major'; // default: safest assumption if unknown
  var val = dropoffEl.value.trim().toLowerCase();
  if (!val) return 'major';
  for (var i = 0; i < MAJOR_CITIES.length; i++) {
    if (val.indexOf(MAJOR_CITIES[i]) !== -1) return 'major';
  }
  for (var j = 0; j < TOLL_CITIES.length; j++) {
    if (val.indexOf(TOLL_CITIES[j]) !== -1) return 'toll';
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
    effRate     = selectedCar.roundTripRate || selectedCar.rate; // flat 80, one-way, NOT doubled
    displayRate = effRate;
    total       = km > 0 ? km * effRate : 0;
  } else { // 'other' — flat rate doubled, driver returns empty
    effRate     = selectedCar.roundTripRate || selectedCar.rate;
    displayRate = effRate * 2;
    total       = km > 0 ? km * effRate * 2 : 0;
  }

  var sumCar  = document.getElementById('sumCar');
  var sumKm   = document.getElementById('sumKm');
  var sumRate = document.getElementById('sumRate');
  var notice  = document.getElementById('fareNotice');
  var rtNotice  = document.getElementById('roundTripNotice');
  var tollNotice = document.getElementById('tollNotice');

  if (sumCar)  sumCar.textContent  = selectedCar ? selectedCar.name : '—';
  if (sumKm)   sumKm.textContent   = km > 0 ? km + ' km' + (routeType === 'other' ? ' (round trip)' : '') : '—';
  if (sumRate) sumRate.textContent = displayRate > 0
    ? (routeType === 'other' ? effRate + ' PKR × 2 = ' + displayRate + ' PKR' : displayRate + ' PKR')
    : '—';

  // Show/hide notices
  if (rtNotice)   rtNotice.style.display   = (km > 0 && routeType === 'other') ? 'flex' : 'none';
  if (tollNotice) tollNotice.style.display = (km > 0 && routeType === 'toll')  ? 'flex' : 'none';

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
    + coordsInfo + '\n\n'
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
  if (navLinks) navLinks.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function() {
      if (hamburger) hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });
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
