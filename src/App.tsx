import { decode } from 'google-polyline';
import mapboxgl, { GeoJSONSourceRaw, LngLat, MercatorCoordinate } from 'mapbox-gl'; // eslint-disable-line import/no-webpack-loader-syntax
import 'mapbox-gl/dist/mapbox-gl.css';
import { tileToGeoJSON } from '@mapbox/tilebelt';
import { useEffect, useRef, useState } from 'react';
import SportSelect, { sport } from './SportSelect';
// @ts-ignore
import { VectorTile } from '@mapbox/vector-tile';
// @ts-ignore
import Protobuf from 'pbf';

mapboxgl.accessToken = process.env.REACT_APP_MAP_BOX_TOKEN || '';
const stravaToken = process.env.REACT_APP_STRAVA_TOKEN || '';

function App() {

  const mapContainer = useRef<any>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const defaultLng = 11.576124;
  const defaultLat = 48.137154;
  const defaultZoom = 10;
  const defaultSport: sport = "riding"

  const [isSending, setSending] = useState(false);
  const [currentSport, setSport] = useState<sport>(defaultSport);
  const [zoom, setZoom] = useState(defaultZoom);
  const [topSegments, setTopSegments] = useState<TopSegments>({ topSegments: [], athleteCount: 0, starCount: 0 })
  const [trailViewGeo, setTrailViewGeo] = useState<GeoJSON.Feature<GeoJSON.Geometry>[]>([])
  const [stravaHeatmaps, setStravaHeatmaps] = useState<StravaHeatmap[]>([])
  const [mapLoaded, setMapLoaded] = useState(false);

  const fetchOverlayData = (() => {
    const m = map.current
    if (m && !isSending) {
      setSending(true)
      const bounds = m.getBounds()

      Promise.all([
        fetchTopTen(bounds.getSouthWest(), bounds.getNorthEast(), currentSport).then(setTopSegments),
        getKomootHighlights(zoom, m.getBounds().getNorthWest(), m.getBounds().getSouthEast())
          .then(geoms => setTrailViewGeo(geoms.flat()))
      ]).finally(() => setSending(false))
    }
  })

  useEffect(() => {
    const m = map.current
    if (m) {
      setStravaHeatmaps(getStravaHeatmaps(zoom, m.getBounds().getNorthWest(), m.getBounds().getSouthEast(), currentSport))
    }
  }, [zoom])

  useEffect(() => {
    const m = map.current
    if (m && topSegments.topSegments.length > 0) addSegments(topSegments.topSegments, m);
    return () => { if (m && topSegments.topSegments.length > 0) deleteSegments(topSegments.topSegments, m); }
  }, [topSegments])

  useEffect(() => {
    const m = map.current
    if (m && trailViewGeo.length > 0) addKomootTrailview(trailViewGeo, m);
    return () => {
      if (m && trailViewGeo.length > 0) {
        deleteTrailViews(m);
        deleteHeatMap(m);
      }
    }
  }, [trailViewGeo])

  useEffect(() => {
    const m = map.current
    if (m && stravaHeatmaps.length > 0 && mapLoaded) addStravaHeatmaps(stravaHeatmaps, m);
    return () => {
      if (m && stravaHeatmaps.length > 0 && mapLoaded) {
        deleteStravaHeatmap(m, stravaHeatmaps);
      }
    }
  }, [stravaHeatmaps, mapLoaded])

  useEffect(() => {
    if (map.current) return;
    else {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: [defaultLng, defaultLat],
        zoom: defaultZoom
      });

      map.current.on('load', () => {
        setMapLoaded(true);
      });
    }
  }, [zoom])

  useEffect(() => {
    map.current?.on('move', () => {
      const z = map.current ? Math.floor(map.current?.getZoom()) : defaultZoom;
      setZoom(z);
    });
  }, [zoom])

  return (
    <div>
      <SportSelect setSport={setSport} sport={currentSport}></SportSelect>
      <div ref={mapContainer} className="map-container" />
      <button className="load-button" disabled={isSending} onClick={fetchOverlayData}>Show places to visit</button>
      <div>{zoom}</div>
    </div>
  );
}

