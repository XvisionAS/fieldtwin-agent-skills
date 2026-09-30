# Projector, convertor and raster analysis

Verified against integration-guide revision 65 and the matching service contracts on 2026-10-01.
Check endpoint availability and deployment configuration before use.

Use these HTTP services when an integration needs to transform coordinates, read a vector drawing,
or measure an existing raster. Each request returns its result directly. These calls do not create
FieldTwin resources or start a background import job.

## Connect to the right service

| Service | Base URL | Authentication | Result |
| --- | --- | --- | --- |
| Projector | Trusted `loaded.projectorUrl` | No bearer token required by the service | CRS information or transformed points |
| Convertor | Deployment-configured convertor URL | `Authorization: Bearer <current JWT>` | GeoJSON or format metadata |
| Analysis | Deployment-configured analysis URL | `Authorization: Bearer <current JWT>` | Raster measurements, metadata or encoded pixels |

The unified deployment uses `https://fieldtwin.example/projector`, `/convertor` and `/analysis`.
Confirm the actual URLs with the deployment administrator. `loaded` does not supply `convertorUrl`
or `analysisUrl`; do not invent these fields or derive service URLs by changing a hostname. Append
the endpoint to the configured base, preserving its path. These endpoints are outside
`/API/{APIVersion}` and do not use the API-token `token:` header.

Convertor and analysis verify an RS256 JWT against the deployment's verification key. Use the
current integration JWT from the trusted bridge on compatible deployments; replace it on
`tokenRefresh` and build headers immediately before each request. The JWT authenticates the
service call. It is not forwarded to the source file or raster server: provide a URL that the
service can read, such as a fresh signed download URL. Keep signed URLs out of logs and stored
configuration. A browser-local `blob:` URL is not a server-readable source.

The examples below assume a trusted bridge has already been established and that
`getCurrentToken()` reads its in-memory token. Configure `convertorUrl` and `analysisUrl` separately.
Use this helper for JSON POST requests:

```javascript
async function postServiceJson(baseUrl, endpoint, payload, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || result.errorMessage || result.details || `HTTP ${response.status}`)
  }
  if (result.status && result.status !== 'ok') {
    throw new Error(result.errorMessage || result.status)
  }
  return result
}
```

Catch failures at the integration UI boundary and show the user the recovery action. Abort pending
fetches when the panel closes. A cancelled HTTP request does not guarantee that server work stops.

## Projector: inspect a CRS and transform points

| Request, relative to the projector base | Response |
| --- | --- |
| `GET /units` | Array of `{ code, name }` CRS choices; despite the route name, this is not a measurement-unit list |
| `GET /unit?crs=EPSG%3A32631` | `isLongLat`, `unit`, `toMeter`, `toRadian`, `axis`, optional `bounds`, `bounds_crawler` and `wkt1esri` |
| `GET /transform?s=EPSG%3A4326&t=EPSG%3A32631` | Candidate coordinate operations; `proj`, `name`, `accuracy` and optional authority, code, scope or remarks |
| `POST /transform` | Array of transformed coordinate tuples, in input order |

`POST /transform` requires string `source` and `target`, plus a non-empty `points` array. Every
point must contain two or three numeric values and have the same length. Optional `source_type`
and `target_type` accept `wkt` or `proj` for explicit CRS definitions; use `EPSG:32631` syntax for
EPSG codes. Optional `proj_string` selects an explicit coordinate operation, for example a `proj`
string from the candidate-operation response. `/unit` accepts the corresponding `crs_type` query.
URL-encode query values, especially WKT and PROJ strings. Operation availability and datum grids
depend on the deployment; a listed candidate is not a guarantee that its grids are installed.

**Preserve native CRS axis order.** The point-transform endpoint does not normalise to GeoJSON
longitude/latitude order. EPSG:4326 uses `[latitude, longitude]`; many projected CRSs use
`[easting, northing]`. Inspect `/unit`'s `axis`: `n`, `s`, `e`, `w`, `u`, `d` mean north, south,
east, west, up, down; `o` means another orientation. Do not apply this endpoint's tuple rule to
GeoJSON or the `cursorPosition` event without checking their separate contracts.

```javascript
const projected = await postServiceJson(loaded.projectorUrl, 'transform', {
  source: 'EPSG:4326',
  target: 'EPSG:32631',
  points: [[60, 5], [60.001, 5.001]],
})
```

