import { describe, expect, it } from "vitest";
import { captureTaobaoPage, getTaobaoBookmarklet } from "../src/bookmarklet/taobaoBookmarklet";

describe("getTaobaoBookmarklet", () => {
  it("returns a javascript self-invoking bookmarklet", () => {
    const bookmarklet = getTaobaoBookmarklet();

    expect(bookmarklet.startsWith("javascript:")).toBe(true);
    expect(bookmarklet).toContain("(()=>{");
    expect(bookmarklet).toContain("})();");
  });

  it("includes the Taobao capture payload shape and item fields", () => {
    const bookmarklet = getTaobaoBookmarklet();
    const decoded = decodeURIComponent(bookmarklet.slice("javascript:".length));

    expect(decoded).toContain('source:"taobao-bookmarklet"');
    expect(decoded).toContain("capturedAt");
    expect(decoded).toContain("pageUrl");
    expect(decoded).toContain("items");

    for (const field of [
      "pageType",
      "itemId",
      "orderId",
      "orderTime",
      "title",
      "sku",
      "quantity",
      "payment",
      "status",
      "refundText",
      "itemUrl",
      "imageUrl",
      "rawText",
      "detailUrl",
      "detailTitle",
      "detailProps",
      "detailDescription",
      "detailImages",
      "detailRawText"
    ]) {
      expect(decoded).toContain(`${field}:`);
    }
    expect(decoded).toContain("document.scripts");
    expect(decoded).toContain("scriptData");
  });

  it("captures one rich item from a product detail page fixture", () => {
    const payload = captureTaobaoPage({
      href: "https://item.taobao.com/item.htm?id=1018415883889",
      title: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
      bodyText: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋\n商品参数\n品牌 TANZ\n颜色分类 蓝色\n鞋面材质 网布\n商品详情\n夏季透气，适合通勤和跑步。",
      images: [
        { src: "https://img.alicdn.com/main.jpg", alt: "蓝色透气运动鞋" },
        { src: "https://img.alicdn.com/detail.jpg", alt: "" }
      ],
      props: [
        { name: "品牌", value: "TANZ" },
        { name: "颜色分类", value: "蓝色" },
        { name: "鞋面材质", value: "网布" }
      ],
      links: []
    });

    expect(payload).toMatchObject({
      source: "taobao-bookmarklet",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=1018415883889"
    });
    const items = payload.items ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      pageType: "item-detail",
      itemId: "1018415883889",
      detailUrl: "https://item.taobao.com/item.htm?id=1018415883889",
      detailTitle: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
      detailProps: [
        { name: "品牌", value: "TANZ" },
        { name: "颜色分类", value: "蓝色" },
        { name: "鞋面材质", value: "网布" }
      ],
      detailImages: ["https://img.alicdn.com/main.jpg", "https://img.alicdn.com/detail.jpg"]
    });
    expect(items[0].detailRawText).toContain("商品参数");
    expect(items[0].detailDescription).toContain("夏季透气");
  });

  it("extracts product detail data from inline Taobao state when visible text is mostly navigation", () => {
    const payload = captureTaobaoPage({
      href: "https://item.taobao.com/item.htm?id=1018415883889&mi_id=0000oyhC1F3JLTafdCbmCAahR1vEjNT5Qt2A-aPf8y6V6U4",
      title: "淘宝网 - 淘宝",
      bodyText: "svader\n淘宝网首页\n购物车30\n帮助中心\n进店",
      images: [{ src: "https://img.alicdn.com/tfs/nav.png", alt: "" }],
      scripts: [
        `window.__ITEM_DETAIL__ = {
          "itemId": "1018415883889",
          "title": "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
          "props": [
            { "name": "品牌", "value": "UTIMUS" },
            { "name": "材质成分", "value": "棉100%" }
          ],
          "images": ["//img.alicdn.com/imgextra/i1/1018415883889/O1CN01detail.jpg"],
          "description": "液氨纯棉，抗皱透气。"
        };`
      ]
    } as Parameters<typeof captureTaobaoPage>[0] & { scripts: string[] });

    const item = payload.items?.[0];
    expect(item).toMatchObject({
      pageType: "item-detail",
      itemId: "1018415883889",
      detailTitle: "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣"
    });
    expect(item?.detailProps).toEqual([
      { name: "品牌", value: "UTIMUS" },
      { name: "材质成分", value: "棉100%" }
    ]);
    expect(item?.detailImages).toContain("https://img.alicdn.com/imgextra/i1/1018415883889/O1CN01detail.jpg");
    expect(item?.detailDescription).toContain("液氨纯棉");
    expect(item?.detailRawText).toContain("UTIMUS/宗师tee01");
  });

  it("copies JSON to the clipboard when possible and falls back to prompt", () => {
    const decoded = decodeURIComponent(
      getTaobaoBookmarklet().slice("javascript:".length)
    );

    expect(decoded).toContain("navigator.clipboard.writeText");
    expect(decoded).toContain("prompt(");
    expect(decoded).toContain("JSON.stringify");
  });

  it("does not read cookies or browser credential storage", () => {
    const decoded = decodeURIComponent(
      getTaobaoBookmarklet().slice("javascript:".length)
    );

    expect(decoded).not.toContain("document.cookie");
    expect(decoded).not.toContain("localStorage");
    expect(decoded).not.toContain("sessionStorage");
  });
});
