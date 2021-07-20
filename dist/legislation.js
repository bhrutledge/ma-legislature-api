/* global L, DOMPurify */

(async () => {
  const fetchJson = async (url) => fetch(url).then((response) => response.json());

  /* Select legislation from query string */

  const legislationChoices = await fetchJson('dist/legislation.json');

  const searchParams = new URLSearchParams(document.location.search);
  const selectedId = searchParams.get('id');
  const selectedLegislation = legislationChoices.find(
    (legislation) => legislation.id === selectedId,
  );

  if (!selectedLegislation) {
    document.location.search = `?id=${legislationChoices[0].id}`;
  }

  /* Set the page heading */

  const app = document.getElementById('app');

  document.title = `${selectedLegislation.title} | ${document.title}`;

  app.insertAdjacentHTML(
    'beforeend',
    DOMPurify.sanitize(/* html */`
      <h1>${selectedLegislation.title}</h1>

      <blockquote>
        ${selectedLegislation.description}
        <br>
        <cite>
          More information on
          <a href="${selectedLegislation.url}">${(new URL(selectedLegislation.url)).hostname.replace('www.', '')}</a>
        </cite>
      </blockquote>
      `),
  );

  /* Load the legislative district boundaries and bill data */

  const [houseFeatures, senateFeatures, ...bills] = await Promise.all([
    /* The GeoJSON contains basic contact information for each rep */
    fetchJson('https://raw.githubusercontent.com/bhrutledge/ma-legislature/main/dist/ma_house.geojson'),
    fetchJson('https://raw.githubusercontent.com/bhrutledge/ma-legislature/main/dist/ma_senate.geojson'),
    ...selectedLegislation.bills.map((bill) => fetchJson(`dist/ma_bill_${bill.session}_${bill.number}.json`)),
  ]);

  /* Display each bill */

  bills.forEach((bill) => {
    const committee = bill.BeforeCommittee;

    app.insertAdjacentHTML(
      'beforeend',
      DOMPurify.sanitize(/* html */`
        <p>
          <a href="https://malegislature.gov/Bills/${bill.GeneralCourtNumber}/${bill.BillNumber}">${bill.BillNumber}</a>:
          ${bill.Title}
          <br />
          Before the
          <a href="https://malegislature.gov/Committees/Detail/${committee.CommitteeCode}/${committee.GeneralCourtNumber}">${committee.FullName}</a>
        </p>
      `),
    );
  });

  /* Display updated timestamp */

  const updatedAt = new Date(bills.map((b) => b.Updated).sort()[0]);

  app.insertAdjacentHTML(
    'beforeend',
    DOMPurify.sanitize(/* html */`
      <p><small>Updated on ${updatedAt.toLocaleDateString()}</small></p>
    `),
  );

  /* Build a rep info object, e.g. `rep.first_name`, `rep.party`, etc. */

  const committeeUrls = new Set();
  const sponsorUrls = new Set();

  bills.forEach((bill) => {
    const committee = bill.BeforeCommittee;

    [...committee.HouseMembers, ...committee.SenateMembers].forEach((member) => {
      committeeUrls.add(`https://malegislature.gov/Legislators/Profile/${member.MemberCode}`);
    });

    bill.Cosponsors.forEach((sponsor) => {
      sponsorUrls.add(`https://malegislature.gov/Legislators/Profile/${sponsor.Id}`);
    });
  });

  const repProperties = (feature) => ({
    ...feature.properties,
    committee: committeeUrls.has(feature.properties.url),
    sponsor: sponsorUrls.has(feature.properties.url),
  });

  /* Templates for map elements */

  const districtStyle = (rep) => ({
    className: `
        district district--${rep.party}
        ${rep.sponsor ? 'district--sponsor' : ''}
        ${rep.committee ? 'district--committee' : ''}
      `,
  });

  const districtPopup = (rep) => DOMPurify.sanitize(/* html */`
    <p>
      <strong>${rep.first_name} ${rep.last_name}</strong>
      ${rep.party ? `<br />${rep.party}` : ''}
      <br />${rep.district}
      ${rep.url ? `<br /><a href="${rep.url}">Contact</a>` : ''}
    </p>
  `);

  const onPopup = (event) => {
    const active = event.type === 'popupopen';
    event.target.getElement().classList.toggle('district--active', active);
  };

  /* Build the district layers */

  const districtLayer = (features) => L.geoJson(features, {
    style: (feature) => districtStyle(repProperties(feature)),
    onEachFeature: (feature, layer) => {
      const rep = repProperties(feature);

      layer.bindPopup(districtPopup(rep));
      layer.on('popupopen', onPopup);
      layer.on('popupclose', onPopup);

      // Enable searching by name or district; inspired by:
      // https://github.com/stefanocudini/leaflet-search/issues/52#issuecomment-266168224
      // eslint-disable-next-line no-param-reassign
      feature.properties.index = `${rep.first_name} ${rep.last_name} - ${rep.district}`;
    },
  });

  const districtSearch = (layer) => new L.Control.Search({
    layer,
    propertyName: 'index',
    initial: false,
    marker: false,
    textPlaceholder: 'Search legislators and districts',
    moveToLocation(latlng, title, map) {
      map.fitBounds(latlng.layer.getBounds());
      latlng.layer.openPopup();
    },
  });

  const layers = {
    House: districtLayer(houseFeatures),
    Senate: districtLayer(senateFeatures),
  };

  const searchControls = {
    House: districtSearch(layers.House),
    Senate: districtSearch(layers.Senate),
  };

  /* Build the map */

  app.insertAdjacentHTML(
    'beforeend',
    DOMPurify.sanitize(/* html */`
      <div class="map-container">
        <div class="map"></div>
      </div>
    `),
  );

  const mapDiv = document.querySelector('.map-container:last-child .map');
  const map = L.map(mapDiv).addLayer(L.tileLayer.provider('CartoDB.Positron'));

  Object.keys(layers).forEach((chamber) => {
    layers[chamber]
      .on('add', () => searchControls[chamber].addTo(map))
      .on('remove', () => searchControls[chamber].remove());
  });

  const chamberLayer = layers.House;
  map.addLayer(chamberLayer)
    .fitBounds(chamberLayer.getBounds())
    // Avoid accidental excessive zoom out
    .setMinZoom(map.getZoom());

  const layerControl = L.control.layers(layers, {}, {
    collapsed: false,
  });
  layerControl.addTo(map);

  /* Toggle the map highlight */

  const highlightControl = L.control({ position: 'topright' });
  highlightControl.onAdd = () => {
    // Based on L.control.layers
    const div = L.DomUtil.create('div', 'leaflet-control-layers leaflet-control-layers-expanded');
    div.innerHTML = DOMPurify.sanitize(/* html */`
      <section class="leaflet-control-layers-list">
        <label>
          <input
            type="radio"
            name="highlight"
            value="highlight-sponsors"
            class="leaflet-control-layers-selector"
            checked
          >
          Cosponsors
        </label>
        <label>
          <input
            type="radio"
            name="highlight"
            value="highlight-committee"
            class="leaflet-control-layers-selector"
          >
          Committee
        </label>
      </section>
    `);
    return div;
  };
  highlightControl.addTo(map);

  document.querySelectorAll('input[name="highlight"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const currentHighlights = Array.from(document.body.classList)
        .filter((c) => c.startsWith('highlight'));

      document.body.classList.remove(...currentHighlights);
      document.body.classList.add(event.target.value);
    });
  });

  const checkedHiglight = document.querySelector('input[name="highlight"]:checked');
  document.body.classList.add(checkedHiglight.value);

  /* Display a menu of legislation choices */

  const leglislationNavItem = (legislation) => DOMPurify.sanitize(/* html */`
    <li>
      <p>
        <a href="?id=${legislation.id}"
          ${legislation.id === selectedId ? 'aria-current="page"' : ''}
        >${legislation.title}</a>
        <br>
        ${legislation.bills.map((b) => b.number).join(' / ')}
      </p>
    </li>
  `);

  app.insertAdjacentHTML(
    'beforeend',
    DOMPurify.sanitize(/* html */`
      <h2>Legislative priorities</h2>
      <nav>
        <ul>
          ${legislationChoices.map(leglislationNavItem).join('')}
        </ul>
      </nav>
    `),
  );
})();
