import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  createWorldTerrainAsync,
  EllipsoidTerrainProvider,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  OpenStreetMapImageryProvider,
  sampleTerrainMostDetailed,
  ScreenSpaceEventType,
  Transforms,
  Viewer,
  type ScreenSpaceEventHandler,
} from "cesium";
import { CopcEyeDomeLighting, CopcPointCloud, type CopcColorMode } from "cesiumjs-copc";
import { IndexedDbRangeCache } from "cesiumjs-copc-core";
import { budgetFor, classifyDevice } from "cesiumjs-copc-runtime";
import "./style.css";

const sampleUrl = "https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz";
// Keep interaction smooth while the camera moves, then spend more of each
// frame converting and uploading decoded points as soon as movement settles.
const movingUploadBudgetMilliseconds = 2;
const idleUploadBudgetMilliseconds = 8;
const persistentCache = IndexedDbRangeCache.supported
  ? new IndexedDbRangeCache({ maximumBytes: 512 * 1024 * 1024 })
  : undefined;
const viewer = new Viewer("cesium", {
  animation: false,
  baseLayer: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
});
viewer.scene.backgroundColor = Color.fromCssColorString("#07100f");
viewer.scene.globe.baseColor = Color.fromCssColorString("#18332e");
viewer.scene.globe.showGroundAtmosphere = true;
viewer.scene.globe.depthTestAgainstTerrain = true;
const eyeDomeLighting = new CopcEyeDomeLighting(viewer.scene, { strength: 1, radius: 1 });

const form = element<HTMLFormElement>("load-form");
const urlInput = element<HTMLInputElement>("url");
const status = element<HTMLOutputElement>("status");
const color = element<HTMLSelectElement>("color");
const filter = element<HTMLSelectElement>("filter");
const baseMap = element<HTMLSelectElement>("base-map");
const terrain = element<HTMLSelectElement>("terrain");
const pointSize = element<HTMLInputElement>("point-size");
const pointSizeValue = element<HTMLSpanElement>("point-size-value");
const opacity = element<HTMLInputElement>("opacity");
const opacityValue = element<HTMLSpanElement>("opacity-value");
const sse = element<HTMLInputElement>("sse");
const sseValue = element<HTMLSpanElement>("sse-value");
const pointBudget = element<HTMLInputElement>("point-budget");
const pointBudgetValue = element<HTMLSpanElement>("point-budget-value");
const cameraHeading = element<HTMLInputElement>("camera-heading");
const cameraHeadingValue = element<HTMLSpanElement>("camera-heading-value");
const cameraPitch = element<HTMLInputElement>("camera-pitch");
const cameraPitchValue = element<HTMLSpanElement>("camera-pitch-value");
const edl = element<HTMLInputElement>("edl");
const visiblePoints = element<HTMLElement>("visible-points");
const visibleNodes = element<HTMLElement>("visible-nodes");
const network = element<HTMLElement>("network");
const networkTime = element<HTMLElement>("network-time");
const requests = element<HTMLElement>("requests");
const logicalRanges = element<HTMLElement>("logical-ranges");
const coalesced = element<HTMLElement>("coalesced");
const cacheHits = element<HTMLElement>("cache-hits");
const decodeTime = element<HTMLElement>("decode-time");
const buildTime = element<HTMLElement>("build-time");
const fpsOutput = element<HTMLElement>("fps");
const firstPointOutput = element<HTMLElement>("first-point");
const cameraFocus = element<HTMLElement>("camera-focus");
const cameraFocusLabel = element<HTMLElement>("camera-focus-label");
const detailFocus = element<HTMLElement>("detail-focus");
const streamingStatus = element<HTMLElement>("streaming-status");
const streamingStatusText = element<HTMLElement>("streaming-status-text");
const panel = element<HTMLElement>("controls-panel");
const panelHeader = panel.querySelector("header")!;
const panelBody = element<HTMLElement>("panel-body");
const panelToggle = element<HTMLButtonElement>("panel-toggle");
const panelScrim = element<HTMLElement>("panel-scrim");
const cameraTools = document.querySelector<HTMLElement>(".camera-tools")!;
const cameraAnglePanel = document.querySelector<HTMLElement>(".camera-angle-panel")!;
const cameraAngleSlot = element<HTMLElement>("camera-angle-slot");
// 좁은 화면에서 패널이 bottom sheet 로 바뀌는 조건. style.css 의 시트 미디어 쿼리와 같아야 한다.
const sheetQuery = window.matchMedia("(max-width: 640px), (max-height: 520px)");
urlInput.value = sampleUrl;
const initialDeviceTier = classifyDevice();
const initialDeviceBudget = budgetFor(initialDeviceTier);
// The library budgets are conservative defaults for embedded viewers. The demo is a
// detail explorer, so desktop tiers get enough headroom for zooming to request deeper
// COPC nodes while mobile devices retain the low-tier safety limit.
const initialPointBudget =
  initialDeviceTier === "low"
    ? initialDeviceBudget.pointBudget
    : Math.min(initialDeviceBudget.pointBudget * 3, Number(pointBudget.max));
