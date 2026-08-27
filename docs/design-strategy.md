# CesiumJS 기반 COPC 가시화 라이브러리 개발 전략

> 구현 현황 기준일: **2026-08-27**
> 이 문서는 초기 설계 제안과 현재 구현 상태를 함께 관리한다. “권장”으로 남아 있는
> 항목과 이미 구현된 항목을 구분해 다음 개발 우선순위를 판단하는 기준으로 사용한다.

## 1. 프로젝트 방향

COPC(Cloud Optimized Point Cloud)를 CesiumJS에서 직접 가시화하려는 방향은 기술적으로 충분히 타당하다.

COPC의 핵심 장점은 단순히 LAZ 데이터를 웹에서 읽을 수 있다는 점이 아니라, **하나의 원본 파일 자체가 공간 인덱스이자 스트리밍 단위로 동작한다는 점**이다.

특히 다음 특성이 중요하다.

- 내부 Octree 기반 구조
- LoD(Level of Detail) 계층화
- HTTP Range Request 기반 부분 데이터 접근
- 특정 영역과 특정 해상도에 필요한 데이터만 요청 가능
- 원본 보관용 데이터와 웹 시각화용 데이터를 별도로 생성하지 않아도 됨

따라서 프로젝트의 목표를 단순히

> COPC를 CesiumJS에서 보여주는 Viewer

로 정의하기보다는,

> **COPC Native Streaming Runtime for CesiumJS**

로 정의하는 것이 더 적절하다.

### 현재 상태

이 방향은 현재 monorepo의 실제 구조로 구현됐다. `CopcSource`와 Cesium Renderer가
분리되어 있으며, 동일한 source 좌표·attribute를 Cesium Picking과 분석 패키지가
공유한다. 현재 구현은 “Viewer”가 아니라 다음 기능을 포함하는 Runtime MVP다.

- COPC Range Streaming과 hierarchy page 지연 로딩
- additive LoD와 기기별 Point Budget
- Worker LAZ decode·CRS 투영·상대 ECEF 렌더 좌표 생성
- Cesium Primitive, Picking, EDL, GPS Time 연동
- IndexedDB Range Cache와 streaming 분석 API

---

## 2. 목표 아키텍처

```text
COPC File
   ↓ HTTP Range Request
COPC Reader
   ↓
Spatial / LOD Scheduler
   ↓
Decode Worker Pool
   ↓
Point Cloud Runtime
   ↓
CesiumJS Renderer
```

사용자 API는 TIFFImageryProvider처럼 단순해야 한다.

```ts
const pointCloud = await CopcPointCloud.fromUrl(
  "https://example.com/data.copc.laz",
  {
    maximumScreenSpaceError: 2,
    pointBudget: 5_000_000,
    colorBy: "classification",
  }
);

viewer.scene.primitives.add(pointCloud);
```

또는 다음과 같은 형태도 가능하다.

```ts
const layer = await CopcLayer.fromUrl(url);

viewer.scene.primitives.add(layer);
viewer.zoomTo(layer);
```

사용자는 내부적으로 사용되는 COPC hierarchy, LAZ chunk, Range Request, Worker 등을 몰라도 되어야 한다.

---

## 3. 전체 레이어 구조

```text
┌───────────────────────────────────┐
│        Cesium Integration         │
│ CopcPointCloud / CopcLayer        │
├───────────────────────────────────┤
│       Rendering Runtime           │
│ GPU Buffer / Shader / Picking     │
├───────────────────────────────────┤
│         LOD Scheduler             │
│ SSE / Point Budget / Traversal    │
├───────────────────────────────────┤
│          Node Cache               │
│ CPU / GPU / Compressed Chunk      │
├───────────────────────────────────┤
│       Decode Worker Pool          │
│ LAZ → TypedArray                  │
├───────────────────────────────────┤
│          COPC IO Layer            │
│ Range Request / Hierarchy / CRS   │
└───────────────────────────────────┘
```

COPC Reader와 Cesium Renderer는 가능한 한 강하게 분리하는 것이 좋다.

장기적으로는 동일한 Runtime 위에 다음 Source를 연결할 수 있기 때문이다.

