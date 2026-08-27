# Gaia3D OSSP 2026 과제 요구사항 정리

> 구현 현황 기준일: **2026-08-27**
> 현재 저장소는 요구사항 분석 단계를 넘어 COPC 직접 스트리밍 MVP, 분석 API,
> 국내 좌표계 지원, Worker 렌더 좌표 생성을 구현한 상태다.

## 1. 과제명

**COPC 데이터의 CesiumJS 가시화 기술 개발**

- 과제 유형: 지정과제
- 제안 기업: 가이아쓰리디(Gaia3D)
- 핵심 주제: **COPC(Point Cloud) 데이터를 별도의 3D Tiles 변환 없이 CesiumJS에서 직접 가시화하는 기술 개발**

---

## 2. 과제의 핵심 목표

3D 스캐너, LiDAR, 드론 등을 통해 생성되는 대용량 **3D 점군 데이터(Point Cloud)​**를 웹 브라우저 기반 3D 지구본인 **CesiumJS에서 빠르고 부드럽게 가시화할 수 있는 라이브러리 또는 플러그인**을 개발한다.

기존에는 대용량 3D 데이터를 웹에서 서비스하기 위해 원본 데이터를 Cesium에서 사용할 수 있는 형태로 사전에 **타일링(Tiling)** 하는 과정이 필요했다.

본 과제에서는 이러한 사전 변환 과정을 최소화하거나 제거하고, **COPC 파일을 원본 상태에 가깝게 유지하면서 필요한 영역과 해상도의 데이터만 읽어 CesiumJS에 표시하는 것**을 목표로 한다.

즉, 핵심 목표는 다음과 같이 요약할 수 있다.

> **COPC → 별도 3D Tiles 변환 없이 → CesiumJS에서 직접 스트리밍 및 가시화**

---

## 3. 기존 방식의 문제점

기존 CesiumJS 기반 Point Cloud 서비스에서는 일반적으로 다음과 같은 흐름이 필요하다.

```text
원본 Point Cloud
        │
        ▼
   LAS / LAZ 등
        │
        ▼
 사전 변환 / 타일링
        │
        ▼
  Cesium 3D Tiles
        │
        ▼
     CesiumJS
```

대용량 3D 데이터를 웹에서 효율적으로 표시하기 위해 데이터를 여러 개의 작은 공간 단위로 나누고 LoD를 구성하는 사전 처리 과정이 필요하다.

가이아쓰리디의 과제 설명에서는 이를 **복잡하고 시간이 오래 걸리는 사전 변환 작업**으로 설명하고 있다.

이 구조에서는 다음과 같은 문제가 발생할 수 있다.

- 원본 데이터와 웹 서비스용 데이터가 별도로 존재
- 데이터 변환 시간이 필요
- 추가 저장 공간 필요
- 원본이 갱신되면 다시 타일링해야 함
- 데이터 제공 파이프라인이 복잡해짐

---

## 4. 새로운 방식

COPC는 자체적으로 **Octree 및 LoD 구조를 포함한 Cloud Optimized Point Cloud 포맷**이다.

따라서 전체 파일을 처음부터 끝까지 내려받지 않고도 필요한 공간 영역과 해상도에 해당하는 데이터만 선택적으로 요청할 수 있다.

목표 구조는 다음과 같다.

```text
             COPC
      (원본 Point Cloud)
               │
        HTTP Range Request
               │
               ▼
      COPC Loader / Parser
               │
               ▼
       CesiumJS Adapter
               │
               ▼
           CesiumJS
```

즉,

```text
COPC → CesiumJS
```

형태의 직접적인 연결 계층을 만드는 것이 과제의 핵심이다.

페이지에서는 이를 **COPC라는 규격의 데이터를 CesiumJS에서 사용할 수 있도록 연결하는 "스마트 돼지코 어댑터"​**에 비유하고 있다.

---

# 5. COPC란?

**COPC(Cloud Optimized Point Cloud)​**는 Point Cloud 데이터를 클라우드 환경에서 효율적으로 저장하고 스트리밍할 수 있도록 설계된 공개 데이터 포맷이다.

COPC의 주요 특징은 다음과 같다.

### 5.1 Octree 기반 데이터 구조

공간을 계층적인 Octree 형태로 나누어 Point Cloud를 저장한다.

```text
                Root
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
      Node     Node      Node
       │
    ┌──┼──┐
    ▼  ▼  ▼
   ...
```

