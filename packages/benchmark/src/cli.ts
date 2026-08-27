#!/usr/bin/env node

import { benchmarkCopc } from "./benchmark.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm run benchmark -- <COPC URL> [target points]");
  process.exitCode = 1;
} else {
  const targetPoints = process.argv[3] ? Number(process.argv[3]) : undefined;
  try {
    const result = await benchmarkCopc(url, {
      ...(targetPoints === undefined ? {} : { targetPoints }),
    });
    console.table({
      "File size": formatBytes(result.fileBytes ?? 0),
      "Dataset points": result.totalPoints.toLocaleString(),
      "Metadata load": formatMilliseconds(result.metadataMilliseconds),
      "Hierarchy traversal": formatMilliseconds(result.hierarchyMilliseconds),
      "Time to first point": formatMilliseconds(result.timeToFirstPointMilliseconds),
      "Decoded nodes": result.decodedNodes.toLocaleString(),
      "Decoded points": result.decodedPoints.toLocaleString(),
      "Decode throughput": `${Math.round(result.pointsPerSecond).toLocaleString()} points/s`,
      "Range requests": result.networkRequests.toLocaleString(),
      "Logical ranges": result.logicalRangeRequests.toLocaleString(),
      "Coalesced ranges": result.coalescedRangeRequests.toLocaleString(),
      "Range cache hits": result.rangeCacheHits.toLocaleString(),
      "Persistent hits": result.persistentRangeCacheHits.toLocaleString(),
      "Network bytes": formatBytes(result.networkBytes),
      "Compressed cache": formatBytes(result.compressedCacheBytes),
      "Heap used": formatBytes(result.heapUsedBytes),
      RSS: formatBytes(result.residentSetBytes),
      "Deepest node": result.deepestNode,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}

function formatMilliseconds(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