```text
CopcSource
EptSource
LasSource
3DTilesPointSource
```

---

## 4. COPC 데이터 로딩 계층

기존 TypeScript COPC 라이브러리인 `copc.js` 등을 활용하는 것이 좋다.

COPC parser를 처음부터 다시 구현하는 것은 핵심 차별화 요소가 아니다.

대신 다음과 같은 추상화 계층을 만드는 것이 좋다.

```ts
interface PointCloudSource {
  metadata(): Promise<PointCloudMetadata>;

  getHierarchy(
    node: NodeId
  ): Promise<HierarchyEntry[]>;

  loadNode(
    node: NodeId,
    dimensions: string[]
  ): Promise<PointCloudNode>;
}
```

그리고 COPC 구현체를 만든다.

```ts
class CopcSource implements PointCloudSource {
  // ...
}
```

이렇게 하면 데이터 포맷과 렌더링 엔진을 분리할 수 있다.

---

## 5. 핵심은 COPC 파싱보다 LOD Scheduler

실제 성능 경쟁력은 COPC parsing보다 LOD Scheduler에서 크게 갈린다.

COPC/EPT Node는 raster tile처럼 부모를 자식으로 교체하는 구조가 아니다. Point는
깊이 사이에서 중복되지 않으므로 렌더 집합은 다음처럼 **additive**여야 한다.

```text
Rendered Points = Level 0 + visible Level 1 + ... + selected Level N
```

현재 Runtime은 이 누적 규칙으로 Point Budget을 계산하고, child cohort가 충분히
준비될 때까지 상위 Node를 계속 표시해 작은 고밀도 patch가 먼저 튀어나오는 현상을
줄인다.

COPC 내부 Octree를 그대로 활용하여 다음 구조로 처리한다.

```text
Camera
  ↓
Frustum Intersection
  ↓
Visible COPC Nodes
  ↓
Screen Space Error
  ↓
Node Priority
  ↓
Range Request
```

개념적으로는 다음과 같다.

```ts
screenError =
  projectedSpacing(node.spacing, cameraDistance);
```

```text
SSE > threshold
    ↓
children 요청

SSE <= threshold
    ↓
현재 node 유지
```

---

## 6. Adaptive Point Budget

SSE만 사용하는 것보다 전체 Point Budget을 함께 사용하는 것이 좋다.

```ts
pointBudget: 5_000_000
```

매 프레임 다음과 같은 구조로 동작한다.

```text
Visible Nodes
      ↓
Priority 계산
      ↓
Point Budget까지 선택
```

예를 들어:

```text
priority =
  screenSize
  × importance
  / distance
```

GPU와 CPU 성능 범위 내에서 전체 Point 수를 안정적으로 유지하는 것이 목표다.

현재는 `navigator.deviceMemory`, `hardwareConcurrency`, mobile 여부,
`devicePixelRatio`를 이용해 low/medium/high 등급을 선택한다. 신호가 없는 환경은
medium을 사용하며 Point·Memory·Worker·Request 예산은 모든 등급에서 재정의할 수 있다.

---

## 7. HTTP Range Request 최적화

단순 구현에서는 다음과 같이 여러 요청이 발생할 수 있다.

```text
node A → request
node B → request
node C → request
node D → request
```

하지만 HTTP 요청 overhead가 커질 수 있다.

따라서 Range Request Scheduler가 필요하다.

### Range Coalescing

```text
[1200-1500]
[1510-1700]
[1720-1900]

↓ merge

Range:
1200-1900
```

인접한 Range Request를 하나로 합치면 네트워크 효율을 높일 수 있다.

추가로 고려할 항목은 다음과 같다.

- Request Priority
- Request Cancellation
- Concurrent Request 제한
- Camera 이동 시 obsolete request 제거
- CDN cache 친화성

---

## 8. Worker 기반 디코딩

메인 스레드에서는 카메라와 Cesium 렌더링을 처리하고 LAZ decoding은 Worker로 분리하는 것이 좋다.

```text
Main Thread

Camera / Scheduler
      │
      ▼
Worker Pool
 ├─ Worker 1
 ├─ Worker 2
 ├─ Worker 3
 └─ Worker 4

LAZ Decode
Attribute Extraction
Coordinate Conversion
```

