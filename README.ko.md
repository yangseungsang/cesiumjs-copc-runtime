# CesiumJS COPC Runtime

3D Tiles 사전 변환 없이 COPC를 CesiumJS에서 직접 스트리밍하고 분석하는
오픈소스 런타임입니다.

[English](README.md) |
[라이브 데모](https://yangseungsang.github.io/cesiumjs-copc-runtime/) |
[문서 전체](docs/README.md) |
[시작하기](docs/getting-started.md) |
[아키텍처](docs/architecture.md) |
[벤치마크](docs/benchmarks.md)

![CesiumJS COPC Runtime 대표 이미지](docs/assets/cesiumjs-copc-runtime-hero.png)

## 핵심 가치

기존 포인트 클라우드 웹 서비스는 원본을 별도의 서비스 형식으로 변환하는 경우가
많습니다. 이 프로젝트는 COPC가 이미 제공하는 Range-addressable Octree를 활용해
현재 카메라에 필요한 hierarchy와 node chunk만 요청합니다.

- 원본 COPC 하나를 가시화와 분석에 함께 사용
- HTTP Range Request와 인접 범위 병합
- 카메라 기반 additive LoD와 기기별 point budget
- Worker LAZ decode와 상대 ECEF `Float32` 렌더 좌표
- 원본 CRS `Float64` 좌표 및 LAS attribute 보존
- 국내 좌표계, 명시적 EGM96 보정, 공간 질의와 높이 프로파일

## 3D Tiles 변환 경로와의 비교

| 축                     | 3D Tiles 변환 경로    | 이 프로젝트 |
| ---------------------- | --------------------- | ----------- |
| 첫 화면 전에 필요한 작업 | 전체 데이터 변환      | 없음        |
| 원본 갱신 시 비용      | 해당 데이터 재변환    | 없음        |
| 화면당 비용이 비례하는 대상 | 변환 후에는 화면   | 화면        |

각 축의 근거와, 무엇이 이 저장소의 실측이고 무엇이 구조적으로 따라 나오는 것인지의
구분은 [파이프라인 비교](docs/pipeline-comparison.md)에 정리했습니다. 실제 변환기를
측정한 항목은 하나도 없다는 점도 문서에 명시했습니다. 반대로 3D Tiles 변환이 여전히
유리한 경우도 함께 적었습니다.

## 검증 현황

| 항목             |                                       결과 |
| ---------------- | -----------------------------------------: |
| Unit Test        |                     15개 파일, 58개 테스트 |
| CI               |                             Node.js 20, 22 |
| Browser Test     |                        Chromium smoke test |
| 기준 데이터      |               10,653,336 points / 77.4 MiB |
| 기준 View 전송량 |                                 약 3.0 MiB |
| Decode           | 269,241 points / 중앙값 약 55,875 points/s |

수치는 실행 환경에 따라 달라질 수 있으므로 [측정 방법](docs/benchmarks.md)을 함께
확인해야 합니다.

## 설치

Node.js 20 이상이 필요합니다.

```sh
npm install cesiumjs-copc cesium
```

CesiumJS는 peer dependency이므로 직접 설치하고 트리에 한 벌만 유지해야 합니다.
이 런타임은 뷰어와 Cesium 객체를 주고받기 때문에, Cesium이 두 벌 설치되면 그
교환이 의존하는 타입 동일성이 깨집니다.

렌더러가 필요 없다면 필요한 패키지만 설치하면 됩니다. 아래 둘은 Cesium을
요구하지 않습니다.

```sh
npm install cesiumjs-copc-core       # HTTP Range로 COPC 읽기
npm install cesiumjs-copc-analysis   # 공간 질의와 통계
```

## 데모 실행

```sh
git clone https://github.com/yangseungsang/cesiumjs-copc-runtime.git
cd cesiumjs-copc-runtime
npm ci
npm run build
npm run demo
```

서버는 CORS와 HTTP `206 Partial Content`를 지원해야 합니다. 자세한 설정과 문제
해결 방법은 [Getting Started](docs/getting-started.md)와
[Troubleshooting](docs/troubleshooting.md)을 참고하세요.

이 프로젝트는 독립 오픈소스 프로젝트이며 Cesium의 공식 프로젝트가 아닙니다.
[MIT License](LICENSE)로 배포됩니다.
