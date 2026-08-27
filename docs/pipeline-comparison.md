# Direct COPC streaming compared with a 3D Tiles pipeline

This project claims that reading COPC directly is better than converting it to 3D
Tiles first. This document states what that claim is worth in numbers, and it is
explicit about which numbers were measured and which were not.

Every row below is tagged:

- **Measured** means this repository produced the number and the command is published.
- **Structural** means it follows from how the two pipelines are defined, so no
  measurement changes it.
- **Configuration dependent** means it holds for common setups but can differ with the
  converter, the tile format, or the operator's retention policy. The condition is
  stated in the relevant section.
- **Not measured** means we did not run it. No estimate is offered.

No row measures an actual 3D Tiles conversion. That is the central limitation of this
document, and the last section says what would fix it.

The reference dataset throughout is the public Autzen Stadium COPC used by
[the benchmark baseline](benchmarks.md): 10,653,336 points in 77.4 MiB.

## Summary

| Axis                                | 3D Tiles pipeline                     | This project        | Basis                   |
| ----------------------------------- | ------------------------------------- | ------------------- | ----------------------- |
| Work before the first view          | Convert the whole dataset             | None                | Structural              |
| Duration of that conversion         | Not measured                          | 0 seconds           | Not measured            |
| Cost when the source is updated     | Reconvert the affected dataset        | None                | Structural              |
| Bytes to reach the benchmark view   | Not measured                          | 3,150,366 (3.9%)    | Measured                |
| Time to first point                 | Not measured                          | 2,477 ms            | Measured                |
| Copies of the data to store         | Usually 2 (source plus tileset)       | 1 (source)          | Configuration dependent |
| Source attributes kept for analysis | Those selected at conversion          | All LAS dimensions  | Configuration dependent |
| Coordinate precision for analysis   | Depends on tile format and encoding   | Source `Float64`    | Configuration dependent |

## What conversion costs, and why we do not put a number on it

The structural claim is about shape, not magnitude. Any converter that produces 3D
Tiles from this file has to read all 10,653,336 points at least once, because it
cannot tile points it has not read. So the conversion path pays a cost proportional to
the entire dataset before anyone sees a single point, while the streaming path pays a
cost proportional to the current view. That much holds regardless of which converter
runs.

How long that conversion actually takes is a different question, and this repository
cannot answer it. An earlier draft of this document extrapolated the benchmark's
55,875 points/s to the full file and called the result a floor. That was wrong twice
over, and the reasoning is recorded here so the mistake is not repeated:

1. `pointsPerSecond` in the benchmark is not decode throughput. It is
   `decodedPoints / decodeMilliseconds`, where the interval covers fetching as well as
   decoding and runs four node loads concurrently. It is an end-to-end streaming rate
   for this runtime, not a measure of how fast points can be decoded.
2. Even a correct decode rate would not give a floor. A production converter runs in
   parallel across cores and could finish faster than any figure derived from this
   measurement, and a value something can beat is not a lower bound.

Quantifying the conversion side requires running a real converter. Until then this
document states the shape of the difference and leaves the magnitude blank.

## Storage

A 3D Tiles pipeline emits a tileset, which is a second representation of the same
points. In the common case both the tileset and the source exist, because the source
is the archival copy and the input to any future reconversion, so the operator stores
the data twice.

This is a policy outcome rather than a law. An operator who treats the tileset as the
only artifact and discards the source stores one copy, accepting that the original
measurements are gone. The claim in the summary table is therefore tagged as
configuration dependent: it describes the usual archival setup, not every possible
one.

Tileset size is not reported because it depends on the converter, the selected
attributes, the encoding, and the geometric error targets. We did not measure it and
will not guess.

## Why the view cost scales with the view, not the dataset

The benchmark reached its target by transferring 3,150,366 bytes, which is 3.9% of the
77.4 MiB file, using 8 physical range requests coalesced from 11 logical ranges.
Nothing else was downloaded.

This is a property of COPC itself rather than of this implementation. The file is
already an octree addressed by byte ranges, so the client can request exactly the
hierarchy pages and node chunks the camera needs. A 3D Tiles pipeline reaches a
similar per-view transfer profile after conversion, which is precisely the cost this
project removes.

## What the conversion path gives up

Converting to 3D Tiles fixes at conversion time two choices that this project leaves
open at query time. Both depend on the converter and format in use, so neither is an
absolute property of 3D Tiles.

**Attributes.** The converter writes the dimensions it was configured to write. A
dimension that was not selected is unavailable in the viewer, and recovering it means
reconverting. Formats and metadata extensions differ in how much they can carry, so
the practical limit is the conversion configuration rather than the specification.
This project reads dimensions from the source node on demand, so `Intensity`,
`Classification`, GPS time, and the rest stay reachable, including for
`cesiumjs-copc-analysis` queries that never render.

**Precision.** Tile formats commonly quantize positions to keep tiles small, and how
much precision survives depends on the encoding chosen at conversion. This project
keeps source `Float64` coordinates for picking and analysis and derives node-relative
ECEF `Float32` positions only for the GPU buffers, so rendering precision and analysis
precision are decoupled by construction rather than by configuration.

## Where the conversion path is still better

Stating the trade honestly matters more than winning every row.

- A prepared tileset needs no range support from the server. This project requires
  HTTP `206 Partial Content` and CORS, and fails on servers that provide neither.
- A prepared tileset can be tuned offline for a known camera path. Direct streaming
  decides the level of detail at runtime, so a cold view pays decode cost that a warm
  tileset does not.
- 3D Tiles is a published OGC standard with wide client support. This runtime targets
  CesiumJS specifically.
- Conversion happens once and is amortized across every future viewer session. For a
  dataset that is served constantly and never updated, that amortization is real.

The direct path wins when data changes, when storage is expensive, when the full
attribute set matters, or when the operational cost of a conversion step is the actual
problem. It loses when none of those hold.

## Reproducing the measured rows

```sh
npm ci
npm run build
npm run benchmark -- https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz 250000
```

Read [Benchmarks](benchmarks.md) for the hardware, the run protocol, and the
three-run ranges before comparing these numbers with another environment.

## What would make this document stronger

The honest gap is that no row measures an actual 3D Tiles conversion. Closing it means
running a real converter on the same file, on the same machine, and publishing the
wall-clock time, the output size, and the per-view transfer. That work is tracked in
[Issues](https://github.com/yangseungsang/cesiumjs-copc-runtime/issues) rather than
approximated here.