pointBudget.value = String(initialPointBudget);
pointBudgetValue.textContent = `${(initialPointBudget / 1_000_000).toFixed(2)} M`;
sse.value = String(initialDeviceBudget.maximumScreenSpaceError);
sseValue.textContent = `${initialDeviceBudget.maximumScreenSpaceError.toFixed(
  initialDeviceBudget.maximumScreenSpaceError % 1 === 0 ? 0 : 2,
)} SSE`;

let layer: CopcPointCloud | undefined;
let loadStarted = 0;
let firstPointMilliseconds: number | undefined;
let frameCount = 0;
let fpsWindowStarted = performance.now();
let measuredFps = 0;
let lastDiagnosticsUpdate = 0;
let terrainMode: "ellipsoid" | "world" = "ellipsoid";
let terrainRequest = 0;
let spaceCameraActive = false;
let cameraPointerId: number | undefined;
let previousPointerX = 0;
let previousPointerY = 0;
let cameraOrbitPivot: Cartesian3 | undefined;
let cameraOrbitHeading = 0;
let cameraOrbitPitch = 0;
let cameraOrbitRange = 0;
let detailFocusTimer: ReturnType<typeof setTimeout> | undefined;
let streamingHideTimer: ReturnType<typeof setTimeout> | undefined;
let cameraMoving = false;
let cameraFocusNeedsDepthUpdate = true;
let previousLoadingNodes = 0;
let panelOpen = false;
let sheetDragPointerId: number | undefined;
let sheetDragStartY = 0;
let sheetDragOffset = 0;
let sheetDragged = false;
const screenCenter = new Cartesian2();
const pickedCenter = new Cartesian3();
const pivotTransform = new Matrix4();
const inversePivotTransform = new Matrix4();
const cameraOffset = new Cartesian3();
const localCameraOffset = new Cartesian3();

setBaseMap(baseMap.value);
syncSheetMode();
new ResizeObserver(updateSheetPeek).observe(panelHeader);
sheetQuery.addEventListener("change", syncSheetMode);

panelToggle.addEventListener("click", () => {
  // 드래그로 끝난 제스처는 endSheetDrag 가 이미 상태를 정했다.
  if (sheetDragged) {
    sheetDragged = false;
    return;
  }
  setPanelOpen(!panelOpen);
});
panelScrim.addEventListener("click", () => setPanelOpen(false));

panelToggle.addEventListener("pointerdown", (event) => {
  if (!sheetQuery.matches || event.button !== 0) return;
  sheetDragPointerId = event.pointerId;
  sheetDragStartY = event.clientY;
  sheetDragged = false;
  panelToggle.setPointerCapture(event.pointerId);
});

panelToggle.addEventListener("pointermove", (event) => {
  if (event.pointerId !== sheetDragPointerId) return;
  const delta = event.clientY - sheetDragStartY;
  // 짧게 흔들린 것은 탭으로 본다.
  if (!sheetDragged && Math.abs(delta) <= 4) return;
  sheetDragged = true;
  const collapsed = collapsedSheetOffset();
  sheetDragOffset = Math.min(Math.max((panelOpen ? 0 : collapsed) + delta, 0), collapsed);
  document.body.classList.add("panel-dragging");
  panel.style.transform = `translateY(${sheetDragOffset}px)`;
});