function addSegments(segments: Segment[], map: mapboxgl.Map): void {

  // render most import segment last to be highest layer (in case of overlap)
  segments.reverse().forEach((segment, i) => {
    const coordinates = decode(segment.points)

    const source: GeoJSONSourceRaw = {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates.map(([a, b]) => [b, a]), // Strava vs Mapbox :)
        },
        properties: null
      },
    };


    const id = `${segment.id}`;
    map.addLayer({
      id: id,
      type: 'line',
      source: source,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': (i === segments.length - 1) ? '#0fe400' : '#0074e4',
        'line-width': 5,
      },
    });


    const link = `https://www.strava.com/segments/${id}`
    map.on('click', id, (e) => {
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<a href=${link}>${segment.name}</a>`)
        .addTo(map);

    });
  });
}

function addStravaHeatmaps(heatmaps: StravaHeatmap[], map: mapboxgl.Map): void {
  heatmaps.forEach(heatmap => {

    map.addSource("overlay-image-source" + heatmap.img, {
      type: "image",
      url: heatmap.img,
      coordinates: heatmap.polygon.coordinates[0].reverse().slice(0, 4)
    });

    map.addLayer({
      id: "overlay-image-layer" + heatmap.img,
      type: "raster",
      source: "overlay-image-source" + heatmap.img,
      paint: {
        "raster-opacity": 0.7,
      }
    })


  })
}
function addKomootTrailview(trailviews: GeoJSON.Feature<GeoJSON.Geometry>[], map: mapboxgl.Map): void {

  map.addLayer({
    id: 'point-layer',
    type: 'circle',
    minzoom: 11,
    source: {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: trailviews,
      },
    },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'significance'], 0, 3, 1000, 10],
      'circle-color': 'green',
      'circle-opacity': 0.8,
    },
  });

  map.addLayer({
    id: 'heatmap-layer',
    type: 'heatmap',
    source: {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: trailviews,
      },
    },
    maxzoom: 13,
    paint: {
      'heatmap-weight': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 0.09,
        1, 1,
      ],
      'heatmap-intensity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        7, 0.34,
        15, 2.5,
      ],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(0, 0, 255, 0)',
        0.2, 'royalblue',
        0.4, 'cyan',
        0.6, 'lime',
        0.8, 'yellow',
        1.0, 'red',
      ],
      'heatmap-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0, 15,
        15, 40,
      ],
      'heatmap-opacity': 0.6,
    },
  });



  map.on('click', 'point-layer', (e) => {
    const clickedPointId = e.features && e.features[0].properties?.trailview_id
    const link = `https://www.komoot.de/api/trailview/v1/images/${clickedPointId}?hl=de`

    // nothing better to do here, can not acess photos withouth cookie :(
    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<a href=${link}>${clickedPointId}</a>`)
      .addTo(map);
  });

}

function deleteHeatMap(map: mapboxgl.Map): void {
  const id = 'heatmap-layer'
  map.removeLayer(id);
  map.removeSource(id);
}

function deleteStravaHeatmap(map: mapboxgl.Map, stravaHeatmaps: StravaHeatmap[]): void {
  stravaHeatmaps.forEach(heatmap => {
    map.removeLayer("overlay-image-layer" + heatmap.img,);
    map.removeSource("overlay-image-source" + heatmap.img)
  })
}


function deleteTrailViews(map: mapboxgl.Map): void {
  const id = 'point-layer'
  map.removeLayer(id);
  map.removeSource(id);
}

function deleteSegments(segments: Segment[], map: mapboxgl.Map): void {
  segments.forEach(segment => {
    const id = 'segment-line-' + segment.id;
    map.removeLayer(id);
  });
}

interface Segment { id: number, name: string, points: string }
interface TopSegments { topSegments: Segment[], athleteCount: number, starCount: number }

function fetchTopTen(sW: LngLat, nE: LngLat, sport: sport): Promise<TopSegments> {
  const bounds = [sW.lat, sW.lng, nE.lat, nE.lng];
  const url = `https://www.strava.com/api/v3/segments/explore?bounds=${bounds}&activity_type=${sport}`


  const headers = new Headers();
  headers.append('Authorization', `Bearer ${stravaToken}`);

  return fetch(url, { method: 'GET', headers: headers, })
    .then(response => {
      if (!response.ok) throw new Error('Network response was not ok');
      else return response.json();
    })
    .then(data => { return { topSegments: data.segments as Segment[], athleteCount: 0, starCount: 0 } })
    .catch(error => {
      console.error('Error:', error);
      return { topSegments: [], athleteCount: 0, starCount: 0 };
    });
}

// do not need usage count atm
function fetchTopSegmentCount(recData: TopSegments): Promise<TopSegments> {
  if (recData.topSegments.length > 0) {
    const url = `https://www.strava.com/api/v3/segments/${recData.topSegments[0].id}`


    const headers = new Headers();
    headers.append('Authorization', `Bearer ${stravaToken}`);

    return fetch(url, { method: 'GET', headers: headers, })
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        else return response.json();
      })
      .then(data => { return { ...recData, athleteCount: data.athlete_count, starCount: data.star_count }; })
      .catch(error => {
        console.error('Error:', error);
        return recData;
      });
  }
  else return Promise.resolve(recData);
}