Worker에서 Main Thread로 전달할 때는 Transferable ArrayBuffer를 적극 활용한다.

```ts
postMessage(buffer, [buffer]);
```

현재 구현은 여기에 렌더 전용 데이터 생성까지 포함한다.

```text
LAZ Chunk
  → source CRS Float64 + LAS Attributes
  → CRS Projection
  → ECEF Float64
  → Node Origin 기준 상대 Float32
  → Transferable로 Main Thread 전달
```

source CRS `Float64`는 Picking·필터·분석을 위해 보존하고, 상대 ECEF `Float32`는
Cesium GPU upload에만 사용한다. 따라서 Main Thread의 Point별 `proj4` 및
`Cartesian3.fromDegrees()` 호출을 일반 경로에서 제거했다. 명시적 EGM96 geoid
보정은 정확성과 bundle 중복을 위해 기존 fallback 경로를 사용한다.

---

## 9. SharedArrayBuffer

고급 최적화 단계에서는 SharedArrayBuffer를 검토할 수 있다.

환경이 COOP / COEP 조건을 만족한다면 다음과 같은 Memory Pool 구조가 가능하다.

```text
SharedArrayBuffer
```

이를 활용하면 Worker와 Main Thread 사이 데이터 복사를 줄일 수 있다.

대규모 COPC 환경에서는 유의미한 최적화가 될 수 있다.

---

## 10. Cesium 렌더링 전략

크게 두 가지 접근이 있다.

### 방식 A — Runtime 3D Tiles 생성

```text
COPC
↓
Dynamic 3D Tiles
↓
Cesium3DTileset
```

장점:

- 기존 Cesium Tile Traversal 활용
- Cesium 3D Tiles styling 생태계 활용
- CesiumJS 통합이 상대적으로 쉬움

단점:

```text
COPC
→ Decode
→ 3D Tiles Packaging
→ Cesium Decode
→ GPU
```

중간 변환 계층이 생길 수 있다.

---

## 11. 방식 B — Native Cesium Primitive

장기적으로는 다음 구조를 권장한다.

```text
COPC
↓
TypedArray
↓
GPU Buffer
↓
Cesium Primitive
```

즉 COPC 데이터를 가능한 한 직접 GPU로 보내는 방식이다.

특히 CesiumJS의 저수준 Primitive API 또는 대규모 geometry 처리용 Buffer 계열 API를 검토할 수 있다.

장점:

- 중간 3D Tiles 변환 불필요
- 메모리 사용 제어 용이
- GPU Buffer 직접 관리
- COPC 구조와 Cesium 렌더링을 직접 연결 가능

---

## 12. Hybrid 구조 권장

Native와 3D Tiles 방식을 모두 지원하는 것이 가장 확장성이 좋다.

```text
                   COPC
                    │
              CopcRuntime
                    │
          ┌─────────┴─────────┐
          │                   │
Native Renderer         3D Tiles Adapter
          │                   │
Cesium Primitive      Cesium3DTileset
```

사용자는 다음처럼 선택할 수 있다.

```ts
mode: "native"
```

또는

```ts
mode: "3d-tiles"
```

기본 모드는 Native로 하고, 호환성이나 Cesium 3D Tiles 기능이 필요한 경우 Adapter를 제공하는 방식이 좋다.

---

## 13. 좌표계 처리

좌표계는 핵심 기능으로 설계해야 한다.

COPC/LAS 데이터는 다양한 좌표계를 사용할 수 있다.

```text
EPSG:5186
EPSG:32652
EPSG:269xx
Local Coordinate System
```

Cesium은 기본적으로 WGS84 / ECEF 기반이다.

따라서 다음 변환 구조가 적절하다.

```text
COPC Coordinate
      ↓
CRS Transform
      ↓
Local ENU
      ↓
Cesium modelMatrix
```

모든 Point에 대해 개별적으로 `Cartesian3.fromDegrees()`를 호출하는 방식은 피하는 것이 좋다.

현재 구현은 다음을 지원한다.

