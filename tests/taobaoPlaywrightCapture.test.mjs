import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCapturePayload,
  parseCaptureArgs,
  validateItemDetailPayload
} from "../scripts/taobao_playwright_capture.mjs";

describe("Taobao Playwright item-detail capture script", () => {
  it("requires a valid Taobao or Tmall item URL", () => {
    expect(() => parseCaptureArgs([])).toThrow(/--url/);
    expect(() => parseCaptureArgs(["--url", "https://example.com/item.htm?id=1"])).toThrow(/Taobao|Tmall|淘宝|天猫/i);
  });

  it("uses default login wait, output directory, and Playwright profile", () => {
    const args = parseCaptureArgs(["--url", "https://item.taobao.com/item.htm?id=808"]);

    expect(args).toMatchObject({
      url: "https://item.taobao.com/item.htm?id=808",
      loginWait: 60,
      outputDir: path.join("output", "taobao-captures"),
      profileDir: path.join("output", "playwright-taobao-profile")
    });
  });

  it("builds an Outfit-compatible TaobaoCapturedBatch from a product snapshot", () => {
    const payload = buildCapturePayload({
      url: "https://item.taobao.com/item.htm?id=1018415883889",
      title: "淘宝网 - 淘宝",
      metaTitles: ["蓝色透气运动鞋 夏季 轻便跑步休闲鞋"],
      bodyText: "商品参数\n品牌: TANZ\n颜色分类: 蓝色\n商品详情\n夏季透气跑步休闲鞋。",
      images: ["//img.alicdn.com/main.jpg"],
      scripts: [
        `window.__ITEM_DETAIL__ = {
          "itemTitle": "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
          "description": "<p>夏季透气跑步休闲鞋。</p>",
          "name": "鞋面材质",
          "value": "网布",
          "picUrl": "//img.alicdn.com/detail.jpg"
        };`
      ]
    }, "2026-06-21T06:00:00.000Z");

    expect(payload).toMatchObject({
      source: "taobao-playwright-item-detail",
      pageType: "item-detail",
      capturedAt: "2026-06-21T06:00:00.000Z",
      pageUrl: "https://item.taobao.com/item.htm?id=1018415883889"
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      pageType: "item-detail",
      itemId: "1018415883889",
      detailUrl: "https://item.taobao.com/item.htm?id=1018415883889",
      detailTitle: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
      detailProps: [
        { name: "鞋面材质", value: "网布" },
        { name: "品牌", value: "TANZ" },
        { name: "颜色分类", value: "蓝色" }
      ],
      detailDescription: "夏季透气跑步休闲鞋。",
      detailImages: ["https://img.alicdn.com/detail.jpg", "https://img.alicdn.com/main.jpg"]
    });
    expect(payload.items[0].detailRawText).toContain("蓝色透气运动鞋");
  });

  it("rejects login, risk-control, empty-shell, and no-title captures", () => {
    expect(() => validateItemDetailPayload(buildCapturePayload({
      url: "https://item.taobao.com/item.htm?id=808",
      title: "登录页面",
      bodyText: "扫码登录 手机扫码登录 密码登录",
      images: [],
      scripts: []
    }))).toThrow(/login/i);

    expect(() => validateItemDetailPayload(buildCapturePayload({
      url: "https://sec.taobao.com/query.htm?id=808",
      title: "安全验证",
      bodyText: "安全验证 拖动滑块 验证身份",
      images: [],
      scripts: []
    }))).toThrow(/risk|captcha|verification/i);

    expect(() => validateItemDetailPayload(buildCapturePayload({
      url: "https://item.taobao.com/item.htm?id=808",
      title: "淘宝网 - 淘宝",
      bodyText: "淘宝网首页 购物车 收藏夹 帮助中心 登录 注册",
      images: [],
      scripts: []
    }))).toThrow(/empty shell/i);

    expect(() => validateItemDetailPayload({
      source: "taobao-playwright-item-detail",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=808",
      items: [{
        pageType: "item-detail",
        itemId: "808",
        detailUrl: "https://item.taobao.com/item.htm?id=808",
        detailTitle: "",
        detailProps: [{ name: "品牌", value: "UTIMUS" }],
        detailDescription: "夏季透气短袖。",
        detailImages: ["https://img.alicdn.com/example.jpg"],
        detailRawText: "夏季透气短袖。"
      }]
    })).toThrow(/title/i);
  });
});