The result is a bare array such as `[[easting, northing], ...]`, with no `points` wrapper. Three-value
inputs produce three-value outputs; the vertical result depends on the chosen CRS/operation, so
do not assume the endpoint converts depth units or vertical datums automatically. Batch large
point sets; the FieldTwin client uses 2,000 points per request, which is a client convention rather
than a service point-count limit. Always check HTTP status: projector validation/transform failures
use **403** with `{ error, code }`, including invalid CRS, malformed points and failed transforms.
An empty candidate list from `GET /transform` is not a successful point transformation.

## Convertor: turn an uploaded vector file into GeoJSON

Upload or otherwise make the source file available first. Send a JSON object to `POST /convert`
relative to the convertor base; `/convert/` is also accepted. This endpoint does not accept multipart
uploads, file bytes or a destination-format selector. It returns the converted GeoJSON directly,
without an output URL or job ID.

| JSON field | Meaning |
| --- | --- |
| `url` | Required HTTP(S) download URL readable by the service |
| `fileType` | Optional extension, such as `dgn` or `.dgn`, for opaque URLs; 1-10 letters/digits, normalised to lowercase |
| `source_crs` | Optional non-empty source CRS override for the OGR conversion path |
| `target_crs` | Optional non-empty destination CRS for the OGR conversion path |
| `precision` | Optional integer coordinate precision; default 7, clamped to 1-15 |
| `simplify` | Optional positive numeric simplification tolerance, passed to OGR |
| `promote_to_multi` | Optional boolean; `true` promotes OGR geometries to multi-geometries |

```javascript
const geojson = await postServiceJson(convertorUrl, 'convert', {
  url: 'https://storage.example/survey.dxf',
  fileType: 'dxf',
  source_crs: 'EPSG:32631',
  target_crs: 'EPSG:4326',
  precision: 7,
}, getCurrentToken())
if (!Array.isArray(geojson.features)) {
  throw new Error('The conversion did not return a GeoJSON feature collection')
}
```

Without `fileType`, the extension is taken from the URL path, ignoring its query and fragment.
The download permits public HTTP(S) addresses, plus a specifically configured trusted storage
endpoint. Private/loopback URLs are otherwise rejected, and redirects are not followed. Supply the
final download URL. Downloads have a 60-second limit; input and converted output are each limited
to **256 MiB**. One conversion runs at a time per service process.

DWG uses a separate `dwgread` path and ignores the OGR options in the table. Reproject its resulting
geometry separately if needed. DGN conversion supports **v7 and earlier**, preserves `OGR_STYLE`,
and rejects DGN v8 with 422 / `DGN_V8_UNSUPPORTED`. Other formats use the installed OGR drivers.
Prefer a self-contained source file; companion-file uploads and archive packaging are not defined
by this HTTP contract.

Discover the deployment's drivers with authenticated `GET /formats`. It returns
`{ formats, total_count, description }`; each format has `short_name`, `long_name`, `extensions`,
`mime_type`, `help_topic`, `is_vector`, `supports_creation` and `supports_virtual_io`.
The list includes raster drivers as well as vector drivers. Filter by `is_vector`, then verify a
representative source file: a listed driver or creation capability does not promise that every
variant can be converted to GeoJSON. This is file conversion, separate from FieldTwin layout
`exportToGeoJSON` and point-cloud/CAD import jobs.

## Analysis: use an existing georeferenced raster

All four analysis POST endpoints require string **`rasterUrl`**, not `url`. Use a server-readable
georeferenced raster, preferably a Cloud Optimised GeoTIFF (COG) with HTTP range support. The
service reads band 1. Coordinates in a line, boundary or bounding box must already be in the
raster's own georeferenced coordinate space; analysis does not reproject them or apply FieldTwin
object offsets. Fetch/prepare the raster and convert coordinates before calling analysis.

NoData, non-finite values and values whose absolute magnitude exceeds `1e12` are filtered. Check
both HTTP status and the returned validity/status fields before presenting a measurement. Empty
coverage can return HTTP 200 with a non-`ok` result. Read failures or unsupported raster values
can return 422 with diagnostic data; HTTP success alone is not evidence of a usable measurement.

### Sample an elevation profile