- WKT1/WKT2 compound CRS의 수평 성분 추출
- 수평·수직 단위 독립 처리와 비복합 projected CRS의 Z 단위 추론
- 명시적 EGM96 geoid-to-ellipsoid 보정과 수직 offset
- `EPSG:5173`–`5188`, `EPSG:2096`–`2098`, `EPSG:4737` 등록
- Bessel 기반 국내 WKT가 EPSG code만 밝히고 datum shift를 누락한 경우 curated 정의 사용

토큰 기반의 완전한 WKT parser와 `BOUNDCRS`의 모든 변형 처리는 후속 강화 대상이다.

---

## 14. Local Coordinate 기반 GPU 저장

ECEF 값은 매우 큰 값을 가지므로 GPU Float Precision 문제가 발생할 수 있다.

예:

```text
X = -3045231.238
Y = 4041821.728
Z = 3862031.412
```

따라서 Node 중심 좌표를 기준으로 Local Coordinate로 변환하는 것이 좋다.

```text
nodeOrigin = ECEF(center)

pointPosition =
pointECEF - nodeOrigin
```

그리고 Cesium `modelMatrix`를 사용한다.

```ts
primitive.modelMatrix =
  Matrix4.fromTranslation(nodeOrigin);
```

이 방식은 Precision과 메모리 양쪽에서 유리하다.

이 구조는 현재 Worker와 `CopcPointCloud`에 구현됐다. Worker가 Node Point의 ECEF
범위를 계산해 중앙 원점을 정하고 상대 `Float32Array`를 생성한다. Renderer는
원점을 `modelMatrix` translation으로 사용하며, 필터가 Point를 compact할 때도 같은
원점의 상대 좌표를 함께 compact한다.

---

## 15. Attribute 시스템

Point 위치와 RGB만 지원하면 활용도가 제한된다.

LAS/COPC의 주요 Attribute를 가능한 한 폭넓게 지원하는 것이 좋다.

```text
RGB
Intensity
Classification
ReturnNumber
NumberOfReturns
GpsTime
ScanAngle
PointSourceId
UserData
```

API 예:

```ts
layer.style = {
  color: {
    attribute: "Classification",
    mapping: {
      2: "#795548",
      5: "#4CAF50",
      6: "#F44336"
    }
  }
};
```

Intensity 기반 표현:

```ts
layer.style = {
  color: {
    attribute: "Intensity",
    ramp: "viridis",
    min: 0,
    max: 65535
  }
};
```

---

## 16. Cesium 스타일 문법과의 친화성

Cesium 사용자는 `Cesium3DTileStyle`에 익숙할 가능성이 높다.

따라서 COPC Style API도 유사한 Expression 시스템을 제공하면 좋다.

```ts
copc.style = new CopcStyle({
  color: `
    Classification === 2
      ? color("brown")
      : color("white")
  `
});
```

완전 호환까지 갈 필요는 없지만 Cesium Style Expression과 비슷한 사용자 경험을 제공할 수 있다.

---

## 17. GPU Filtering

Filtering은 CPU보다는 Shader에서 처리하는 것이 좋다.

예:

```ts
layer.filter = `
  Classification == 2 &&
  Intensity > 500
`;
```

GPU에서는 다음과 같이 처리할 수 있다.

```glsl
if (!condition) {
    discard;
}
```

이를 통해 다음 필터를 실시간으로 변경할 수 있다.

- Ground only
- Vegetation only
- Building only
- First Return
- Last Return
- Intensity threshold

---

## 18. Picking

단순히 Point 위치만 반환하지 말고 LAS Attribute까지 반환하는 것이 좋다.

```ts
const point = await layer.pick(windowPosition);
```

결과 예:

```ts
{
  position,
  longitude,
  latitude,
  height,

  attributes: {
    classification: 5,
    intensity: 823,
    gpsTime: 123456,
    returnNumber: 1
  },

  node: "7-63-42-12"
}
```

이 기능은 Viewer를 GIS/LiDAR Application Framework로 확장하는 중요한 기능이다.

---

## 19. Spatial Query

COPC의 공간 인덱스를 활용하면 Viewer 이상의 기능을 만들 수 있다.