사용자의 카메라 위치와 화면에 보이는 영역에 따라 필요한 Node만 선택적으로 요청할 수 있다.

---

### 5.2 LoD(Level of Detail)

COPC 데이터는 계층적인 해상도를 가진다.

COPC는 EPT와 같은 **additive octree** 구조를 사용한다. 하위 Node의 Point는
상위 Node의 Point를 대체하거나 복제하지 않는다. 따라서 특정 영역의 해상도를
높일 때는 상위 Node를 제거하는 것이 아니라, 루트부터 선택 깊이까지의 Point를
누적해서 표시해야 한다.

멀리 있는 영역은 적은 수의 Point를 사용하고, 가까운 영역은 더 많은 Point를 사용할 수 있다.

```text
멀리서 보기
Level 0
● ● ● ●

      ↓ Zoom

Level 0 + Level 1
● ● ● ● + ● ● ● ●

      ↓ Zoom

Level 0 + Level 1 + Level 2
●●●● + ●●●● + ●●●●●●
```

따라서 화면에 필요하지 않은 고해상도 데이터를 모두 가져올 필요가 없다.

---

### 5.3 부분 데이터 요청

COPC에서는 특정 영역과 필요한 해상도에 해당하는 데이터 청크만 요청할 수 있다.

예를 들어 전체 파일이 수십 GB여도 현재 화면에서 필요한 부분이 20MB라면 해당 부분만 읽어오는 방식의 구현이 가능하다.

```text
COPC File
┌─────────────────────────────┐
│ Header                      │
├─────────────────────────────┤
│ Hierarchy                   │
├─────────────────────────────┤
│ Point Data                  │
│                             │
│        [필요한 Node] ◀──────┼── Range Request
│                             │
└─────────────────────────────┘
```

---

### 5.4 원본과 서비스 데이터의 통합

일반적인 방식에서는 다음과 같이 두 종류의 데이터가 존재할 수 있다.

```text
원본
LAS / LAZ
   │
   ├────────── 보관
   │
   ▼
3D Tiles 생성
   │
   ▼
웹 서비스
```

COPC를 사용하면 다음과 같은 구조를 목표로 할 수 있다.

```text
           COPC
          /    \
         /      \
      원본      웹 서비스
      보관      CesiumJS
```

즉, **하나의 COPC 파일을 원본 데이터 보관과 웹 가시화에 함께 활용할 수 있는 구조**가 과제의 중요한 배경이다.

---

# 6. 실제 개발해야 하는 것

공식 과제 페이지에서 제시하는 개발과제 예시는 다음과 같다.

> **CesiumJS 기반의 COPC 가시화 라이브러리 혹은 플러그인 개발**

따라서 프로젝트의 핵심 결과물은 다음과 같은 형태가 될 수 있다.

```text
cesiumjs-copc
```

또는

```javascript
const copc = new CesiumCOPC({
    url: "sample.copc.laz"
});

viewer.scene.primitives.add(copc);
```

처럼 CesiumJS 사용자 입장에서 쉽게 COPC를 추가할 수 있는 라이브러리가 이상적인 형태다.

---

# 7. 필요한 주요 기능

공식 페이지에서 요구하는 내용을 개발 기능 관점에서 해석하면 크게 다음 영역이 필요하다.

## 7.1 COPC 파일 읽기

COPC 파일의 구조를 분석하고 필요한 정보를 읽을 수 있어야 한다.

예:

- COPC Header
- COPC Info VLR
- Hierarchy
- Node 정보
- Point Data

기존 라이브러리를 처음부터 다시 구현하기보다는 공식 페이지에서 소개하는 **copc.js 등의 TypeScript 라이브러리 활용**을 고려할 수 있다.

---

## 7.2 COPC Hierarchy 탐색

현재 카메라에서 필요한 COPC Node를 결정해야 한다.

예를 들어:

```text
COPC Root
   │
   ├─ 0-0-0
   │    ├─ 1-0-0
   │    └─ 1-0-1
   │
   ├─ 0-0-1
   └─ ...
```

카메라의 위치, 방향 및 Zoom 수준에 따라 어느 Node를 가져올지 판단해야 한다.

---

## 7.3 LoD 선택

모든 데이터를 동시에 가져오는 것이 아니라 카메라와의 거리 또는 화면에 차지하는 크기에 따라 적절한 상세도를 선택해야 한다.

개념적으로는 Cesium 3D Tiles의

```text
Screen Space Error
```

와 유사한 판단 기준을 COPC Octree에 적용할 수 있다.

