# cesiumjs-copc

Main CesiumJS integration for
[CesiumJS COPC Runtime](https://github.com/yangseungsang/cesiumjs-copc-runtime).

It creates camera-driven COPC point-cloud primitives with Worker decoding, picking,
color and classification controls, eye-dome lighting, coordinate transformation, and
runtime diagnostics.

```ts
import { CopcPointCloud } from "cesiumjs-copc";

const cloud = await CopcPointCloud.fromUrl(url, { pointBudget: 2_000_000 });
viewer.scene.primitives.add(cloud);
```

See the [getting-started guide](https://github.com/yangseungsang/cesiumjs-copc-runtime/blob/main/docs/getting-started.md)
and [API reference](https://github.com/yangseungsang/cesiumjs-copc-runtime/blob/main/docs/api-reference.md).

Independent open-source project; not an official Cesium project. Original project
code is MIT licensed. See the bundled [third-party notices](THIRD_PARTY_NOTICES.md).
