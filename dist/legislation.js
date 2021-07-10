/* global L, DOMPurify */

fetch('dist/legislation.json')
  .then((response) => response.json())
  .then((legislationChoices) => {
    /* Select legislation from query string */

    const searchParams = new URLSearchParams(document.location.search);
    const selectedId = searchParams.get('id');
    const selectedLegislation = legislationChoices.find(
      (legislation) => legislation.id === selectedId,
    );

    if (!selectedLegislation) {
      document.location.search = `?id=${legislationChoices[0].id}`;
    }

    /* Display a menu of legislation choices */

    const leglislationNavItem = (legislation) => DOMPurify.sanitize(/* html */`
      <li>
        <a href="?id=${legislation.id}"
        ${legislation.id === selectedId ? 'aria-current="page"' : ''}
        >${legislation.title}</a>
      </li>
    `);

    document.getElementById('app').insertAdjacentHTML(
      'beforebegin',
      DOMPurify.sanitize(/* html */`
        <nav>
          <ul>
            ${legislationChoices.map(leglislationNavItem).join('')}
          </ul>
        </nav>
      `),
    );

    /* Load the legislative district boundaries and bill data */

    Promise.all([
      /* The GeoJSON contains basic contact information for each rep */
      fetch('https://raw.githubusercontent.com/bhrutledge/ma-legislature/main/dist/ma_house.geojson')
        .then((response) => response.json()),
      fetch('https://raw.githubusercontent.com/bhrutledge/ma-legislature/main/dist/ma_senate.geojson')
        .then((response) => response.json()),
      fetch(`dist/ma_bill_${selectedLegislation.session}_${selectedLegislation.houseBill}.json`)
        .then((response) => response.json()),
      fetch(`dist/ma_bill_${selectedLegislation.session}_${selectedLegislation.senateBill}.json`)
        .then((response) => response.json()),
    ]).then(([houseFeatures, senateFeatures, ...bills]) => {
      /* Set the page heading */

      document.title = `${selectedLegislation.title} | ${document.title}`;

      document.getElementById('app').insertAdjacentHTML(
        'afterbegin',
        DOMPurify.sanitize(/* html */`
          <h1>
            ${selectedLegislation.title}
            <small><a href="https://www.aclum.org/en/legislation/${selectedId}">aclum.org</a></small>
          </h1>

          <p>
            <strong>Highlight:</strong>
            <label>
              <input type="radio" name="highlight" value="highlight-sponsors" checked />Cosponsors
            </label>
            <label>
              <input type="radio" name="highlight" value="highlight-committee" />Committee members
            </label>
          </p>
        `),
      );

      /* Toggle the map highlight */

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

      /* Build a map for each bill */

      bills.forEach((bill) => {
        /* Build a rep info object, e.g. `rep.first_name`, `rep.party`, etc. */

        const committee = bill.BeforeCommittee;

        const committeeUrls = new Set();
        [...committee.HouseMembers, ...committee.SenateMembers].forEach((member) => {
          committeeUrls.add(`https://malegislature.gov/Legislators/Profile/${member.MemberCode}`);
        });

        const sponsorUrls = new Set();
        bill.Cosponsors.forEach((sponsor) => {
          sponsorUrls.add(`https://malegislature.gov/Legislators/Profile/${sponsor.Id}`);
        });

        const repProperties = (feature) => ({
          ...feature.properties,
          committee: committeeUrls.has(feature.properties.url),
          sponsor: sponsorUrls.has(feature.properties.url),
        });

        /* Templates for map elements */

        const districtLegend = () => DOMPurify.sanitize(/* html */`
          <div class="legend__item legend__item--Democrat">
            Democrat
          </div>
          <div class="legend__item legend__item--Republican">
            Republican
          </div>
          <div class="legend__item legend__item">
            Other
          </div>
        `);

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

        document.getElementById('app').insertAdjacentHTML(
          'beforeend',
          DOMPurify.sanitize(/* html */`
            <h2>
              <a href="https://malegislature.gov/Bills/${bill.GeneralCourtNumber}/${bill.BillNumber}">${bill.BillNumber}</a>:
              ${bill.Title}
            </h2>
            <p>
              Before the
              <a href="https://malegislature.gov/Committees/Detail/${committee.CommitteeCode}/${committee.GeneralCourtNumber}">${committee.FullName}</a>
            </p>
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

        const billChamber = bill.BillNumber.startsWith('S') ? 'Senate' : 'House';
        map.addLayer(layers[billChamber])
          .fitBounds(layers[billChamber].getBounds())
          // Avoid accidental excessive zoom out
          .setMinZoom(map.getZoom());

        const layerControl = L.control.layers(layers, {}, {
          collapsed: false,
        });
        layerControl.addTo(map);

        const legendControl = L.control({ position: 'bottomleft' });
        legendControl.onAdd = () => {
          const div = document.createElement('div');
          div.classList = 'legend';
          div.innerHTML = districtLegend();
          return div;
        };
        legendControl.addTo(map);
      });
    });
  });