```ts
const result = await copc.query({
  polygon,
  dimensions: [
    "X",
    "Y",
    "Z",
    "Classification"
  ]
});
```

이 기능을 제공하면 프로젝트의 정체성이 다음과 같이 바뀐다.

```text
COPC Viewer
```

에서

```text
COPC Spatial Query Engine
```

으로 확장된다.

---

## 20. Height Profile

사용자가 Line 또는 Corridor를 그리면 해당 영역의 Point만 조회한다.

```text
Polyline
↓
COPC Spatial Query
↓
Intersecting Nodes
↓
Required Points Download
↓
Height Profile
```

전체 COPC를 다운로드할 필요가 없다는 점이 중요하다.

---

## 21. 통계 분석

Polygon 영역에 대한 Point Cloud 통계를 제공할 수 있다.

```ts
await layer.computeStatistics({
  area: polygon
});
```

예:

```text
Points: 18,392,134

Classification
2 Ground       37%
5 Vegetation   42%
6 Building     15%

Height
Min
Max
Mean
P95
```

브라우저에서 서버 없이 일부 분석을 수행할 수 있다면 강한 차별화 요소가 된다.

---

## 22. GPS Time과 Cesium Clock

LAS/COPC에 GPS Time이 포함된 경우 Cesium Clock과 연결할 수 있다.

```text
Cesium Clock
      ↓
GPS Time Filter
      ↓
LiDAR Acquisition Animation
```

API 예:

```ts
layer.time = {
  start,
  end
};
```

또는:

```ts
layer.bindClock(viewer.clock);
```

Potree Viewer와 차별화하기 좋은 Cesium 특화 기능이다.

---

## 23. Cache 구조

3단 Cache 구조를 권장한다.

```text
L1
GPU Node Cache

L2
Decoded TypedArray Cache

L3
Compressed COPC Range Cache
```

Memory Pressure 발생 시:

```text
GPU Eviction
↓
Decoded 데이터 유지

추가 메모리 부족
↓
Decoded 제거

다시 필요
↓
Compressed Range 재사용
```

---

## 24. IndexedDB Cache

COPC 파일의 Range 데이터를 IndexedDB에 캐시할 수 있다.

Key 예:

```text
URL + Byte Range
```

동작:

```text
First Visit
HTTP Range Request

Second Visit
IndexedDB Range Cache
```

반복 접속이 많은 GIS 환경에서 효과적이다.

---

## 25. CDN 및 HTTP 환경 진단

COPC 웹 서비스를 위해 다음 HTTP 조건이 중요하다.

```text
HTTP Range Request
Accept-Ranges: bytes
CORS
Content-Length
Cache-Control
```

라이브러리에서 다음과 같은 진단 API를 제공하면 좋다.

```ts
await CopcSource.validateUrl(url);
```

출력 예:

```text
✓ COPC valid
✓ HTTP Range supported
✓ CORS enabled
✓ Content-Length available
✓ CRS detected EPSG:32652

⚠ Cache-Control missing
```

이런 기능은 Developer Experience 측면에서 좋은 차별점이 된다.

---

## 26. Debug / Diagnostic 도구

다음과 같은 Runtime Debug Overlay를 제공하는 것을 권장한다.

```text
Points Visible      4.2 M
Nodes Visible          47
Nodes Loading           8
Network             12 MB
Decode              21 ms
GPU Memory          310 MB
FPS                     58
```

Octree Debug View도 유용하다.

```text
COPC
├ Level 0
│ └ Node
├ Level 1
│ ├ Node
│ └ Node
└ Level 2
```

오픈소스 라이브러리에서 이런 개발 도구는 채택률에 큰 영향을 줄 수 있다.

---

## 27. 경쟁 제품 대비 차별화

| 영역 | 일반 COPC Viewer | 목표 프로젝트 |
|---|---:|---:|
| COPC 직접 읽기 | O | O |
| Octree LOD | O | O |
| Cesium Globe | 일부 | **O** |
| Runtime 3D Tiles | 일부 | O |
| Native GPU Rendering | 일부 | **O** |
| Point Budget | O | **Adaptive** |
| Range Batching | 제한적 | **O** |
| Worker Decoding | O | **Worker Pool** |
| GPU Filtering | 일부 | **O** |
| CRS | 제한적 | **강력 지원** |
| Picking | O | **LAS Attribute 포함** |
| Spatial Query | 제한적 | **O** |
| Height Profile | 일부 | **O** |
| GPS Time | 드묾 | **Cesium Clock 연동** |
| IndexedDB Cache | 드묾 | **O** |
| Diagnostics | 드묾 | **O** |