```javascript
const profile = await postServiceJson(analysisUrl, 'profile', {
  rasterUrl: 'https://storage.example/elevation.tif',
  line: { x1: 500000, y1: 6650000, x2: 500100, y2: 6650000 },
}, getCurrentToken())
if (profile.diagnostics.status !== 'ok' || profile.validSampleCount === 0) {
  throw new Error(profile.diagnostics.errorMessage || 'No valid profile samples')
}
const validSamples = profile.samples.filter((sample) => sample.valid)
```

`POST /profile` returns `samples`, `sampleCount`, `validSampleCount`, `totalDistance` and
`diagnostics`. Each sample has `{ distance, elevation, x, y, valid }`. Sampling density comes from
the line's pixel extent, not a client-supplied step. Distances use planar raster-coordinate units;
elevations use raster-value units. Ignore the numeric elevation of an invalid sample. Diagnostics
include `status`, optional `errorMessage`, raster dimensions/bounds, line coordinates, pixel bounds
and invalid-sample counts. A line outside the raster or with only NoData has no usable profile.

### Measure a signed difference volume

Use a raster whose values are **height differences**. The endpoint integrates those values; it
does not subtract two surveys or accept a reference-height parameter. For FieldTwin's DEM
comparison, the difference raster is B minus A: positive means gain, negative means loss.

```javascript
const volume = await postServiceJson(analysisUrl, 'volume', {
  rasterUrl: 'https://storage.example/difference.tif',
  boundary: {
    outerRing: [
      { x: 500000, y: 6650000 }, { x: 500100, y: 6650000 },
      { x: 500100, y: 6650100 }, { x: 500000, y: 6650100 },
    ],
    innerRings: [],
  },
  includeMesh: false,
}, getCurrentToken())
```

`POST /volume` requires `boundary.outerRing`, an array of at least three `{ x, y }` points;
optional `innerRings` contains hole rings in the same format. These are objects, not GeoJSON tuples.
Each valid pixel whose centre is inside the boundary contributes its value times pixel area. Pixel
area is the absolute determinant of the raster geotransform. Boundary cells are selected by their
centres; partial-cell areas are not computed.

The response has `status`, optional `errorMessage`, `netVolume`, `positiveVolume`, `negativeVolume`,
`includedArea`, `validArea`, `cellArea`, and included/valid/NoData/non-finite/invalid/out-of-bounds
cell counts. **`negativeVolume` is signed**, and `netVolume = positiveVolume + negativeVolume`.
Units are horizontal-coordinate units squared times raster-value units; report cubic metres only
when both are metres. Geographic degrees do not produce a physical area or volume in metres.

Optional `includeMesh: true` returns `mesh.positions` (flat XYZ triples), `indices` (triangles),
`offset: [x, y, z]`, `cellCount` and `stride`. Add `offset` to each local position when placing the mesh.
`meshMaxCells` defaults to 12,000 and controls mesh sampling, not measurement precision or a hard
triangle limit. Delaunay triangles can bridge gaps and holes: use the numerical boundary-aware
metrics for measurement rather than measuring the display mesh.

### Inspect a heat map and read its pixels

`POST /height-difference-heat-map` accepts `rasterUrl` and optional `palette` (default `Turbo`),
`colorStops: [{ offset, color }]`, `clampEnabled` (default `true`), `min` and `max`. Stops are sorted
and offsets clamped to 0-1. A palette name is a label; custom colours require `colorStops`. When no
valid stops are supplied, the default Turbo stops are used.

It returns metadata: `status`, optional `errorMessage`, `rasterWidth`, `rasterHeight`, `geoTransform`,
`rasterBounds`, `valueRange: { min, max, mean }`, `suggestedDisplayRange: { min, max }`, `displayRange: { min, max }`,
`clampEnabled`, `palette: { name, colorStops }`, validity counts and optional NoData information.
The suggested display range is symmetric about zero, derived from the greatest absolute raster
value (or +/-1 for a zero range). It returns neither an image nor a new difference raster. A client
renders the heat map from this metadata and pixel tiles.

```javascript
const tile = await postServiceJson(analysisUrl, 'raster-tile', {
  rasterUrl: 'https://storage.example/difference.tif',
  bbox: { minX: 500000, minY: 6650000, maxX: 500100, maxY: 6650100 },
  width: 256,
  height: 256,
  format: 'float32',
}, getCurrentToken())
const binary = atob(tile.data)
const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
if (bytes.byteLength !== tile.width * tile.height * 4) {
  throw new Error('Unexpected raster tile size')
}
const view = new DataView(bytes.buffer)
const values = new Float32Array(tile.width * tile.height)
for (let index = 0; index < values.length; index += 1) {
  values[index] = view.getFloat32(index * 4, true)
}
```

