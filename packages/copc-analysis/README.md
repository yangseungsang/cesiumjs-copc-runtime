# cesiumjs-copc-analysis

Streaming analysis utilities for
[CesiumJS COPC Runtime](https://github.com/yangseungsang/cesiumjs-copc-runtime).

Provides asynchronous source-CRS bounds queries, point-cloud statistics, and height
profiles without materializing a complete COPC dataset first.

```ts
import { computeStatistics, queryBounds } from "cesiumjs-copc-analysis";

const statistics = await computeStatistics(queryBounds(source, bounds));
```

Original project code is MIT licensed. See the bundled
[third-party notices](THIRD_PARTY_NOTICES.md).