---

## 28. Monorepo 구조 권장

```text
packages/

  copc-core/
    CopcSource
    hierarchy
    range-reader
    decoder

  copc-runtime/
    traversal
    scheduler
    cache
    point-budget

  cesium-copc/
    CopcPointCloud
    CopcPrimitive
    CopcStyle

  cesium-copc-worker/
    laz-worker
    transform-worker

  cesium-copc-analysis/
    profile
    query
    statistics

  demo/
```

핵심 Runtime과 Cesium 연동 코드를 분리하는 것이 중요하다.

---

## 29. Public API

초기에는 Public API를 최대한 작게 유지하는 것이 좋다.

```ts
CopcPointCloud.fromUrl()

CopcPointCloud.style

CopcPointCloud.pointBudget

CopcPointCloud.maximumScreenSpaceError

CopcPointCloud.pick()

CopcPointCloud.destroy()
```

Options 예:

```ts
interface CopcPointCloudOptions {
  url: string;

  pointBudget?: number;

  maximumScreenSpaceError?: number;

  workerCount?: number;

  cacheSize?: number;

  dimensions?: string[];

  style?: CopcStyle;
}
```

---

# 30. 개발 단계

현재 단계 표기:

- **완료**: 핵심 Runtime에 구현되고 자동 테스트가 존재
- **부분 완료**: 기본 기능은 구현됐으나 API 또는 통합 검증 보강 필요
- **예정**: 아직 제품 코드에 포함되지 않음

## Phase 1 — Proof of Concept

상태: **완료**

목표:

```text
COPC → CesiumJS
```

기능:

- COPC Metadata
- Hierarchy
- HTTP Range Request
- LAZ Decode
- RGB
- Cesium Rendering

이 단계에서는 성능보다 전체 데이터 Flow 검증이 중요하다.

---

## Phase 2 — Streaming

상태: **완료**

추가 기능:

- Camera 기반 Traversal
- Frustum Culling
- SSE
- Point Budget
- Node Eviction
- Request Priority

이 단계부터 실제 Viewer의 형태를 갖춘다.

---

## Phase 3 — Performance

상태: **완료(브라우저 장시간 benchmark 보강 필요)**

추가 기능:

- Worker Pool
- Range Merging
- GPU Cache
- Decoded Cache
- Local Coordinate
- Request Cancellation
- Memory Budget

이 단계가 실제 제품 경쟁력을 만드는 구간이다.

---

## Phase 4 — Visualization

상태: **부분 완료**

지원 Attribute:

```text
RGB
Intensity
Classification
Elevation
Return Number
GPS Time
```

추가 표현:

- Point Size
- Opacity
- Elevation Ramp
- Classification Style
- EDL 유사 렌더링

---

## Phase 5 — Cesium Native Integration

상태: **부분 완료**

추가 기능:

- Picking
- Globe Interaction
- Terrain
- Clipping
- Cesium Clock
- Camera
- Style Expression
- Scene Interaction

---

## Phase 6 — Analysis

상태: **부분 완료**

추가 기능:

- Polygon Query
- Height Profile
- Statistics
- Measurement
- Classification 분석
- Time 기반 분석

---

# 31. Benchmark를 핵심 산출물로 만들기

차별화를 주장하는 것보다 실제 Benchmark를 공개하는 것이 중요하다.

측정 항목:

```text
Initial Metadata Load

Time To First Point

Time To First Meaningful View

Network Bytes

Decoded Points / sec

FPS

GPU Memory

CPU Memory
```

예:

```text
Dataset: 1.9 GB COPC

Initial View

Download          12.4 MB
Time-to-first      180 ms
Visible Points      3.2 M
FPS                    60
GPU Memory          220 MB
```

비교 대상:

