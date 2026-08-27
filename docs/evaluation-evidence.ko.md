# 1차 서면 평가 증거

이 문서는 1차 서면 평가의 다섯 기준을 저장소에서 직접 확인할 수 있는 증거에
연결한다. 수치와 운영 상태는 `v0.1.1` 기준이며, 재현 명령과 아직 해결하지 못한
한계를 함께 기록한다.

## 한눈에 보기

| 평가 기준 | 저장소에서 확인할 핵심 증거 |
| --- | --- |
| 프로젝트 구조 및 코드 완성도 | 5개 공개 패키지의 단방향 책임 분리, 120개 단위 테스트, 배포 런타임 statements 92.85%, production subpath 브라우저 테스트 |
| 오픈소스 발전 가능성 | MIT 라이선스, npm 패키지와 GitHub Release, 공개 로드맵, 거버넌스·보안·기여 정책, 라이브 데모 |
| 개발 문서의 구체성 | 시작하기, 패키지/API, 아키텍처, 좌표계, 벤치마크 재현, 문제 해결, 개발·릴리스 절차 |
| 프로젝트 혁신성 | COPC의 range-addressable octree를 직접 사용한 무변환 스트리밍, Worker LAZ decode, 정밀도 분리, 원본 CRS 분석 |
| 협업 및 관리체계 | Issue/PR 템플릿, CODEOWNERS, 보호된 `main`, 필수 CI 4종, 실제 변경 요청과 재검토가 남은 PR 이력 |

## 1. 프로젝트 구조 및 코드 완성도

### 책임이 분리된 패키지 구조

[아키텍처](architecture.md)는 HTTP Range I/O부터 LOD 선택, Worker decode, 좌표
변환, CesiumJS 렌더링, 분석까지의 데이터 흐름을 공개한다. 패키지 책임은 다음과
같이 분리돼 있다.

- `cesiumjs-copc-core`: Range 요청, COPC hierarchy, decode 타입, 영구 캐시
- `cesiumjs-copc-runtime`: 카메라 LOD, 요청 큐, 기기별 예산, decoded LRU
- `cesiumjs-copc-worker`: Worker 수명주기, LAZ decode, node-relative ECEF 좌표
- `cesiumjs-copc`: CesiumJS primitive, GPU buffer, picking과 시각 제어
- `cesiumjs-copc-analysis`: 원본 CRS 공간 질의, 통계, 높이 프로파일

핵심 계층은 CesiumJS에 의존하지 않고 통합 패키지가 안쪽 계층에 의존한다. 이
경계 덕분에 렌더러 없이 core와 analysis만 설치할 수도 있다.

### 자동 검증

`v0.1.1`의 배포 런타임 기준 커버리지는 다음과 같다.

| 지표 | 결과 | 회귀 하한 |
| --- | ---: | ---: |
| Statements | 92.85% | 88% |
| Lines | 92.85% | 88% |
| Functions | 89.22% | 85% |
| Branches | 78.49% | 74% |