이때 선택 결과는 일반적인 raster tile의 replacement frontier가 아니라 다음과
같은 additive display set이어야 한다.

```text
선택 깊이 2

Level 0 Node
  + 보이는 Level 1 Node
  + 보이는 Level 2 Node
```

Point Budget 역시 자식이 부모를 대체한다고 계산하지 않고, 추가되는 자식 Point를
기존 상위 Node Point에 더한 누적 값으로 계산해야 한다.

---

## 7.4 HTTP Range Request

COPC의 장점을 활용하려면 전체 COPC 파일을 다운로드하는 방식이 아니라 필요한 Byte 범위만 요청하는 구조가 중요하다.

```http
GET /pointcloud.copc.laz

Range: bytes=120000-150000
```

이를 통해 특정 Node의 Point Data만 가져올 수 있다.

---

## 7.5 Point Cloud 디코딩

COPC는 LAZ 기반이므로 가져온 데이터를 실제 Point 정보로 디코딩해야 한다.

예:

```text
X
Y
Z
Intensity
RGB
Classification
GPS Time
...
```

COPC 자체를 읽는 계층과 Cesium에서 렌더링할 데이터로 변환하는 계층을 분리하는 것이 바람직하다.

---

## 7.6 좌표계 처리

Point Cloud 좌표계를 Cesium에서 사용하는 지구 좌표 체계로 변환해야 한다.

개략적인 흐름:

```text
COPC 좌표

EPSG / Projected CRS
        │
        ▼
      WGS84
        │
        ▼
 Cesium Cartesian3
```

Point Cloud의 실제 위치를 Cesium 지구본 위에 정확하게 배치하기 위한 부분이다.

---

## 7.7 CesiumJS Rendering

최종 Point를 CesiumJS Scene에 렌더링해야 한다.

구현 방식으로는 프로젝트 설계에 따라 예를 들어 다음을 검토할 수 있다.

```text
COPC Node

    ↓

Cesium Geometry / Buffer

    ↓

Primitive

    ↓

WebGL Rendering
```

단순히 점을 표시하는 것뿐 아니라 대용량 데이터를 지속적으로 추가/삭제하면서도 렌더링 성능을 유지해야 한다.

---

## 7.8 Streaming 관리

카메라가 이동하면 필요한 데이터 역시 변화한다.

예:

```text
Camera 이동

     ↓

현재 화면 영역 계산

     ↓

필요 COPC Node 계산

     ↓

없는 Node 다운로드

     ↓

Point Decode

     ↓

GPU Upload

     ↓

화면 밖 Node 제거
```

따라서 다음 기능도 중요한 구현 요소가 된다.

- 요청 Queue
- 중복 요청 방지
- 비동기 Loading
- 요청 취소
- Cache
- 메모리 제한
- Node 제거

---

# 8. 권장 아키텍처

과제 요구사항을 기준으로 다음과 같은 계층 분리를 고려할 수 있다.

```text
┌─────────────────────────────────┐
│             CesiumJS            │
├─────────────────────────────────┤
│        COPC Cesium Adapter       │
│                                 │
│  · Camera Tracking              │
│  · LOD Selection                │
│  · Visibility / Culling         │
│  · Render Primitive             │
├─────────────────────────────────┤
│         COPC Data Layer          │
│                                 │
│  · Hierarchy Traversal          │
│  · Node Management              │
│  · Range Request                │
│  · Cache                        │
├─────────────────────────────────┤
│         COPC / LAZ Parser        │
│                                 │
│  copc.js 등 기존 OSS 활용       │
├─────────────────────────────────┤
│          HTTP / Storage          │
└─────────────────────────────────┘
```

특히 기존 오픈소스 생태계와 호환성을 고려하면

**COPC 자체를 다시 구현하는 것보다 `COPC → CesiumJS` 연결 영역에 집중하는 것이 과제 취지에 더 부합한다.**

---

# 9. 참고해야 할 기존 프로젝트

공식 과제 페이지에서는 다음 프로젝트들을 참고 자료로 제시한다.

### COPC Specification

COPC 1.0 공식 규격.

COPC 파일 구조, Hierarchy, VLR 등의 구현 기준으로 사용한다.

### copc.js

TypeScript 기반 COPC Reader.

```text
COPC Parsing
Hierarchy 탐색
Point Data 접근
```

등 COPC 데이터 접근 계층 구현에 참고하거나 직접 활용할 수 있다.

### Potree

WebGL 기반 오픈소스 대용량 Point Cloud Viewer.