- Potree COPC Viewer
- Eptium Viewer
- 기존 Runtime 3D Tiles 방식
- Native COPC Renderer

### 현재 측정 기준선

2026-08-27 Apple M1 Pro(8 Core, 16 GiB), Node.js 22.17.0 환경에서 Autzen Stadium
원격 COPC를 250,000 Point 목표로 cold-process 3회 측정한 중앙값이다.

```text
Dataset             10,653,336 Points / 77.4 MiB
Decoded Nodes       8
Decoded Points      269,241
Network             3.0 MiB
Physical Requests   8
Logical Ranges      11
Coalesced Ranges    3
Metadata Load       약 1,376 ms
Time to First Point 약 2,477 ms
Decode Throughput   약 55,875 Points/s
```

이는 Node decode와 Range 계층의 기준선이다. 3회 처리량 범위는
`27,365`–`76,670 Points/s`였으며, 실제 전송량과 Node 수는 동일했다. FPS,
Time-to-first-meaningful-view, GPU Memory는 실제 브라우저/WebGL 자동화 환경에서
별도로 측정해야 한다.

---

# 32. 핵심 차별화 전략

## ① COPC Native Rendering

가능하면 다음 Flow를 유지한다.

```text
COPC
→ Decoded TypedArray
→ GPU
```

중간 3D Tiles 변환을 필수로 만들지 않는다.

---

## ② Cesium Native UX

Potree를 Cesium 위에 옮기는 접근보다 다음 Cesium 기능과 깊게 결합한다.

```text
Cesium Camera
Cesium Globe
Cesium Terrain
Cesium Clock
Cesium Picking
Cesium Styling
```

---

## ③ Runtime Spatial Query

전체 Point Cloud를 읽지 않고 필요한 영역만 조회한다.

```text
Query Only What Is Needed
```

이는 COPC 포맷의 철학과 잘 맞는다.

---

## ④ Performance Engineering

핵심 기능:

```text
Worker Pool
Range Coalescing
Request Prioritization
Memory Budget
GPU Budget
Node Cache
Adaptive LOD
Request Cancellation
```

단순 Viewer와 라이브러리의 품질을 나누는 부분이다.

---

## ⑤ Developer Tooling

다음 기능을 적극 제공한다.

```text
Diagnostics
Benchmark
Network Inspector
Octree Inspector
Statistics
Performance Overlay
```

오픈소스 프로젝트에서 중요한 차별화 요소가 될 수 있다.

---

# 33. 최종 권장 구조

```text
                       COPC
                        │
                HTTP Range Reader
                        │
               Hierarchy Manager
                        │
               Request Scheduler
                        │
            ┌───────────┴───────────┐
            │                       │
      Worker Decode            Range Cache
            │                       │
            └───────────┬───────────┘
                        │
                  Node Runtime
                        │
            ┌───────────┴───────────┐
            │                       │
        CPU Cache               GPU Cache
            │                       │
            └───────────┬───────────┘
                        │
                  LOD Scheduler
                        │
        ┌───────────────┴───────────────┐
        │                               │
Native Cesium Renderer          3D Tiles Adapter
        │
        ├── RGB
        ├── Intensity
        ├── Classification
        ├── Elevation
        ├── GPS Time
        ├── GPU Filtering
        └── Picking

                        +

                 Analysis Engine

        ├── Polygon Query
        ├── Height Profile
        ├── Statistics
        └── Measurement
```

---

# 34. MVP 성공 기준

초기 MVP의 성공 기준을 단순히 "COPC가 보인다"로 잡지 않는 것이 중요하다.

다음 세 가지를 권장한다.

### 1. 대용량 COPC 직접 로딩

> 1~2GB 수준의 COPC를 사전 포맷 변환 없이 URL 하나로 열 수 있다.

### 2. 안정적인 Streaming

> 카메라가 이동할 때 필요한 Byte Range만 요청하고 일정한 Point Budget과 FPS를 유지한다.

### 3. Cesium 친화적 Point Cloud API

> RGB뿐 아니라 Classification, Intensity, Picking 등을 CesiumJS 개발자가 쉽게 사용할 수 있는 API로 제공한다.