19개 파일의 단위 테스트 120개가 렌더 프레임 루프, LOD, GPU 업로드 예산,
필터·pick·destroy, Range 병합·캐시, hierarchy page 공유, abort, LAZ dimension과
색상 정규화를 검증한다. [PR #26](https://github.com/yangseungsang/cesiumjs-copc-runtime/pull/26)에
테스트 범위와 리뷰 근거가 남아 있다.

[CI workflow](../.github/workflows/ci.yml)는 모든 PR과 `main` push에서 다음 네
검사를 요구한다.

1. Node.js 20 quality
2. Node.js 22 quality
3. Coverage
4. Chromium Browser smoke

브라우저 테스트는 개발 서버의 첫 화면만 확인하지 않는다. GitHub Pages와 같은
`/cesiumjs-copc-runtime/` base로 production build를 만들고, main bundle과
decoder Worker가 참조하는 WASM 응답의 상태, MIME과 magic bytes까지 검사한다.

## 2. 오픈소스 프로젝트로의 발전 가능성

- [MIT License](../LICENSE)로 코드 사용·수정·재배포 조건을 명확히 했다.
- 공개 패키지를 npm에 독립 배포하고 `cesiumjs-copc`는 호스트 CesiumJS를 peer
  dependency로 요구해 소비자 앱에 중복 인스턴스가 생기지 않게 한다.
- [라이브 데모](https://yangseungsang.github.io/cesiumjs-copc-runtime/)에서 공개
  COPC 데이터로 실제 스트리밍을 확인할 수 있다.
- [Roadmap](roadmap.md)은 reliability, performance, ecosystem 순서로 후속 작업을
  공개 Issue와 연결한다.
- [Governance](../GOVERNANCE.md), [Contributing](../CONTRIBUTING.md),
  [Security](../SECURITY.md), [Code of Conduct](../CODE_OF_CONDUCT.md),
  [Support](../SUPPORT.md)를 제공한다.
- 태그 기반 릴리스 workflow가 이미 존재하는 버전은 건너뛰고 변경된 workspace만
  provenance와 함께 배포한다.

프로젝트는 `v0.1.x` 단계다. 안정 API를 선언하기 전 실제 소비자 피드백과 번들러
호환성 자료를 축적하는 것이 다음 성숙도 기준이다.

## 3. 개발 문서의 구체성

문서는 독자의 목적에 따라 [문서 색인](README.md)에서 찾을 수 있다.

- [Getting started](getting-started.md): 설치, URL 검증, 첫 layer 생성과 정리
- [API reference](api-reference.md): 공개 패키지와 주요 옵션·메서드
- [Architecture](architecture.md): 데이터 흐름, 패키지 경계, 정밀도와 캐시 모델
- [Coordinate systems](coordinate-systems.md): projected CRS, 한국 좌표계, EGM96
- [Benchmarks](benchmarks.md): 장비·명령·표본·세 번의 범위와 비교 규칙
- [Pipeline comparison](pipeline-comparison.md): 3D Tiles 변환 경로와의 차이 및
  측정하지 않은 항목
- [Troubleshooting](troubleshooting.md): Range/CORS, 위치·높이, Worker/WASM,
  메모리와 signed URL
- [Development](development.md): 저장소 구조, 품질 명령, PR과 릴리스 절차

성능 수치는 보편적 주장으로 제시하지 않는다. 장비, 네트워크 위치, 캐시 상태와
표본 범위를 함께 공개하고 실제로 측정하지 않은 3D Tiles 변환 수치는 비워 둔다.

## 4. 프로젝트 혁신성

일반적인 사전 변환 파이프라인과 달리 COPC가 이미 가진 hierarchy와 byte range를
런타임에서 직접 사용한다.

```text
COPC 원본 ── HTTP Range ── hierarchy/LOD ── Worker LAZ decode ── CesiumJS
     └──────────────────────── 원본 CRS query/statistics ─────────────┘
```

기술적 차별점은 다음과 같다.

- 현재 카메라가 요구하는 hierarchy page와 node chunk만 요청한다.
- 인접 byte range 병합과 memory/IndexedDB cache로 중복 전송을 줄인다.
- additive refinement와 화면 오차, 카메라 중심, 기기 등급을 함께 사용한다.
- LAZ decode와 CRS 변환을 Worker로 보내 메인 스레드의 프레임 작업과 분리한다.
- 분석 좌표는 원본 CRS `Float64`로 보존하고 GPU 좌표만 node-relative ECEF
  `Float32`로 만들어 전역 정밀도와 GPU 비용을 분리한다.
- 같은 원본에서 렌더링과 공간 질의·통계·높이 프로파일을 수행한다.

기준 데이터에서는 77.4 MiB 전체 중 3,150,366 bytes를 전송해 목표 view에
도달했다. 다만 이는 이 프로젝트의 관측값이며 실제 3D Tiles 변환기와의 동일 장비
대조 실험은 아직 수행하지 않았다. 자세한 제한은 [Pipeline comparison](pipeline-comparison.md)에
명시돼 있다.

## 5. 프로젝트 협업 및 관리체계

### 사전에 정의된 절차

- 구조화된 bug, feature, performance Issue form
- 문제·해결·검증·위험을 요구하는 PR template
- 전체 경로 기본 리뷰어를 지정하는 CODEOWNERS
- force push와 branch deletion 금지
- 최신 base와 필수 CI 4종을 요구하는 보호된 `main`
- 미해결 리뷰 대화가 있으면 병합을 막는 conversation resolution
- 한 명 이상의 승인 리뷰 요구

### 실제 운영 이력

형식만 존재하는 것이 아니라 리뷰로 변경된 기록이 남아 있다.

- [PR #19](https://github.com/yangseungsang/cesiumjs-copc-runtime/pull/19): 잘못된
  성능 하한과 과도한 구조적 주장을 변경 요청 후 제거·조건화
- [PR #21](https://github.com/yangseungsang/cesiumjs-copc-runtime/pull/21): 구현보다
  강한 API 주석 다섯 건을 변경 요청 후 실제 보장 범위로 수정
- [PR #26](https://github.com/yangseungsang/cesiumjs-copc-runtime/pull/26): 핵심
  테스트 62개와 coverage gate를 검토하고 근거를 남겨 승인
- [PR #29](https://github.com/yangseungsang/cesiumjs-copc-runtime/pull/29): Pages
  WASM 장애 수정에 production subpath 회귀 테스트와 소비자 문서를 리뷰로 추가
- [PR #31](https://github.com/yangseungsang/cesiumjs-copc-runtime/pull/31): 외부
  기여자의 정확한 아이디어를 유지하면서 깨진 source formatting을 리뷰로 발견·복구

## 재현 명령

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run typecheck
npm run build
npm run demo:build
npm run check:packaging
npm run pack:check
npm run test:e2e
```

원격 benchmark는 네트워크 상태의 영향을 받으므로 [측정 프로토콜](benchmarks.md)의
장비와 반복 조건을 기록한 뒤 별도로 실행한다.

## 공개된 한계와 후속 과제

- 실제 3D Tiles converter를 동일 장비에서 실행한 대조 실측이 없다.
- 실제 원격 COPC의 다중 hierarchy page 회귀는 아직 단위 stub과 분리돼 있다.
- 실패 node의 retry/backoff 및 공개 오류 정책이 남아 있다.
- 1–2 GiB 데이터와 장시간 카메라 경로의 메모리·지연 자료가 없다.
- Vite 외 번들러의 Worker/WASM 소비자 recipe와 호환성 보고가 더 필요하다.

이 항목들은 숨기지 않고 [공개 Issues](https://github.com/yangseungsang/cesiumjs-copc-runtime/issues)와
[Roadmap](roadmap.md)에서 추적한다.