특히 다음 부분을 참고할 가치가 있다.

```text
Octree
LOD
Point Budget
Camera 기반 Node 선택
Point Cloud Rendering
```

공식 과제에서도 Potree의 COPC Viewer와 유사한 가시화 서비스를 목표 사례로 언급한다.

### TIFFImageryProvider

CesiumJS에서 Cloud Optimized GeoTIFF를 직접 읽어 화면에 표시하는 라이브러리다.

가이아쓰리디에서는 **COPC용 CesiumJS 라이브러리를 이 프로젝트와 비슷한 형태로 개발하는 것**을 예시로 제시하고 있다.

즉,

```text
COG
 │
 ▼
TIFFImageryProvider
 │
 ▼
CesiumJS
```

와 같은 역할을

```text
COPC
 │
 ▼
COPC Provider / Primitive
 │
 ▼
CesiumJS
```

형태로 구현하는 것이 과제의 방향이라고 볼 수 있다.

---

# 10. 최종적으로 보여줘야 할 결과

최종 데모는 최소한 다음 흐름을 보여주는 것이 좋다.

```text
COPC URL 입력
      │
      ▼
CesiumJS에 Point Cloud 표시
      │
      ▼
카메라 이동
      │
      ▼
필요한 영역만 추가 Loading
      │
      ▼
Zoom In
      │
      ▼
더 높은 LoD Point Loading
      │
      ▼
Zoom Out
      │
      ▼
불필요한 Node 제거
```

사용자 입장에서는 단순하게

```javascript
viewer.scene.primitives.add(
    new COPCPrimitive({
        url: "https://example.com/seoul.copc.laz"
    })
);
```

정도의 코드로 COPC를 Cesium에 올릴 수 있는 수준을 목표로 삼을 수 있다.

---

# 11. 과제에서 중요하게 평가될 것으로 예상되는 부분

공식 페이지에 상세 평가표가 제시되어 있는 것은 아니므로 아래 항목은 **과제 내용을 바탕으로 한 개발 관점의 해석**이다.

### 1. 사전 변환이 없어야 함

핵심은

```text
COPC → 3D Tiles → Cesium
```

이 아니라

```text
COPC → Cesium
```

이다.

COPC를 내부적으로 전부 3D Tiles로 변환해 저장한 뒤 보여준다면 이 과제의 핵심적인 장점이 약해진다.

### 2. COPC의 Streaming 특성을 활용해야 함

전체 파일을 다운로드한 후 보여주는 것보다는

```text
Hierarchy 조회
→ 필요한 Node 결정
→ Range Request
```

형태로 구현하는 것이 COPC의 취지에 맞다.

### 3. 대용량 데이터에서도 동작해야 함

Point Cloud가 작을 경우 전체 데이터를 읽어도 동작한다.

하지만 과제의 핵심은 **대용량 Point Cloud**이기 때문에 데이터가 커졌을 때도

- 메모리
- 네트워크
- FPS
- 응답성

을 유지하는 것이 중요하다.

### 4. CesiumJS와 자연스럽게 통합되어야 함

단순히 별도의 WebGL Canvas를 Cesium 위에 띄우는 것보다는 Cesium Scene과 연결되어

- Camera
- 좌표
- Globe
- Depth
- Rendering Loop

등과 자연스럽게 동작하는 라이브러리가 더 적절하다.

### 5. 기존 오픈소스와의 호환성

새로운 COPC Parser나 새로운 Point Cloud 규격을 만드는 것이 목적이 아니다.

가능하면

```text
COPC Specification
copc.js
CesiumJS
```

등 기존 생태계를 활용하고, **두 생태계 사이를 연결하는 얇고 재사용 가능한 Open Source Layer**를 만드는 방향이 적절하다.

---

# 12. MVP 개발 범위 제안

과제의 최소 기능 제품(MVP)은 다음 정도로 정의할 수 있다.

### Phase 1 — COPC Loading

- COPC URL 입력
- COPC Header 읽기
- COPC Info 읽기
- Hierarchy 읽기
- Point Node 읽기

### Phase 2 — 기본 Cesium 가시화

- Point 좌표 변환
- Cesium Primitive 생성
- Point Cloud 화면 표시
- RGB Point 표현

### Phase 3 — Streaming

- Camera 기반 Node 선택
- Range Request
- 비동기 Loading
- Octree Traversal

### Phase 4 — LoD