이 세 가지가 완성되면 단순 COPC Viewer와 명확한 차이가 생긴다.

현재 상태는 다음과 같다.

| 성공 기준 | 상태 | 근거 |
|---|---|---|
| COPC 직접 로딩 | 달성 | URL 기반 Header/Hierarchy/Node Range Streaming |
| 안정적인 Streaming | 달성, 장시간 검증 필요 | additive LoD, 요청 취소·재정렬, 3단 Cache |
| Cesium 친화 API | 달성 | 색상, Filter, Picking, Clock, EDL, Statistics |

현재 자동 검증은 15개 Test File의 58개 Test, coverage 하한, 전체
typecheck/build, Vite demo production build, npm package dry-run, Playwright Chromium
smoke test까지 포함한다. GitHub Actions는 Node.js 20·22에서 이를 반복한다.

그 다음 단계에서 다음 기능을 추가하는 것이 좋다.

- GPU Filtering
- Spatial Query
- GPS Time + Cesium Clock
- Height Profile
- Statistics
- IndexedDB Cache
- Runtime Diagnostics

---

# 35. 프로젝트 포지셔닝

프로젝트의 공식 이름은 **CesiumJS COPC Runtime**으로 정한다. 저장소 이름은
`cesiumjs-copc-runtime`, 사용자가 설치하는 주 npm 패키지는 `cesiumjs-copc`를
사용한다. 내부 기능은 `cesiumjs-copc-core`, `cesiumjs-copc-runtime`,
`cesiumjs-copc-worker`, `cesiumjs-copc-analysis` 패키지로 분리한다.

이 이름은 CesiumJS와 COPC의 연결을 바로 드러내면서도, 단순 Provider가 아닌
실행 시점의 streaming·LoD·rendering·analysis 계층이라는 정체성을 담는다.
이 프로젝트는 독립 오픈소스 프로젝트이며 Cesium의 공식 프로젝트가 아니다.

단순한:

```text
cesium-copc
```

라이브러리보다는 다음 개념으로 설명하는 것이 좋다.

> **CesiumJS COPC Runtime**

TIFFImageryProvider와 비교하면 다음과 같다.

```text
TIFFImageryProvider
    ↓
COG → Cesium Imagery

CesiumJS COPC Runtime
    ↓
COPC → Cesium Point Cloud
```

다만 최종적으로는 단순 Provider를 넘어 다음 영역까지 확장한다.

```text
Provider
+
LOD Engine
+
Renderer
+
Query Engine
+
Analysis Engine
```

즉 최종 목표는 COPC Viewer가 아니라,

> **CesiumJS용 Cloud Native Point Cloud Runtime**

으로 잡는 것이 가장 경쟁력이 있다.

---

# 36. 2026-08-27 이후 우선순위

## P0 — 정확성과 회귀 방지

1. 실제 브라우저에서 additive LoD의 Point 누적·cohort 공개 검증
2. Picking index와 source/render 좌표 일치 통합 테스트
3. destroy 시 fetch, Worker, GPU resource 해제 테스트
4. 국내 공공 COPC WKT1/WKT2 fixture 확대

## P1 — 렌더 성능과 표현

1. RGB/Intensity/Classification/Elevation을 하나의 GPU shader 경로로 통합
2. Classification·Height filter를 uniform 기반으로 전환
3. GPS Time처럼 실제 Point compact가 필요한 필터와 GPU filter의 혼합 정책 확정
4. FPS, upload time, GPU memory를 포함한 browser benchmark 자동화

## P2 — 배포 완성도

1. Worker와 `laz-perf.wasm`의 소비자 무설정 bundle 또는 공식 Vite plugin
2. 빈 프로젝트 tarball 설치·Worker 실행 검증
3. npm provenance와 tag 기반 publish 자동화
4. 브라우저·Bundler compatibility matrix와 소비자 설치 검증

## P3 — 확장

1. 토큰 기반 WKT1/WKT2 parser와 `BOUNDCRS` 처리
2. Polygon Query와 measurement API
3. Debug Octree 및 performance overlay
4. 1–2GB 이상 COPC 장시간 stress test와 multi-COPC loading
