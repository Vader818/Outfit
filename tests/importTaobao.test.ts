import { describe, expect, it, vi } from "vitest";
import {
  computeLegacyTaobaoSourceItemKey,
  computeTaobaoSourceItemKey,
  filterTaobaoBatchForWardrobe,
  isTrustedProductImage,
  normalizeTaobaoBatch
} from "../server/services/importTaobao";
import { ValidationError } from "../server/validation";

describe("normalizeTaobaoBatch", () => {
  it("recognizes the English refund markers emitted by the Selenium order collector", () => {
    const normalized = normalizeTaobaoBatch({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [{
        orderId: "english-refund",
        itemId: "refund-1001",
        title: "Blue straight jeans",
        status: "Completed",
        refundText: "Refund successful",
        rawText: "Blue straight jeans Refund successful"
      }]
    });

    expect(normalized.summary.skippedRefunded).toBe(1);
    expect(normalized.summary.createdGarments).toBe(0);
    expect(normalized.sourceItems[0]?.isRefunded).toBe(true);
  });

  it("preserves whether quantity and payment were explicitly captured", () => {
    const normalized = normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      pageType: "order-list",
      items: [{
        orderId: "missing-quantity",
        title: "白色纯棉衬衫",
        payment: "129.00"
      }, {
        orderId: "explicit-one",
        title: "黑色羊毛外套",
        quantity: 1,
        payment: 0
      }]
    });

    expect(normalized.sourceItems.map((item) => ({
      orderId: item.orderId,
      quantity: item.quantity,
      payment: item.payment,
      quantityExplicit: item.quantityExplicit,
      paymentExplicit: item.paymentExplicit
    }))).toEqual([{
      orderId: "missing-quantity",
      quantity: 1,
      payment: 129,
      quantityExplicit: false,
      paymentExplicit: true
    }, {
      orderId: "explicit-one",
      quantity: 1,
      payment: 0,
      quantityExplicit: true,
      paymentExplicit: true
    }]);
  });

  it("prefers explicit quantity evidence when duplicate captures are merged", () => {
    const normalized = normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      pageType: "order-list",
      items: [{
        orderId: "merge-quantity",
        itemId: "merge-1001",
        title: "蓝色直筒牛仔裤"
      }, {
        orderId: "merge-quantity",
        itemId: "merge-1001",
        title: "蓝色直筒牛仔裤",
        quantity: 2,
        payment: "199.00"
      }]
    });

    expect(normalized.sourceItems).toHaveLength(1);
    expect(normalized.sourceItems[0]).toMatchObject({
      quantity: 2,
      payment: 199,
      quantityExplicit: true,
      paymentExplicit: true
    });
  });

  it("does not turn a missing quantity into explicit quantity in wardrobe-filtered artifacts", () => {
    const filtered = filterTaobaoBatchForWardrobe({
      source: "taobao-bookmarklet",
      pageType: "order-list",
      items: [{
        orderId: "filtered-missing-quantity",
        title: "白色纯棉衬衫",
        payment: "129.00"
      }]
    });

    expect(filtered.payload.items).toHaveLength(1);
    expect(filtered.payload.items?.[0]).not.toHaveProperty("quantity");
    expect(filtered.payload.items?.[0]).toMatchObject({ payment: 129 });
  });

  it("uses a versioned order identity while exposing the legacy key for database compatibility", () => {
    const sharedItem = {
      pageType: "order-list" as const,
      itemId: "303",
      title: "纯棉短袖T恤",
      sku: "颜色分类: 黑色; 尺码: M",
      status: "交易成功",
      itemUrl: "https://item.taobao.com/item.htm?id=303"
    };
    const first = { ...sharedItem, orderId: "order-001" };
    const second = { ...sharedItem, orderId: "order-002" };

    expect(computeTaobaoSourceItemKey(first)).toMatch(/^v2:[a-f0-9]{64}$/);
    expect(computeTaobaoSourceItemKey(first)).not.toBe(computeTaobaoSourceItemKey(second));
    expect(computeLegacyTaobaoSourceItemKey(first)).toBe(computeLegacyTaobaoSourceItemKey(second));

    const normalized = normalizeTaobaoBatch({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [first, second]
    });
    expect(normalized.sourceItems).toHaveLength(2);
    expect(new Set(normalized.sourceItems.map((item) => item.externalKey)).size).toBe(2);
  });

  it("canonicalizes SKU punctuation, whitespace, case, and property order for source identities", () => {
    const first = computeTaobaoSourceItemKey({
      pageType: "order-list",
      orderId: "ORDER-001",
      itemId: "303",
      sku: "颜色分类： 黑色； 尺码： M"
    });
    const second = computeTaobaoSourceItemKey({
      pageType: "order-list",
      orderId: "order-001",
      itemId: "303",
      sku: " 尺码: m ; 颜色分类:黑色 "
    });

    expect(first).toBe(second);
  });

  it("builds a deterministic order-independent batch id without a capturedAt value", () => {
    const items = [
      {
        pageType: "order-list" as const,
        orderId: "order-001",
        itemId: "401",
        title: "白色纯棉短袖T恤",
        sku: "颜色分类: 白色; 尺码: M",
        status: "交易成功"
      },
      {
        pageType: "order-list" as const,
        orderId: "order-002",
        itemId: "402",
        title: "黑色直筒牛仔裤",
        sku: "颜色分类: 黑色; 尺码: 30",
        status: "交易成功"
      }
    ];

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-11T01:00:00.000Z"));
      const first = normalizeTaobaoBatch({ source: "taobao-selenium-order-list", items });
      vi.setSystemTime(new Date("2026-07-12T01:00:00.000Z"));
      const reordered = normalizeTaobaoBatch({ source: "taobao-selenium-order-list", items: [...items].reverse() });
      const changed = normalizeTaobaoBatch({
        source: "taobao-selenium-order-list",
        items: [{ ...items[0], status: "卖家已发货" }, items[1]]
      });

      expect(first.batchId).toBe(reordered.batchId);
      expect(first.batchId).not.toBe(changed.batchId);
    } finally {
      vi.useRealTimers();
    }
  });

  it("merges a detail capture into every purchased SKU regardless of input order", () => {
    const black = {
      pageType: "order-list" as const,
      orderId: "order-black",
      itemId: "505",
      title: "纯棉短袖T恤",
      sku: "颜色分类: 黑色; 尺码: M",
      status: "交易成功"
    };
    const white = {
      pageType: "order-list" as const,
      orderId: "order-white",
      itemId: "505",
      title: "纯棉短袖T恤",
      sku: "颜色分类: 白色; 尺码: M",
      status: "交易成功"
    };
    const detail = {
      pageType: "item-detail" as const,
      itemId: "505",
      detailTitle: "UTIMUS/液氨纯棉短袖T恤夏季透气上衣",
      detailProps: [{ name: "品牌", value: "UTIMUS" }],
      detailImages: ["https://img.alicdn.com/detail-tee.jpg"]
    };

    for (const items of [[detail, black, white], [black, white, detail]]) {
      const normalized = normalizeTaobaoBatch({ source: "taobao-selenium", items });
      expect(normalized.sourceItems).toHaveLength(2);
      expect(normalized.sourceItems.every((item) => item.detailTitle === detail.detailTitle)).toBe(true);
      expect(normalized.sourceItems.every((item) => item.detailImages[0] === detail.detailImages[0])).toBe(true);
    }
  });

  it("keeps refunded events in wardrobe-filtered artifacts for database-aware preview", () => {
    const result = filterTaobaoBatchForWardrobe({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        {
          orderId: "order-active",
          itemId: "601",
          title: "白色纯棉短袖T恤",
          status: "交易成功"
        },
        {
          orderId: "order-refunded",
          itemId: "602",
          title: "黑色直筒牛仔裤",
          status: "退款成功",
          refundText: "退款成功"
        },
        {
          orderId: "order-non-apparel",
          itemId: "603",
          title: "手机壳保护套",
          status: "交易成功"
        }
      ]
    });

    expect(result.payload.items).toHaveLength(2);
    expect(result.payload.items?.some((item) => item.orderId === "order-refunded" && item.refundText === "退款成功")).toBe(true);
    expect(result.filterSummary).toEqual({
      originalItems: 3,
      keptItems: 2,
      skippedRefunded: 0,
      skippedNonApparel: 1
    });
  });

  it("rejects import batches with too many items", () => {
    expect(() => normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      items: Array.from({ length: 1001 }, (_, index) => ({
        itemId: String(index),
        title: "白色衬衫",
        status: "交易成功"
      }))
    })).toThrow(/items/);
  });

  it("rejects captured item text fields that exceed import limits", () => {
    expect(() => normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      items: [
        {
          itemId: "too-long",
          title: "白色衬衫",
          status: "交易成功",
          rawText: "x".repeat(8001)
        }
      ]
    })).toThrow(/rawText/);
  });

  it.each([
    ["source 类型", { source: 42, items: [] }],
    ["source 长度", { source: "x".repeat(121), items: [] }],
    ["batch pageType 枚举", { pageType: "cart", items: [] }],
    ["capturedAt 类型", { capturedAt: 1_720_000_000_000, items: [] }],
    ["capturedAt 长度", { capturedAt: "x".repeat(65), items: [] }],
    ["pageUrl 类型", { pageUrl: ["https://example.test"], items: [] }],
    ["pageUrl 长度", { pageUrl: `https://example.test/${"x".repeat(2049)}`, items: [] }],
    ["item pageType 枚举", { items: [{ pageType: "cart", title: "白色衬衫" }] }],
    ["item 文本类型", { items: [{ itemId: 101, title: "白色衬衫" }] }],
    ["quantity 类型", { items: [{ title: "白色衬衫", quantity: { value: 1 } }] }],
    ["quantity 格式", { items: [{ title: "白色衬衫", quantity: "1件" }] }],
    ["payment 有限值", { items: [{ title: "白色衬衫", payment: Number.POSITIVE_INFINITY }] }],
    ["payment 格式", { items: [{ title: "白色衬衫", payment: "免费" }] }],
    ["detailProps 类型", { items: [{ title: "白色衬衫", detailProps: {} }] }],
    ["detailProps 元素类型", { items: [{ title: "白色衬衫", detailProps: ["棉"] }] }],
    ["detailProps.name 类型", { items: [{ title: "白色衬衫", detailProps: [{ name: 1, value: "棉" }] }] }],
    ["detailImages 类型", { items: [{ title: "白色衬衫", detailImages: "https://img.alicdn.com/a.jpg" }] }],
    ["detailImages 元素类型", { items: [{ title: "白色衬衫", detailImages: [123] }] }]
  ])("rejects malformed import runtime fields with ValidationError: %s", (_label, malformed) => {
    expect(() => normalizeTaobaoBatch(malformed)).toThrowError(ValidationError);
  });

  it("accepts the runtime forms emitted by the current bookmarklet, Selenium, and Playwright collectors", () => {
    expect(() => normalizeTaobaoBatch({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      capturedAt: "2026-06-11T05:30:00.000Z",
      pageUrl: "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm",
      items: [{
        pageType: "order-list",
        itemId: "303",
        orderId: "order-001",
        orderTime: "2026-06-10 12:00:00",
        title: "纯棉短袖T恤",
        sku: "颜色分类: 黑色; 尺码: M",
        quantity: "2",
        payment: "399.00",
        status: "交易成功",
        refundText: "",
        itemUrl: "https://item.taobao.com/item.htm?id=303",
        imageUrl: "https://img.alicdn.com/tee.jpg",
        rawText: "订单抓取文本",
        detailUrl: "https://item.taobao.com/item.htm?id=303",
        detailTitle: "UTIMUS/纯棉短袖T恤",
        detailProps: [{ name: "材质", value: "棉100%" }],
        detailDescription: "夏季透气",
        detailImages: ["https://img.alicdn.com/detail.jpg"],
        detailRawText: "详情抓取文本"
      }, {
        pageType: "order-list",
        itemId: "304",
        orderId: "order-002",
        title: "蓝色直筒牛仔裤",
        quantity: 1,
        payment: ""
      }]
    })).not.toThrow();
  });

  it("does not throw on malformed percent-encoded image URLs", () => {
    expect(() => isTrustedProductImage("https://img.alicdn.com/a/%E0%A4%A.jpg")).not.toThrow();
    expect(isTrustedProductImage("https://img.alicdn.com/a/%E0%A4%A.jpg")).toBe(true);
  });

  it("filters refunded and non-apparel items while creating a garment draft", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      capturedAt: "2026-06-10T08:00:00.000Z",
      pageUrl: "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm",
      items: [
        {
          orderId: "1234567890123",
          orderTime: "2026-01-03 12:30:00",
          title: "黑色羊毛大衣 女 秋冬 厚款",
          sku: "颜色分类: 黑色; 尺码: M",
          quantity: 1,
          payment: "399.00",
          status: "交易成功",
          imageUrl: "https://img.alicdn.com/coat.jpg",
          itemUrl: "https://item.taobao.com/item.htm?id=1",
          rawText: "订单号 1234567890123 黑色羊毛大衣 女 秋冬 厚款 交易成功 ¥399.00"
        },
        {
          orderId: "2234567890123",
          title: "蓝色直筒牛仔裤",
          sku: "颜色分类: 蓝色; 尺码: 30",
          quantity: 1,
          payment: "129.00",
          status: "退款成功",
          refundText: "退款成功",
          rawText: "蓝色直筒牛仔裤 退款成功"
        },
        {
          orderId: "3234567890123",
          title: "手机壳 防摔",
          status: "交易成功",
          rawText: "手机壳 防摔 交易成功"
        }
      ]
    });

    expect(result.summary.totalItems).toBe(3);
    expect(result.summary.skippedRefunded).toBe(1);
    expect(result.summary.skippedNonApparel).toBe(1);
    expect(result.summary.createdGarments).toBe(1);
    expect(result.sourceItems[0].externalKey).toMatch(/[a-f0-9]{64}/);
    expect(result.garmentDrafts[0]).toMatchObject({
      name: "黑色羊毛大衣 女 秋冬 厚款",
      category: "outerwear",
      color: "black",
      warmth: "heavy",
      owned: true,
      confirmed: false
    });
    expect(result.garmentDrafts[0].seasons).toContain("winter");
  });

  it("deduplicates repeated captured products using a stable external key", () => {
    const first = {
      orderId: "1234567890123",
      title: "白色衬衫",
      sku: "颜色分类: 白色",
      itemUrl: "https://item.taobao.com/item.htm?id=2",
      status: "交易成功"
    };

    const result = normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      items: [first, { ...first }]
    });

    expect(result.summary.totalItems).toBe(2);
    expect(result.sourceItems).toHaveLength(1);
    expect(result.garmentDrafts).toHaveLength(1);
  });

  it("keeps product detail fields and classifies detail-only captures", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=101",
      items: [
        {
          itemId: "101",
          detailUrl: "https://item.taobao.com/item.htm?id=101",
          detailTitle: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
          detailProps: [
            { name: "品牌", value: "TANZ" },
            { name: "颜色分类", value: "蓝色" },
            { name: "鞋面材质", value: "网布" }
          ],
          detailDescription: "夏季透气，适合通勤和跑步。",
          detailImages: ["https://img.alicdn.com/shoe-main.jpg"],
          detailRawText: "售后服务 商品详情 蓝色透气运动鞋 夏季 轻便跑步休闲鞋"
        }
      ]
    });

    expect(result.summary.totalItems).toBe(1);
    expect(result.summary.uniqueItems).toBe(1);
    expect(result.summary.createdGarments).toBe(1);
    expect(result.sourceItems[0]).toMatchObject({
      itemId: "101",
      detailTitle: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
      detailDescription: "夏季透气，适合通勤和跑步。",
      detailUrl: "https://item.taobao.com/item.htm?id=101"
    });
    expect(result.sourceItems[0].detailProps).toEqual([
      { name: "品牌", value: "TANZ" },
      { name: "颜色分类", value: "蓝色" },
      { name: "鞋面材质", value: "网布" }
    ]);
    expect(result.sourceItems[0].detailImages).toEqual(["https://img.alicdn.com/shoe-main.jpg"]);
    expect(result.garmentDrafts[0]).toMatchObject({
      name: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
      category: "shoes",
      color: "blue",
      imageUrl: "https://img.alicdn.com/shoe-main.jpg"
    });
    expect(result.garmentDrafts[0].seasons).toContain("summer");
  });

  it("recovers product titles from noisy detail raw text before classifying", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=1018415883889",
      items: [
        {
          pageType: "item-detail",
          itemId: "1018415883889",
          detailUrl: "https://item.taobao.com/item.htm?id=1018415883889",
          detailTitle: "宝贝描述",
          detailProps: [
            { name: "袖长", value: "15.5cm" },
            { name: "衣长", value: "59cm" }
          ],
          detailDescription: "",
          detailImages: ["https://img.alicdn.com/tee-main.jpg"],
          detailRawText:
            "宝贝描述 袖长 15.5cm 衣长 59cm 参数信息 适用季节 夏季 袖长 短袖 风格 通勤风 尺码 S,M,L 颜色 深灰色,黑色,白色 品牌 UTIMUS 厚薄 常规 图文详情 UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣 已售 5000+ 多人评价 券后 ￥ 51"
        }
      ]
    });

    expect(result.summary.createdGarments).toBe(1);
    expect(result.summary.skippedNonApparel).toBe(0);
    expect(result.garmentDrafts[0]).toMatchObject({
      brand: "UTIMUS",
      name: "宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      rawName: "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      category: "top",
      warmth: "light",
      imageUrl: "https://img.alicdn.com/tee-main.jpg"
    });
    expect(result.garmentDrafts[0].seasons).toContain("summer");
    expect(result.garmentDrafts[0].seasons).not.toContain("winter");
  });

  it("skips malformed detail-page captures that only contain Taobao navigation links", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=1018415883889",
      items: [
        {
          title: "购物车30",
          itemUrl: "https://cart.taobao.com/",
          rawText: "已买到的宝贝 我的淘宝 购物车30 收藏夹"
        },
        {
          title: "帮助中心",
          itemUrl: "https://consumerservice.taobao.com/",
          rawText: "免费开店 千牛卖家中心 帮助中心"
        }
      ]
    });

    expect(result.summary.totalItems).toBe(2);
    expect(result.summary.uniqueItems).toBe(0);
    expect(result.sourceItems).toHaveLength(0);
    expect(result.garmentDrafts).toHaveLength(0);
  });

  it("merges order-list and detail captures for the same item without duplicate drafts", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      items: [
        {
          itemId: "202",
          title: "黑色直筒牛仔裤",
          sku: "颜色分类: 黑色; 尺码: M",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=202",
          imageUrl: "https://img.alicdn.com/list.jpg"
        },
        {
          pageType: "item-detail",
          itemId: "202",
          detailUrl: "https://item.taobao.com/item.htm?id=202",
          detailTitle: "黑色直筒牛仔裤 春秋通勤长裤",
          detailProps: [{ name: "面料", value: "棉混纺" }],
          detailImages: ["https://img.alicdn.com/detail.jpg"]
        }
      ]
    });

    expect(result.summary.totalItems).toBe(2);
    expect(result.summary.uniqueItems).toBe(1);
    expect(result.summary.createdGarments).toBe(1);
    expect(result.sourceItems[0]).toMatchObject({
      itemId: "202",
      title: "黑色直筒牛仔裤",
      detailTitle: "黑色直筒牛仔裤 春秋通勤长裤",
      imageUrl: "https://img.alicdn.com/list.jpg"
    });
    expect(result.garmentDrafts[0]).toMatchObject({
      name: "黑色直筒牛仔裤 春秋通勤长裤",
      category: "bottom",
      imageUrl: "https://img.alicdn.com/detail.jpg"
    });
  });

  it("keeps different sku variants for the same item id as separate garments", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-bookmarklet",
      items: [
        {
          itemId: "303",
          title: "纯棉短袖T恤",
          sku: "颜色分类: 黑色; 尺码: M",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=303"
        },
        {
          itemId: "303",
          title: "纯棉短袖T恤",
          sku: "颜色分类: 白色; 尺码: M",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=303"
        }
      ]
    });

    expect(result.summary.totalItems).toBe(2);
    expect(result.summary.uniqueItems).toBe(2);
    expect(result.summary.createdGarments).toBe(2);
    expect(result.garmentDrafts.map((item) => item.color).sort()).toEqual(["black", "white"]);
  });

  it("classifies detail captures by the product title before noisy recommendation text", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-selenium",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=1018415883889",
      items: [
        {
          pageType: "item-detail",
          itemId: "1018415883889",
          detailUrl: "https://item.taobao.com/item.htm?id=1018415883889",
          detailTitle: "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
          detailProps: [
            { name: "品牌", value: "UTIMUS" },
            { name: "材质成分", value: "棉100%" },
            { name: "面料", value: "纯棉" },
            { name: "颜色", value: "深灰色,黑色,白色,绿色,花灰色,湖蓝" }
          ],
          detailDescription: "本店推荐 UTIMUS/双褶阔腿 通勤百搭垂感西裤男士夏季冰丝凉感直筒休闲长裤"
        }
      ]
    });

    expect(result.summary.createdGarments).toBe(1);
    expect(result.garmentDrafts[0]).toMatchObject({
      brand: "UTIMUS",
      name: "宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      rawName: "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      category: "top"
    });
  });

  it("keeps Playwright detail captures when generic titles require inferring a shoe title from raw text", () => {
    const payload = {
      source: "taobao-playwright-item-detail",
      pageType: "item-detail",
      pageUrl: "https://detail.tmall.com/item.htm?id=829643100435",
      items: [
        {
          pageType: "item-detail",
          itemId: "829643100435",
          detailUrl: "https://detail.tmall.com/item.htm?id=829643100435",
          detailTitle: "宝贝描述",
          detailDescription: "（顺丰取送）",
          detailRawText: [
            "宝贝描述 用户评价 言午小水果 2024-11-12 已购：01/白色/银色/金色 / 42",
            "参数信息 橡胶 鞋底材质 缓震,耐磨 功能 拼色 流行元素 系带 闭合方式 品牌 Mizuno/美津浓 品名 D1GA3311 鞋帮高度 低帮 鞋码 42 42.5 43 38 39 44 36.5 40 37 44.5 40.5 38.5 41 吊牌价 1298元 销售渠道类型 纯电商(只在线上销售) 是否商场同款 否 性别 男女通用 吊牌价 1298 帮面材质 其他 上市时间 2024年秋季 运动系列 运动生活 是否瑕疵 否 颜色分类 01/白色/银色/金色",
            "本店推荐 Mizuno美津浓26新款山系户外轻野鞋缓震跑步休闲鞋FIYI TL V2 ¥598.001000+人付款",
            "Mizuno美津浓24秋男女HYBRID风格跑鞋WAVE RIDER β 已售 0 可开发票",
            "快递: 免运费 湖北武汉 至 北京市 海淀区 退货宝88VIP退货包运费假一赔四极速退款7天无理由退换 信用卡支付",
            "颜色分类 01/白色/银色/金色 鞋码 42 42.5 43"
          ].join(" "),
          detailImages: ["https://img.alicdn.com/bao/uploaded/i1/451024527/O1CN01wkoMKq1jJPyWOn4oG_!!0-item_pic.jpg"]
        }
      ]
    };
    const result = filterTaobaoBatchForWardrobe(payload);
    const normalized = normalizeTaobaoBatch(payload);

    expect(result.filterSummary).toMatchObject({
      originalItems: 1,
      keptItems: 1,
      skippedNonApparel: 0
    });
    expect(result.payload.items?.[0]).toMatchObject({
      itemId: "829643100435",
      detailTitle: "宝贝描述"
    });
    expect(normalized.garmentDrafts[0]).toMatchObject({
      rawName: "Mizuno美津浓24秋男女HYBRID风格跑鞋WAVE RIDER β",
      category: "shoes"
    });
  });

  it("extracts brand, stores a short product name, and skips non-product thumbnail assets", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-selenium",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=505",
      items: [
        {
          itemId: "505",
          detailUrl: "https://item.taobao.com/item.htm?id=505",
          detailTitle: "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
          detailProps: [
            { name: "品牌", value: "UTIMUS" },
            { name: "颜色分类", value: "深灰色" },
            { name: "适用季节", value: "夏季" }
          ],
          detailImages: [
            "https://gw.alicdn.com/tfs/TB1platform_80x36.png",
            "https://img.alicdn.com/imgextra/i2/123456/O1CN01real-product.jpg"
          ],
          detailDescription: "夏季透气短袖。"
        }
      ]
    });

    expect(result.garmentDrafts[0]).toMatchObject({
      brand: "UTIMUS",
      rawName: "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      name: "宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      imageUrl: "https://img.alicdn.com/imgextra/i2/123456/O1CN01real-product.jpg"
    });
  });

  it("cleans noisy order-list titles into a brand and readable product name", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      pageUrl: "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm",
      items: [
        {
          itemId: "707",
          orderId: "9000000000000000007",
          title: "2025-10-10 UTIMUS 订单详情 交易成功 UTIMUS拼接长袖打底衫基础款秋冬保暖软糯磨毛套头卫衣纯色270G [交易快照] 深灰色;M 大促价保 7天无理由退货 加入购物车申请售后",
          sku: "颜色分类: 深灰色; 尺码: M",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=707"
        }
      ]
    });

    expect(result.garmentDrafts[0]).toMatchObject({
      brand: "UTIMUS",
      rawName: "2025-10-10 UTIMUS 订单详情 交易成功 UTIMUS拼接长袖打底衫基础款秋冬保暖软糯磨毛套头卫衣纯色270G [交易快照] 深灰色;M 大促价保 7天无理由退货 加入购物车申请售后",
      name: "拼接长袖打底衫基础款秋冬保暖软糯磨毛套头卫衣纯色270G"
    });
  });

  it("keeps multi-word shop brands when the product title starts with the same brand", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        {
          itemId: "808",
          orderId: "9000000000000000008",
          title: "2026-03-23 Gnomes lab 订单详情 交易成功 Gnomes lab 25AW碳素磨毛亲肤舒适纯棉活页色织格纹通勤衬衫 [交易快照] 黑色;S 大促价保 极速退款 7天无理由退货 加入购物车申请售后",
          sku: "颜色分类: 黑色; 尺码: S",
          status: "交易成功"
        }
      ]
    });

    expect(result.garmentDrafts[0]).toMatchObject({
      brand: "Gnomes lab",
      name: "25AW碳素磨毛亲肤舒适纯棉活页色织格纹通勤衬衫"
    });
  });

  it("cleans noisy order-list titles with non-success order statuses", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        {
          itemId: "909",
          orderId: "9000000000000000009",
          title: "2026-04-12 BOSIE 订单详情 卖家已发货 BOSIE/小方领蓝色短袖衬衫 夏季通勤上衣 [交易快照] 蓝色;M 7天无理由退货 加入购物车申请售后",
          sku: "颜色分类: 蓝色; 尺码: M",
          status: "卖家已发货"
        }
      ]
    });

    expect(result.garmentDrafts[0]).toMatchObject({
      brand: "BOSIE",
      name: "小方领蓝色短袖衬衫 夏季通勤上衣"
    });
  });

  it("only creates wardrobe drafts for clothing and shoes from noisy order captures", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        {
          itemId: "1001",
          orderId: "9000000000000001001",
          title: "2026-06-01 UTIMUS 订单详情 交易成功 UTIMUS纯棉短袖T恤男女同款夏季透气上衣 [交易快照] 黑色;M",
          status: "交易成功"
        },
        {
          itemId: "1002",
          orderId: "9000000000000001002",
          title: "2026-06-01 BOSIE 订单详情 交易成功 BOSIE宽松直筒牛仔裤春秋通勤长裤 [交易快照] 蓝色;M",
          status: "交易成功"
        },
        {
          itemId: "1003",
          orderId: "9000000000000001003",
          title: "2026-06-01 COS 订单详情 交易成功 COS羊毛大衣女秋冬厚款通勤外套 [交易快照] 黑色;S",
          status: "交易成功"
        },
        {
          itemId: "1004",
          orderId: "9000000000000001004",
          title: "2026-06-01 TANZ 订单详情 交易成功 TANZ男鞋运动鞋夏季轻便跑步休闲鞋 [交易快照] 灰色;42",
          status: "交易成功"
        },
        {
          itemId: "2001",
          orderId: "9000000000000002001",
          title: "2026-06-01 李哥钱排三华李果园 订单详情 交易成功 现摘李子新鲜水果红心李大果 坏单包退",
          status: "交易成功"
        },
        {
          itemId: "2002",
          orderId: "9000000000000002002",
          title: "2026-06-01 讯迪旗舰店 订单详情 交易成功 适用红米手机壳保护套全包镜头防摔外壳",
          status: "交易成功"
        },
        {
          itemId: "2003",
          orderId: "9000000000000002003",
          title: "2026-06-01 ogg旗舰店 订单详情 交易成功 适用Redmi Buds保护套蓝牙耳机保护壳",
          status: "交易成功"
        },
        {
          itemId: "2004",
          orderId: "9000000000000002004",
          title: "2026-06-01 良品铺子 订单详情 交易成功 老卤鸭脖甜辣熟食卤味小吃休闲零食小包装",
          status: "交易成功"
        },
        {
          itemId: "2005",
          orderId: "9000000000000002005",
          title: "2026-06-01 可悠然 订单详情 交易成功 沐浴露自然留香氨基酸清洁滋润保湿",
          status: "交易成功"
        },
        {
          itemId: "2006",
          orderId: "9000000000000002006",
          title: "2026-06-01 清风 订单详情 交易成功 抽纸丝柔臻品餐巾纸面巾纸整箱",
          status: "交易成功"
        },
        {
          itemId: "2007",
          orderId: "9000000000000002007",
          title: "2026-06-01 雅格太格尔 订单详情 交易成功 台灯宿舍灯护眼学习专用床头阅读灯",
          status: "交易成功"
        },
        {
          itemId: "2008",
          orderId: "9000000000000002008",
          title: "2026-06-01 配饰店 订单详情 交易成功 羊毛围巾秋冬保暖柔软百搭",
          status: "交易成功"
        },
        {
          itemId: "2009",
          orderId: "9000000000000002009",
          title: "2026-06-01 哈维乐园 订单详情 交易成功 羽绒服收纳袋抽绳束口旅行便携行李箱衣物服压缩整理收纳包",
          status: "交易成功"
        },
        {
          itemId: "2010",
          orderId: "9000000000000002010",
          title: "2026-06-01 官方国货甄选 订单详情 交易成功 可伸缩衣柜收纳分层神器置物架衣服柜内空间利用橱柜抽拉隔板鞋架",
          status: "交易成功"
        }
      ]
    });

    expect(result.summary.totalItems).toBe(14);
    expect(result.summary.createdGarments).toBe(5);
    expect(result.garmentDrafts.map((item) => item.category).sort()).toEqual(["accessory", "bottom", "outerwear", "shoes", "top"]);
    expect(result.garmentDrafts.map((item) => item.name)).toEqual([
      "纯棉短袖T恤男女同款夏季透气上衣",
      "宽松直筒牛仔裤春秋通勤长裤",
      "羊毛大衣女秋冬厚款通勤外套",
      "男鞋运动鞋夏季轻便跑步休闲鞋",
      "羊毛围巾秋冬保暖柔软百搭"
    ]);
  });

  it("imports wardrobe accessories as optional recommendation enhancers", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        {
          itemId: "3001",
          orderId: "9000000000000003001",
          title: "配饰店 订单详情 交易成功 羊毛围巾秋冬保暖柔软百搭",
          sku: "颜色分类: 灰色",
          status: "交易成功"
        }
      ]
    });

    expect(result.summary.createdGarments).toBe(1);
    expect(result.garmentDrafts[0]).toMatchObject({
      category: "accessory",
      warmth: "heavy",
      color: "gray",
      owned: true,
      confirmed: false
    });
  });

  it("keeps a detail-page shoe capture when noisy recommendation text mentions non-wearable products", () => {
    const result = normalizeTaobaoBatch({
      source: "taobao-selenium",
      pageType: "item-detail",
      capturedAt: "2026-06-12T06:30:24.288Z",
      pageUrl: "https://item.taobao.com/item.htm?id=730265944941&mi_id=0000kvR33tP8WeTUGthRdUQAHT0MRqnCBOgxkzAWa42ymH4",
      items: [
        {
          itemId: "730265944941",
          detailUrl: "https://item.taobao.com/item.htm?id=730265944941&mi_id=0000kvR33tP8WeTUGthRdUQAHT0MRqnCBOgxkzAWa42ymH4",
          detailTitle: "332.0012人付款 ASICS GEL-1130 男女运动鞋老爹鞋1201A256-113 1201A255-028-004",
          detailProps: [
            { name: "品牌", value: "Asics/亚瑟士" },
            { name: "功能", value: "耐磨,透气" },
            { name: "适用场景", value: "休闲" }
          ],
          detailImages: ["https://img.alicdn.com/asics-shoe.jpg"],
          detailDescription: "本店推荐 看了又看 蓝牙耳机 手机壳 休闲零食 饮用水 参数信息 品牌 Asics/亚瑟士 运动系列 休闲",
          detailRawText: "ASICS GEL-1130 男女运动鞋老爹鞋 已售 3000+ 颜色分类 银白棕 鞋码 42 看了又看 蓝牙耳机 手机壳 休闲零食 饮用水"
        }
      ]
    });

    expect(result.summary.totalItems).toBe(1);
    expect(result.summary.skippedNonApparel).toBe(0);
    expect(result.summary.createdGarments).toBe(1);
    expect(result.garmentDrafts[0]).toMatchObject({
      brand: "Asics/亚瑟士",
      category: "shoes",
      imageUrl: "https://img.alicdn.com/asics-shoe.jpg"
    });
  });
});