- Camera Distance 또는 Screen Space 기반 LoD
- Additive Parent / Child Node 누적
- Child cohort 준비 상태 기반 점진적 공개
- Point Budget

### Phase 5 — 최적화

- Node Cache
- Memory 제한
- Request Queue
- Worker 기반 LAZ Decode
- GPU Buffer 관리

---

# 13. 추가 기능

MVP 이후에는 다음 기능을 확장할 수 있다.

- Point Size 변경
- RGB / Intensity / Classification 기반 색상 표현
- Point Cloud 투명도
- Classification Filter
- Point Picking
- Point 정보 조회
- Bounding Box 표시
- Point Budget 설정
- Cache 크기 설정
- Debug Octree 표시
- 여러 COPC 동시 Loading
- EDL(Eye Dome Lighting) 등의 Point Cloud 표현 개선

다만 이러한 기능은 **COPC 데이터를 CesiumJS에서 직접 스트리밍하고 가시화하는 핵심 기능을 완성한 이후** 확장하는 것이 좋다.

2026-08-27 현재 Point Size, RGB/Intensity/Classification/Elevation 색상,
투명도, Classification·Intensity·Elevation·GPS Time 필터, Picking, Point 정보,
Point Budget, 3단 Cache, EDL, 공간 질의, 높이 프로파일, 통계 기능까지 구현됐다.
GPU shader 기반 일반 필터와 Debug Octree Overlay는 후속 작업이다.

---

# 14. 프로젝트 성공 기준

과제를 한 문장으로 정의하면 다음과 같다.

> **COPC 파일 하나만 서버에 올려두면 별도의 3D Tiles 변환 과정 없이 CesiumJS가 필요한 Point Cloud 영역을 직접 읽어 실시간으로 가시화할 수 있도록 한다.**

성공적인 결과물은 다음 구조가 되어야 한다.

```text
                   기존

LAS / LAZ
   │
   ▼
Tiling Pipeline
   │
   ▼
3D Tiles
   │
   ▼
CesiumJS


                   ↓


                 목표

COPC
 │
 │ HTTP Range Request
 ▼
COPC Cesium Library
 │
 ▼
CesiumJS
```

---

# 15. 핵심 요구사항 요약

| 구분 | 요구사항 |
|---|---|
| 입력 데이터 | COPC |
| 대상 플랫폼 | CesiumJS |
| 핵심 결과물 | CesiumJS COPC 가시화 Library / Plugin |
| Point Cloud 구조 | COPC Octree |
| 데이터 접근 | 필요한 영역 및 LoD 단위 접근 |
| 네트워크 | HTTP Range Request 활용 가능 |
| LoD | 카메라에 따라 적절한 COPC Node 선택 |
| Rendering | CesiumJS Scene 내부 Point Cloud Rendering |
| 변환 | 3D Tiles 등 사전 타일링 없이 직접 가시화 |
| 기존 OSS 활용 | copc.js, CesiumJS 등과의 호환성 고려 |
| 참고 Viewer | Potree COPC Viewer, eptium Viewer |
| 참고 설계 | TIFFImageryProvider와 유사한 Cesium 확장 구조 |
| 핵심 가치 | 단일 COPC 파일로 원본 보관 + 웹 서비스 |

---

# 16. 핵심 개발 포인트

이 프로젝트에서 **COPC 파일을 읽는 것 자체가 가장 어려운 문제는 아니다.**

이미 `copc.js`와 같은 오픈소스가 존재하기 때문이다.

실질적인 핵심 개발 영역은 다음과 같다.

```text
                COPC

                  │
                  ▼

        Hierarchy Traversal
                  │
                  ▼

           LOD Selection
                  │
                  ▼

           Range Request
                  │
                  ▼

            LAZ Decode
                  │
                  ▼

        Coordinate Transform
                  │
                  ▼

       Cesium GPU Rendering
                  │
                  ▼

           Cache / Memory
```

즉, 이 과제의 본질은 새로운 Point Cloud 포맷을 만드는 것이 아니라

> **COPC의 Octree/Streaming 구조를 CesiumJS의 Camera/Rendering 구조와 연결하는 것**

이라고 볼 수 있다.

---

# 17. 현재 구현 현황과 검증 결과

## 17.1 구현된 패키지

