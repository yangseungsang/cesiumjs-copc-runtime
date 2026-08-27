import { expect, test, type Page } from "@playwright/test";

const viewport = { width: 390, height: 664 };

test.use({ viewport, hasTouch: true, isMobile: true });

/** 시트 상단이 뷰포트에서 차지하는 위치. 접히면 아래쪽, 펼치면 위쪽에 있다. */
async function sheetTop(page: Page): Promise<number> {
  const box = await page.locator("#controls-panel").boundingBox();
  expect(box).not.toBeNull();
  return box!.y;
}

test.describe("모바일 bottom sheet", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#cesium canvas")).toBeVisible();
  });

  test("접힌 상태에서 3D 뷰를 가리지 않는다", async ({ page }) => {
    // 헤더만 남기므로 뷰포트 대부분이 뷰어에 남아야 한다.
    expect(await sheetTop(page)).toBeGreaterThan(viewport.height * 0.75);
    await expect(page.locator("#panel-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#panel-body")).toHaveJSProperty("inert", true);
  });

  test("손잡이를 탭하면 펼쳐지고 다시 탭하면 접힌다", async ({ page }) => {
    await page.locator("#panel-toggle").tap();
    await expect(page.locator("#panel-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#panel-body")).toHaveJSProperty("inert", false);
    expect(await sheetTop(page)).toBeLessThan(viewport.height * 0.25);
    await expect(page.getByLabel("COPC URL")).toBeVisible();

    await page.locator("#panel-toggle").tap();
    await expect(page.locator("#panel-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(await sheetTop(page)).toBeGreaterThan(viewport.height * 0.75);
  });

  test("스크림 탭과 Esc 로 닫힌다", async ({ page }) => {
    await page.locator("#panel-toggle").tap();
    await expect(page.locator("#panel-toggle")).toHaveAttribute("aria-expanded", "true");
    await page.locator("#panel-scrim").tap({ position: { x: 195, y: 40 } });
    await expect(page.locator("#panel-toggle")).toHaveAttribute("aria-expanded", "false");

    await page.locator("#panel-toggle").tap();
    await expect(page.locator("#panel-toggle")).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator("#panel-toggle")).toHaveAttribute("aria-expanded", "false");
  });

  test("손잡이를 위로 끌면 펼쳐진다", async ({ page }) => {
    await page.mouse.move(195, viewport.height - 40);
    await page.mouse.down();
    for (let y = viewport.height - 40; y >= 300; y -= 40) await page.mouse.move(195, y);
    await page.mouse.up();

    await expect(page.locator("#panel-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(await sheetTop(page)).toBeLessThan(viewport.height * 0.25);
  });

  test("떠 있는 카메라 카드 대신 시트 안에서 각도를 조절한다", async ({ page }) => {
    await expect(page.locator(".camera-tools")).toBeHidden();
    await expect(page.locator("#camera-angle-slot #camera-heading")).toHaveCount(1);
    await expect(page.locator("#camera-angle-slot #camera-pitch")).toHaveCount(1);
  });
});

test.describe("데스크톱 레이아웃", () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

  test("시트로 바뀌지 않고 카메라 카드가 그대로 뜬다", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#cesium canvas")).toBeVisible();
    expect(await sheetTop(page)).toBeLessThan(100);
    await expect(page.locator("#panel-toggle")).toBeHidden();
    await expect(page.locator(".camera-tools .camera-angle-panel")).toBeVisible();
    await expect(page.locator("#camera-angle-slot")).toBeEmpty();
  });
});
