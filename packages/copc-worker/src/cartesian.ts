import type {
  CartesianPointPositions,
  CartesianTransformDefinition,
  PointCloudNode,
} from "cesiumjs-copc-core";
import proj4 from "proj4";

/** WGS 84 semi-major axis in metres. */
const WGS84_A = 6_378_137;
/** WGS 84 first eccentricity squared. */
const WGS84_E2 = 6.69437999014e-3;
const RADIANS = Math.PI / 180;

/**
 * Projects source positions into ECEF and packs them relative to a per-node origin.
 *
 * The origin exists to make `Float32` viable. Absolute ECEF coordinates are around
 * 6.4e6 metres, where a `Float32` step is roughly half a metre, so uploading absolute
 * positions to the GPU would visibly quantize the cloud. Subtracting a node-local
 * origin first brings the values down to the half-extent of the node, so the
 * remaining `Float32` step scales with node size rather than with earth radius. For a
 * node spanning tens of metres that step is well below a millimetre; a node spanning
 * kilometres is correspondingly coarser. The renderer adds `origin` back through the
 * model matrix.
 *
 * The origin is the centre of the node bounding box rather than its first point,
 * because a corner origin would leave one side of a large node near the precision
 * limit while the opposite side sat at zero.
 *
 * Positions are accumulated in a `Float64Array` first. Computing the bounding box
 * requires a full pass anyway, and rounding before the origin is known would bake in
 * the very error this function avoids.
 *
 * @throws If the transform requests geoid correction. That path needs a geoid grid
 * the worker does not carry, so the main thread handles it instead.
 */
export function createCartesianPositions(
  node: PointCloudNode,
  definition: CartesianTransformDefinition,
): CartesianPointPositions {
  if (definition.geoidModel !== undefined) {
    throw new Error("Worker Cartesian packing does not support geoid correction");
  }
  const forward = proj4(definition.horizontalCrs, "EPSG:4326").forward;
  const absolute = new Float64Array(node.pointCount * 3);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < node.pointCount; index += 1) {
    const [longitude, latitude] = forward([
      node.positions[index * 3]!,
      node.positions[index * 3 + 1]!,
    ]);
    const sourceHeight = node.positions[index * 3 + 2]! * definition.verticalUnitToMeters;
    const height = sourceHeight + definition.verticalOffsetMeters;
    const [x, y, z] = geodeticToEcef(longitude, latitude, height);
    absolute[index * 3] = x;
    absolute[index * 3 + 1] = y;
    absolute[index * 3 + 2] = z;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const origin =
    node.pointCount === 0
      ? ([0, 0, 0] as const)
      : ([(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as const);
  const positions = new Float32Array(absolute.length);
  for (let index = 0; index < absolute.length; index += 3) {
    positions[index] = absolute[index]! - origin[0];
    positions[index + 1] = absolute[index + 1]! - origin[1];
    positions[index + 2] = absolute[index + 2]! - origin[2];
  }
  return { origin, positions };
}

/**
 * Converts geodetic coordinates to earth-centred earth-fixed metres on the WGS 84
 * ellipsoid.
 *
 * Inlined rather than taken from Cesium so that this package stays usable in a plain
 * worker without pulling the viewer in as a dependency.
 *
 * @param longitude Degrees east.
 * @param latitude Degrees north.
 * @param height Metres above the ellipsoid, not above the geoid.
 */
function geodeticToEcef(
  longitude: number,
  latitude: number,
  height: number,
): readonly [number, number, number] {
  const longitudeRadians = longitude * RADIANS;
  const latitudeRadians = latitude * RADIANS;
  const sinLatitude = Math.sin(latitudeRadians);
  const cosLatitude = Math.cos(latitudeRadians);
  const radius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLatitude * sinLatitude);
  return [
    (radius + height) * cosLatitude * Math.cos(longitudeRadians),
    (radius + height) * cosLatitude * Math.sin(longitudeRadians),
    (radius * (1 - WGS84_E2) + height) * sinLatitude,
  ];
}