for (const eventName of ["pointerup", "pointercancel"] as const) {
  panelToggle.addEventListener(eventName, (event) => {
    if (event.pointerId !== sheetDragPointerId) return;
    sheetDragPointerId = undefined;
    if (!sheetDragged) return;
    document.body.classList.remove("panel-dragging");
    panel.style.transform = "";
    setPanelOpen(sheetDragOffset < collapsedSheetOffset() * 0.5);
  });
}

viewer.scene.canvas.addEventListener("pointermove", scheduleDetailFocus);
viewer.scene.canvas.addEventListener("pointerleave", resetDetailFocus);
viewer.scene.canvas.addEventListener("pointerdown", resetDetailFocus);
viewer.scene.canvas.addEventListener("wheel", resetDetailFocus, { passive: true });
viewer.camera.changed.addEventListener(() => {
  resetDetailFocus();
  cameraFocusNeedsDepthUpdate = true;
});
viewer.camera.moveStart.addEventListener(() => {
  cameraMoving = true;
  if (layer) layer.uploadTimeBudgetMilliseconds = movingUploadBudgetMilliseconds;
});
viewer.camera.moveEnd.addEventListener(() => {
  cameraMoving = false;
  if (layer) layer.uploadTimeBudgetMilliseconds = idleUploadBudgetMilliseconds;
  cameraFocusNeedsDepthUpdate = true;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && panelOpen) {
    setPanelOpen(false);
    panelToggle.focus();
    return;
  }
  if (event.code !== "Space" || event.repeat || isEditableTarget(event.target)) return;
  event.preventDefault();
  setSpaceCameraActive(true);
});

window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  event.preventDefault();
  setSpaceCameraActive(false);
});

window.addEventListener("blur", () => setSpaceCameraActive(false));

viewer.scene.canvas.addEventListener("pointerdown", (event) => {
  if (!spaceCameraActive || event.button !== 0) return;
  const pivot = centerCameraPivot();
  if (!pivot) return;
  event.preventDefault();
  const orbit = cameraOrbitFromPivot(pivot);
  cameraOrbitPivot = pivot;
  cameraOrbitHeading = orbit.heading;
  cameraOrbitPitch = orbit.pitch;
  cameraOrbitRange = orbit.range;
  cameraPointerId = event.pointerId;
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
  viewer.scene.canvas.setPointerCapture(event.pointerId);
});

viewer.scene.canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== cameraPointerId) return;
  event.preventDefault();
  const deltaX = event.clientX - previousPointerX;
  const deltaY = event.clientY - previousPointerY;
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
  const radiansPerPixel = 0.004;
  cameraOrbitHeading = CesiumMath.zeroToTwoPi(cameraOrbitHeading + deltaX * radiansPerPixel);
  cameraOrbitPitch = CesiumMath.clamp(
    cameraOrbitPitch - deltaY * radiansPerPixel,
    CesiumMath.toRadians(-85),
    CesiumMath.toRadians(-5),
  );
  applyCameraOrbit(cameraOrbitPivot!, cameraOrbitHeading, cameraOrbitPitch, cameraOrbitRange);
  syncCameraAngleControls();
});