| 패키지 | 현재 역할 |
|---|---|
| `cesiumjs-copc-core` | COPC Source, hierarchy, Range Reader, 압축/영속 Cache, point filter |
| `cesiumjs-copc-runtime` | additive LoD, point budget, 요청 Queue, LRU, 기기 등급 |
| `cesiumjs-copc-worker` | LAZ decode, attribute 추출, 상대 ECEF 렌더 좌표 생성 |
| `cesiumjs-copc` | Cesium Primitive 연동, Picking, 색상, 필터, EDL을 제공하는 주 패키지 |
| `cesiumjs-copc-analysis` | 공간 범위 질의, 통계, 높이 프로파일 |
| `cesiumjs-copc-benchmark` | 실제 원격 COPC 전송·decode benchmark |

## 17.2 핵심 달성 사항

- COPC Header·Info VLR·Hierarchy page 지연 로딩
- HTTP `206 Partial Content` 검증과 Range Request
- 인접 Range coalescing, 메모리 Cache, IndexedDB Cache
- Camera/SSE/Point Budget 기반 additive LoD
- 카메라 중심 우선순위, 요청 재정렬, 화면 밖 요청 취소
- 자식 cohort가 준비될 때까지 상위 Node를 유지하는 안정적 스트리밍
- Worker Pool 기반 LAZ decode와 Transferable 사용
- Worker 내부 CRS 투영 및 Node 원점 상대 ECEF `Float32` 렌더 좌표 생성
- Picking·분석용 source CRS `Float64` 좌표와 LAS Attribute 보존
- WKT compound CRS의 수평/수직 단위 분리
- `EPSG:5173`–`5188`, `EPSG:2096`–`2098`, `EPSG:4737` 국내 좌표계 등록
- 누락된 Bessel datum shift 보완과 명시적 EGM96 보정
- low/medium/high 기기 등급별 Point·Memory·Worker·Request 기본 예산
- Picking, GPS Time–Cesium Clock 연결, EDL, 공간 질의와 높이 프로파일

## 17.3 실제 COPC 검증

2026-08-27 Apple M1 Pro(8 Core, 16 GiB), Node.js 22.17.0 환경에서 Autzen Stadium
원격 COPC(`10,653,336` Points, 약 `77.4 MiB`)를 대상으로 250,000 Point 목표
cold-process benchmark를 3회 수행했다.

| 항목 | 측정값 |
|---|---:|
| Decoded Nodes | 8 |
| Decoded Points | 269,241 |
| 실제 전송량 | 약 3.0 MiB |
| 물리 Range Requests | 8 |
| 논리 Range Requests | 11 |
| Coalesced Ranges | 3 |
| Metadata Load 중앙값 | 약 1,376 ms |
| Time to First Point 중앙값 | 약 2,477 ms |
| Decode Throughput 중앙값 | 약 55,875 Points/s |

전체 파일을 내려받지 않고 필요한 hierarchy와 Node chunk만 읽었으며, 서로 다른
Octree 깊이의 8개 Node Point를 누적 디코딩해 additive 구조를 확인했다. 실제
전송량과 Node 수는 3회 모두 같았고, decode 처리량은 네트워크·실행 환경 변동을
숨기지 않기 위해 `27,365`–`76,670 Points/s` 범위도 함께 기록했다.

## 17.4 자동 검증

- 15개 Test File, 58개 Test 통과
- Coverage 기준선 강제: Statement 45%, Branch 65%, Function 75%, Line 45%
- 전체 TypeScript typecheck 통과
- 전체 workspace build 통과
- Vite demo production build 통과
- Playwright Chromium viewer smoke test 통과
- npm package dry-run 및 불필요한 test 산출물 제외 확인
- GitHub Actions에서 Node.js 20·22 자동 검증

## 17.5 남은 우선 작업

1. 고정 Camera path 기반 브라우저/WebGL 성능 통합 테스트
2. GPU shader 기반 색상·분류·높이 필터
3. 토큰 기반 WKT1/WKT2 parser 강화
4. Worker와 laz-perf WASM의 소비자 무설정 패키징
5. 1–2GB 이상 COPC 장시간 Streaming/FPS/Memory benchmark
6. 빈 프로젝트 tarball 설치 검증과 npm publish 자동화

---

## 공식 참고자료

- COPC Specification 1.0
- COPC 지원 Software 목록
- `connormanning/copc.js`
- `potree/potree`
- `hongfaqiu/TIFFImageryProvider`

공식 과제 페이지에서 위 자료들을 개발 참고자료로 직접 제시하고 있다.

---

## 과제 혜택

- 수상작 선정: **1개 팀**
- 상금: **300만 원**
- 추가 혜택: **선정팀 가이아쓰리디 입사 지원 시 우대**