function calcAllVisibleTiles(z: number, nW: LngLat, sE: LngLat): [number, number][] {
  const tileCount = Math.pow(2, z); // Number of tiles in one dimension at this zoom level

  // Calculate tile coordinates
  const nWXTile = Math.floor((nW.lng + 180) / 360 * tileCount);
  const nWYTile = Math.floor((1 - Math.log(Math.tan(nW.lat * Math.PI / 180) + 1 / Math.cos(nW.lat * Math.PI / 180)) / Math.PI) / 2 * tileCount);

  const sEXTile = Math.floor((sE.lng + 180) / 360 * tileCount);
  const sEYTile = Math.floor((1 - Math.log(Math.tan(sE.lat * Math.PI / 180) + 1 / Math.cos(sE.lat * Math.PI / 180)) / Math.PI) / 2 * tileCount);

  const xYPairs: [number, number][] = []

  for (let x = nWXTile; x <= sEXTile; x++) {
    for (let y = nWYTile; y <= sEYTile; y++) {
      xYPairs.push([x, y])
    }
  }
  return xYPairs;
}
function getKomootHighlights(z: number, nW: LngLat, sE: LngLat): Promise<GeoJSON.Feature<GeoJSON.Geometry>[]> {
  //protection for komoot, do not fetch tooo many tiles
  if (z < 7) return Promise.resolve([]);

  // zoom min 9 for komoot
  // no max, but can be empty
  const zoom = Math.max(z, 9)

  const xYPairs = calcAllVisibleTiles(zoom, nW, sE)
  const results = Promise.all(xYPairs.map(([x, y]) => fetchOneTile(zoom, x, y))).then(a => a.flat());
  return results;
}

interface StravaHeatmap {
  polygon: GeoJSON.Polygon,
  img: string
}
function getStravaHeatmaps(z: number, nW: LngLat, sE: LngLat, sport: sport): StravaHeatmap[] {
  const maxZoom = Math.min(10, z)
  const xYPairs = calcAllVisibleTiles(maxZoom, nW, sE)
  const results = xYPairs.map(([x, y]) => fetchOneTileHeatmap(maxZoom, x, y, sport));
  return results;
}

function fetchOneTileHeatmap(zoom: number, xTile: number, yTile: number, sport: sport): StravaHeatmap {

  const mappedSport = sport === "riding" ? "ride" : "run";
  const url = `http://localhost:8000/tiles/${mappedSport}/blue/${zoom}/${xTile}/${yTile}@2x.png?v=19`

  return { polygon: tileToGeoJSON([xTile, yTile, zoom]), img: url };
}

function fetchOneTile(zoom: number, xTile: number, yTile: number): Promise<GeoJSON.Feature<GeoJSON.Geometry>[]> {

  const url = `https://trailview-tiles.maps.komoot.net/tiles/v2/${zoom}/${xTile}/${yTile}.vector.pbf`

  return fetch(url).then(res => {
    return new Response(res.body).arrayBuffer()
  }).then(tileD => {

    const tile = new VectorTile(new Protobuf(tileD));
    const tileLayer = tile.layers.komoot_trailview;

    const featuresLatLng: GeoJSON.Feature<GeoJSON.Geometry>[] = [];

    for (let i = 0; i < tileLayer?.length || 0; i++) {
      const feature = tileLayer.feature(i);
      const geoJson = feature.toGeoJSON(xTile, yTile, zoom) as GeoJSON.Feature<GeoJSON.Geometry>;
      featuresLatLng.push(geoJson);
    }

    return featuresLatLng;
  })
}

export default App;