for (const eventName of ["pointerup", "pointercancel"] as const) {
  viewer.scene.canvas.addEventListener(eventName, (event) => {
    if (event.pointerId === cameraPointerId) endSpaceCameraDrag();
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void load(urlInput.value);
});

color.addEventListener("change", () => {
  if (layer) layer.colorBy = color.value as CopcColorMode;
});

filter.addEventListener("change", () => {
  if (!layer) return;
  const classifications: Record<string, number[] | undefined> = {
    all: undefined,
    ground: [2],
    vegetation: [3, 4, 5],
    building: [6],
    water: [9],
  };
  const selected = classifications[filter.value];
  layer.filter = selected ? { classifications: selected } : undefined;
});

baseMap.addEventListener("change", () => setBaseMap(baseMap.value));

terrain.addEventListener("change", () => {
  void setTerrain(terrain.value as "ellipsoid" | "world");
});

pointSize.addEventListener("input", () => {
  pointSizeValue.textContent = `${pointSize.value} px`;
  if (layer) layer.pointSize = Number(pointSize.value);
});

opacity.addEventListener("input", () => {
  opacityValue.textContent = `${Math.round(Number(opacity.value) * 100)}%`;
  if (layer) layer.opacity = Number(opacity.value);
});

sse.addEventListener("input", () => {
  const value = Number(sse.value);
  sseValue.textContent = `${value.toFixed(value % 1 === 0 ? 0 : 2)} SSE`;
  if (layer) layer.maximumScreenSpaceError = value;
});

pointBudget.addEventListener("input", () => {
  const value = Number(pointBudget.value);
  pointBudgetValue.textContent = `${(value / 1_000_000).toFixed(2)} M`;
  if (layer) layer.pointBudget = value;
});

for (const input of [cameraHeading, cameraPitch]) {
  input.addEventListener("input", updateCameraAngleLabels);
  // Apply after the thumb is released to avoid unnecessary LOD request churn.
  input.addEventListener("change", applyCameraAngle);
}

edl.addEventListener("change", () => {
  eyeDomeLighting.enabled = edl.checked;
});

viewer.scene.postRender.addEventListener(() => {
  const now = performance.now();
  frameCount += 1;
  const fpsElapsed = now - fpsWindowStarted;
  if (fpsElapsed >= 500) {
    measuredFps = (frameCount * 1_000) / fpsElapsed;
    frameCount = 0;
    fpsWindowStarted = now;
  }
  if (now - lastDiagnosticsUpdate < 250) return;
  lastDiagnosticsUpdate = now;
  if (!layer) return;
  const stats = layer.statistics;
  if (firstPointMilliseconds === undefined && stats.visiblePoints > 0) {
    firstPointMilliseconds = now - loadStarted;
  }
  visiblePoints.textContent = stats.visiblePoints.toLocaleString();
  visibleNodes.textContent = stats.visibleNodes.toLocaleString();
  network.textContent = formatBytes(stats.networkBytes);
  networkTime.textContent = `${stats.networkMilliseconds.toFixed(0)} ms`;
  requests.textContent = stats.networkRequests.toLocaleString();
  logicalRanges.textContent = stats.logicalRangeRequests.toLocaleString();
  coalesced.textContent = stats.coalescedRangeRequests.toLocaleString();
  cacheHits.textContent = (stats.rangeCacheHits + stats.persistentRangeCacheHits).toLocaleString();
  decodeTime.textContent = `${stats.workerDecodeMilliseconds.toFixed(0)} ms`;
  buildTime.textContent = `${stats.mainThreadBuildMilliseconds.toFixed(0)} ms`;
  fpsOutput.textContent = measuredFps.toFixed(0);
  firstPointOutput.textContent =
    firstPointMilliseconds === undefined ? "—" : `${firstPointMilliseconds.toFixed(0)} ms`;
  if (previousLoadingNodes > 0 && stats.loadingNodes === 0) {
    cameraFocusNeedsDepthUpdate = true;
  }
  previousLoadingNodes = stats.loadingNodes;
  updateStreamingStatus(stats.loadingNodes);
  updateCameraFocusTarget(!cameraMoving && cameraFocusNeedsDepthUpdate);
  if (layer.lastError) status.textContent = errorMessage(layer.lastError);
});

function scheduleDetailFocus(event: PointerEvent): void {
  if (event.buttons !== 0 || event.pointerId === cameraPointerId || !layer) {
    resetDetailFocus();
    return;
  }
  if (detailFocusTimer !== undefined) clearTimeout(detailFocusTimer);
  const clientX = event.clientX;
  const clientY = event.clientY;
  detailFocusTimer = setTimeout(() => {
    detailFocusTimer = undefined;
    if (!layer) return;
    const canvasBounds = viewer.scene.canvas.getBoundingClientRect();
    const windowPosition = new Cartesian2(clientX - canvasBounds.left, clientY - canvasBounds.top);
    const ray = viewer.camera.getPickRay(windowPosition);
    if (!ray) return;
    layer.setDetailFocus(ray.direction);
    detailFocus.style.left = `${clientX}px`;
    detailFocus.style.top = `${clientY}px`;
    detailFocus.classList.add("active");
    document.body.classList.add("detail-focus-active");
  }, 400);
}

function resetDetailFocus(): void {
  if (detailFocusTimer !== undefined) {
    clearTimeout(detailFocusTimer);
    detailFocusTimer = undefined;
  }
  detailFocus.classList.remove("active");
  document.body.classList.remove("detail-focus-active");
  layer?.setDetailFocus();
}

function updateStreamingStatus(loadingNodes: number): void {
  cameraFocus.classList.toggle("refining", loadingNodes > 0);
  if (loadingNodes > 0) {
    if (streamingHideTimer !== undefined) {
      clearTimeout(streamingHideTimer);
      streamingHideTimer = undefined;
    }
    streamingStatus.hidden = false;
    streamingStatusText.textContent = `Refining view · ${loadingNodes.toLocaleString()} nodes`;
  } else if (!streamingStatus.hidden && streamingHideTimer === undefined) {
    streamingHideTimer = setTimeout(() => {
      streamingHideTimer = undefined;
      streamingStatus.hidden = true;
    }, 500);
  }
}

function updateCameraFocusTarget(useDepth: boolean): void {
  const target = centerSurfacePoint(useDepth);
  if (useDepth) cameraFocusNeedsDepthUpdate = false;
  cameraFocus.classList.toggle("has-target", target !== undefined);
  if (!target) {
    cameraFocusLabel.textContent = "";
    return;
  }
  const distance = Cartesian3.distance(viewer.camera.positionWC, target);
  cameraFocusLabel.textContent = `FOCUS · ${formatDistance(distance)}`;
}

viewer.screenSpaceEventHandler.setInputAction(
  ((movement: { position: Parameters<CopcPointCloud["pick"]>[1] }) => {
    const point = layer?.pick(viewer.scene, movement.position);
    if (!point) return;
    void reportPickedPoint(point);
  }) as ScreenSpaceEventHandler.PositionedEventCallback,
  ScreenSpaceEventType.LEFT_CLICK,
);

function setPanelOpen(open: boolean): void {
  panelOpen = open;
  document.body.classList.toggle("panel-open", open);
  panelToggle.setAttribute("aria-expanded", String(open));
  panelToggle.setAttribute("aria-label", open ? "컨트롤 패널 닫기" : "컨트롤 패널 열기");
  syncPanelInert();
}

function syncPanelInert(): void {
  // 접힌 시트의 본문은 화면 밖에 있으므로 탭 순서와 접근성 트리에서 뺀다.
  panelBody.inert = sheetQuery.matches && !panelOpen;
}

function syncSheetMode(): void {
  const sheet = sheetQuery.matches;
  // 시트에서는 떠 있는 카메라 카드를 쓸 수 없으므로 각도 슬라이더를 시트 안으로 옮긴다.
  const host = sheet ? cameraAngleSlot : cameraTools;
  if (cameraAnglePanel.parentElement !== host) host.append(cameraAnglePanel);
  if (!sheet) setPanelOpen(false);
  else syncPanelInert();
  updateSheetPeek();
}

function collapsedSheetOffset(): number {
  // 접힌 시트가 아래로 내려가 있는 거리. 드래그 진행률의 기준이 된다.
  return Math.max(panel.offsetHeight - panelHeader.offsetHeight, 0);
}

function updateSheetPeek(): void {
  if (!sheetQuery.matches) return;
  // 접힌 시트가 남겨 둘 높이는 헤더 높이와 같다. 제목 줄바꿈에 따라 달라지므로 측정한다.
  const peek = Math.round(panelHeader.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--sheet-peek", `${peek}px`);
}

function setBaseMap(value: string): void {
  viewer.imageryLayers.removeAll();
  if (value === "osm") {
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
        maximumLevel: 19,
      }),
    );
  }
  viewer.scene.requestRender();
}