`POST /raster-tile` accepts optional `bbox` as `{ minX, minY, maxX, maxY }` or
`[minX, minY, maxX, maxY]`; omit it for the full raster. Only `float32` is supported. Optional
positive integer `width` and `height` are clamped to 1-4,096 per dimension. Supplying one preserves
the source-window aspect ratio; omitting both limits the longest edge to 1,024 without upscaling.
The source window is clipped to the raster and resampled bilinearly.

The JSON response includes `format: 'float32'`, `encoding: 'base64-float32-le'`, `width`, `height`,
`data`, `sourceWindow`, `bbox`, `rasterBounds`, `rasterWidth`, `rasterHeight`, `geoTransform`,
`valueRange`, `status`, validity counts and NoData information. Decode `data` as row-major
little-endian float32 values and use the returned `bbox`, which covers the selected source pixels
and can differ from the requested box. The `geoTransform` describes the original raster, not the
resized tile. Mask NoData and non-finite values before rendering; counts refer to the returned tile.

## Result field details

| Field | Shape and interpretation |
| --- | --- |
| Volume counts | `includedCellCount`, `validCellCount`, `noDataCellCount`, `nonFiniteCellCount`, `invalidValueCellCount`, `outOfBoundsCellCount` |
| Heat-map counts | `validCellCount`, `noDataCellCount`, `nonFiniteCellCount`, `invalidValueCellCount`, `rasterIoErrorCount` |
| Tile counts | `validCellCount`, `noDataCellCount`, `nonFiniteCellCount`, `invalidValueCellCount` |
| Heat-map/tile NoData | `hasNoData` boolean; optional `noDataValue` number or null for a non-finite sentinel. Invalid tile pixels are replaced by NaN in the encoded data |
| `bbox`, `rasterBounds` | `{ minX, minY, maxX, maxY }` in raster coordinates |
| `sourceWindow` | `{ x, y, width, height }` in original-raster pixels |
| `geoTransform` | Six GDAL affine coefficients `[originX, pixelWidth, rowRotation, originY, columnRotation, pixelHeight]` |
| `mesh.offset` | `[x, y, z]` centroid subtracted from the XYZ positions |
| `colorStops[].color` | String passed through to the client; use colours your renderer supports, for example `#2369ff` |

## Errors and recovery

| Service / status | What to do |
| --- | --- |
| Projector 403 | Read `{ error, code }`; check CRS definitions, axis order, point shape and operation availability |
| Convertor 401; analysis 401/403 | Check the current bearer JWT and deployment verification configuration; wait for a valid refresh rather than retrying the same expired token |
| Convertor 400 | Correct JSON, `url` or `fileType`; check public/trusted download access |
| Convertor 413 | Reduce source size or converted output; each is limited to 256 MiB |
| Convertor 422 / `DGN_V8_UNSUPPORTED` | Export as DGN v7, DXF or another tested vector format |
| Convertor 503 / `CONVERTOR_BUSY` | Retry with bounded backoff; the response has `Retry-After: 1` |
| Convertor 500/502 | Check download access/expiry, redirects and conversion `details`; some source HTTP failures surface as 500 |
| Analysis 400 | Check `rasterUrl`, numeric geometry, bbox and tile format |
| Analysis 422 | Inspect `errorMessage` or profile diagnostics; replace or regenerate unreadable/invalid raster data |
| Analysis 500 | Check raster accessibility, georeferencing and band 1; the source URL may have expired |
| Analysis 200 with empty/non-`ok` coverage | Check geometry against raster extent and NoData; do not report an empty result as a successful measurement |

Prefer a new immutable raster URL when data changes. Analysis caches up to 32 datasets. An
authenticated `DELETE /cache` with JSON `{ "url": "https://storage.example/difference.tif" }`
evicts that URL and returns `{ "ok": true }`; this maintenance request uses `url`, unlike the POST
analysis requests. Use it from a backend or same-origin client: the current analysis CORS preflight
advertises GET/POST and does not advertise DELETE.