function setSpaceCameraActive(active: boolean): void {
  spaceCameraActive = active;
  // Normal drag moves the globe. While Space is held, our pointer handler
  // changes only camera heading/pitch at the current position.
  viewer.scene.screenSpaceCameraController.enableRotate = !active;
  if (!active) endSpaceCameraDrag();
  document.body.classList.toggle("space-camera", active);
}

function endSpaceCameraDrag(): void {
  if (cameraPointerId !== undefined && viewer.scene.canvas.hasPointerCapture(cameraPointerId)) {
    viewer.scene.canvas.releasePointerCapture(cameraPointerId);
  }
  cameraPointerId = undefined;
  cameraOrbitPivot = undefined;
}

function syncCameraAngleControls(): void {
  cameraHeading.value = String(Math.round(CesiumMath.toDegrees(viewer.camera.heading)) % 360);
  cameraPitch.value = String(Math.round(CesiumMath.toDegrees(viewer.camera.pitch)));
  updateCameraAngleLabels();
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    // 버튼은 Space 로 눌러야 하므로 카메라 조작에 키를 뺏기면 안 된다.
    target instanceof HTMLButtonElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function updateCameraAngleLabels(): void {
  cameraHeadingValue.textContent = `${cameraHeading.value}°`;
  cameraPitchValue.textContent = `${cameraPitch.value}°`;
}

function applyCameraAngle(): void {
  if (!layer) return;
  const pivot = centerCameraPivot() ?? layer.boundingSphere.center;
  const range = Math.max(Cartesian3.distance(viewer.camera.positionWC, pivot), 1);
  applyCameraOrbit(
    pivot,
    CesiumMath.toRadians(Number(cameraHeading.value)),
    CesiumMath.toRadians(Number(cameraPitch.value)),
    range,
  );
}

function applyCameraOrbit(pivot: Cartesian3, heading: number, pitch: number, range: number): void {
  viewer.camera.lookAt(pivot, new HeadingPitchRange(heading, pitch, range));
  // lookAt switches the camera into a target-relative reference frame. Restore
  // world coordinates without changing the pose so regular pan/orbit controls
  // remain available after applying the sliders.
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
}

function centerCameraPivot(): Cartesian3 | undefined {
  return (
    centerSurfacePoint() ?? (layer ? Cartesian3.clone(layer.boundingSphere.center) : undefined)
  );
}

function centerSurfacePoint(useDepth = true): Cartesian3 | undefined {
  const canvas = viewer.scene.canvas;
  screenCenter.x = canvas.clientWidth * 0.5;
  screenCenter.y = canvas.clientHeight * 0.5;

  if (useDepth && viewer.scene.pickPositionSupported) {
    const position = viewer.scene.pickPosition(screenCenter, pickedCenter);
    if (position) return Cartesian3.clone(position);
  }

  const ray = viewer.camera.getPickRay(screenCenter);
  if (ray) {
    const position = viewer.scene.globe.pick(ray, viewer.scene, pickedCenter);
    if (position) return Cartesian3.clone(position);
  }
  return undefined;
}

function cameraOrbitFromPivot(pivot: Cartesian3): HeadingPitchRange {
  const transform = Transforms.eastNorthUpToFixedFrame(pivot, undefined, pivotTransform);
  Matrix4.inverseTransformation(transform, inversePivotTransform);
  Cartesian3.subtract(viewer.camera.positionWC, pivot, cameraOffset);
  Matrix4.multiplyByPointAsVector(inversePivotTransform, cameraOffset, localCameraOffset);
  const range = Math.max(Cartesian3.magnitude(localCameraOffset), 1);
  const pitch = Math.asin(CesiumMath.clamp(-localCameraOffset.z / range, -1, 1));
  const heading = CesiumMath.zeroToTwoPi(Math.atan2(-localCameraOffset.x, -localCameraOffset.y));
  return new HeadingPitchRange(heading, pitch, range);
}

async function setTerrain(value: "ellipsoid" | "world"): Promise<void> {
  const request = ++terrainRequest;
  terrain.disabled = true;
  try {
    if (value === "world") {
      status.textContent = "Loading Cesium World Terrain…";
      const provider = await createWorldTerrainAsync({ requestVertexNormals: true });
      if (request !== terrainRequest) return;
      viewer.terrainProvider = provider;
      viewer.scene.globe.enableLighting = true;
    } else {
      viewer.terrainProvider = new EllipsoidTerrainProvider();
      viewer.scene.globe.enableLighting = false;
    }
    terrainMode = value;
    let terrainStatus =
      value === "world"
        ? "Cesium World Terrain enabled"
        : "WGS84 ellipsoid h=0 reference enabled (no physical terrain)";
    if (value === "world" && layer) {
      const center = Cartographic.fromCartesian(layer.boundingSphere.center);
      const sampled = (await sampleTerrainMostDetailed(viewer.terrainProvider, [center]))[0];
      if (sampled?.height !== undefined) {
        terrainStatus += ` · center surface ${sampled.height.toFixed(2)} m`;
      }
    }
    status.textContent = terrainStatus;
    if (layer) void focusLayer(0.8);
  } catch (error) {
    if (request !== terrainRequest) return;
    terrain.value = "ellipsoid";
    terrainMode = "ellipsoid";
    viewer.terrainProvider = new EllipsoidTerrainProvider();
    status.textContent = `Terrain unavailable: ${errorMessage(error)}`;
  } finally {
    if (request === terrainRequest) terrain.disabled = false;
  }
}

async function reportPickedPoint(
  point: NonNullable<ReturnType<CopcPointCloud["pick"]>>,
): Promise<void> {
  const classification = point.attributes.Classification ?? "—";
  status.textContent = `${point.node} · point ${point.height.toFixed(2)} m · sampling surface…`;
  try {
    const surfaceHeight =
      terrainMode === "world"
        ? (
            await sampleTerrainMostDetailed(viewer.terrainProvider, [
              Cartographic.fromDegrees(point.longitude, point.latitude),
            ])
          )[0]?.height
        : 0;
    const comparison =
      surfaceHeight === undefined
        ? "surface unavailable"
        : `surface ${surfaceHeight.toFixed(2)} m · Δ ${(point.height - surfaceHeight).toFixed(2)} m`;
    status.textContent = `${point.node} · point ${point.height.toFixed(2)} m · ${comparison} · class ${classification}`;
  } catch (error) {
    status.textContent = `${point.node} · point ${point.height.toFixed(2)} m · ${errorMessage(error)}`;
  }
}

async function load(url: string): Promise<void> {
  resetDetailFocus();
  if (streamingHideTimer !== undefined) {
    clearTimeout(streamingHideTimer);
    streamingHideTimer = undefined;
  }
  streamingStatus.hidden = true;
  cameraFocus.classList.remove("refining");
  cameraFocus.classList.remove("has-target");
  cameraFocusLabel.textContent = "";
  cameraFocusNeedsDepthUpdate = true;
  previousLoadingNodes = 0;
  loadStarted = performance.now();
  firstPointMilliseconds = undefined;
  firstPointOutput.textContent = "—";
  status.textContent = "Checking byte-range support…";
  setBusy(true);
  try {
    const diagnosis = await CopcPointCloud.validateUrl(url);
    if (!diagnosis.supportsRanges) throw new Error("The server does not support HTTP byte ranges.");
    if (!diagnosis.copcValid)
      throw new Error(diagnosis.error ?? "The URL is not a valid COPC file.");
    if (layer) {
      viewer.scene.primitives.remove(layer);
      layer = undefined;
    }
    status.textContent = `Opening ${formatBytes(diagnosis.contentLength ?? 0)} COPC…`;
    layer = await CopcPointCloud.fromUrl(url, {
      pointBudget: Number(pointBudget.value),
      // Request the next LOD slightly before the current level becomes visibly
      // coarse so zooming has useful work already in flight.
      maximumScreenSpaceError: Number(sse.value),
      requestConcurrency: 8,
      uploadTimeBudgetMilliseconds: cameraMoving
        ? movingUploadBudgetMilliseconds
        : idleUploadBudgetMilliseconds,
      cacheSize: 384 * 1024 * 1024,
      decodedCacheSize: 576 * 1024 * 1024,
      range: {
        compressedCacheSize: 128 * 1024 * 1024,
        ...(persistentCache === undefined ? {} : { persistentCache }),
      },
      pointSize: Number(pointSize.value),
      opacity: Number(opacity.value),
      colorBy: color.value as CopcColorMode,
    });
    viewer.scene.primitives.add(layer);
    await focusLayer(1.2);
    status.textContent = "Streaming visible nodes";
  } catch (error) {
    status.textContent = errorMessage(error);
  } finally {
    setBusy(false);
  }
}

function focusLayer(duration: number): void {
  if (!layer) return;
  viewer.camera.flyToBoundingSphere(layer.boundingSphere, {
    duration,
    offset: new HeadingPitchRange(
      CesiumMath.toRadians(Number(cameraHeading.value)),
      CesiumMath.toRadians(Number(cameraPitch.value)),
      0,
    ),
  });
}

function setBusy(busy: boolean): void {
  const button = form.querySelector("button")!;
  button.disabled = busy;
  button.textContent = busy ? "Loading…" : "Load";
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element #${id}`);
  return value as T;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDistance(meters: number): string {
  if (meters < 1_000) return `${meters.toFixed(meters < 10 ? 1 : 0)} m`;
  return `${(meters / 1_000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void load(sampleUrl);
