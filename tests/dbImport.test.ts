import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createDatabase, importTaobaoBatchIntoDb, listGarments, migrate } from "../server/db";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

const payload = {
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
    }
  ]
};

describe("database import", () => {
  it("imports source order items and creates deduplicated garment drafts", () => {
    const db = createDatabase(":memory:");

    const first = importTaobaoBatchIntoDb(db, payload);
    const second = importTaobaoBatchIntoDb(db, payload);
    const garments = listGarments(db);

    expect(first.summary.createdGarments).toBe(1);
    expect(second.summary.createdGarments).toBe(0);
    expect(garments).toHaveLength(1);
    expect(garments[0]).toMatchObject({
      name: "黑色羊毛大衣 女 秋冬 厚款",
      category: "outerwear",
      confirmed: false,
      owned: true
    });
  });

  it("marks an existing garment unavailable when a later import shows the item was refunded", () => {
    const db = createDatabase(":memory:");

    importTaobaoBatchIntoDb(db, payload);
    importTaobaoBatchIntoDb(db, {
      ...payload,
      items: payload.items.map((item) => ({
        ...item,
        status: "退款成功",
        refundText: "退款成功",
        rawText: `${item.rawText} 退款成功`
      }))
    });

    const garments = listGarments(db);
    expect(garments).toHaveLength(1);
    expect(garments[0]).toMatchObject({
      owned: false,
      excluded: true
    });
  });

  it("stores detail fields and overwrites the linked garment when detail is imported later", () => {
    const db = createDatabase(":memory:");

    const first = importTaobaoBatchIntoDb(db, {
      ...payload,
      items: payload.items.map((item) => ({
        ...item,
        itemId: "1"
      }))
    });
    const second = importTaobaoBatchIntoDb(db, {
      source: "taobao-bookmarklet",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=1",
      items: [
        {
          itemId: "1",
          detailUrl: "https://item.taobao.com/item.htm?id=1",
          detailTitle: "黑色羊毛大衣 女 冬季 厚款 通勤外套",
          detailProps: [
            { name: "材质成分", value: "羊毛 80%" },
            { name: "颜色分类", value: "黑色" }
          ],
          detailDescription: "冬季厚款通勤大衣。",
          detailImages: ["https://img.alicdn.com/detail-coat.jpg"],
          detailRawText: "商品参数 材质成分 羊毛 80% 商品详情 冬季厚款通勤大衣"
        }
      ]
    });

    const source = db.prepare("SELECT * FROM source_order_items WHERE item_id = ?").get("1") as {
      detail_title: string;
      detail_props: string;
      detail_description: string;
      detail_images: string;
      detail_url: string;
    };
    const garments = listGarments(db);

    expect(first.summary.createdGarments).toBe(1);
    expect(second.summary.createdGarments).toBe(0);
    expect(source).toMatchObject({
      detail_title: "黑色羊毛大衣 女 冬季 厚款 通勤外套",
      detail_description: "冬季厚款通勤大衣。",
      detail_url: "https://item.taobao.com/item.htm?id=1"
    });
    expect(JSON.parse(source.detail_props)).toEqual([
      { name: "材质成分", value: "羊毛 80%" },
      { name: "颜色分类", value: "黑色" }
    ]);
    expect(JSON.parse(source.detail_images)).toEqual(["https://img.alicdn.com/detail-coat.jpg"]);
    expect(garments[0]).toMatchObject({
      name: "黑色羊毛大衣 女 冬季 厚款 通勤外套",
      imageUrl: "https://img.alicdn.com/detail-coat.jpg",
      owned: true,
      excluded: false
    });
  });

  it("applies a later detail capture to every purchased SKU variant for the same item", () => {
    const db = createDatabase(":memory:");

    const orderPayload = {
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      capturedAt: "2026-06-11T08:00:00.000Z",
      pageUrl: "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm",
      items: [
        {
          itemId: "1018415883889",
          orderId: "9000000000000000001",
          title: "UTIMUS 纯棉短袖T恤",
          sku: "颜色: 黑色; 尺码: S",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=1018415883889",
          imageUrl: "https://img.alicdn.com/order-black.jpg"
        },
        {
          itemId: "1018415883889",
          orderId: "9000000000000000002",
          title: "UTIMUS 纯棉短袖T恤",
          sku: "颜色: 白色; 尺码: S",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=1018415883889",
          imageUrl: "https://img.alicdn.com/order-white.jpg"
        }
      ]
    };

    const first = importTaobaoBatchIntoDb(db, orderPayload);
    const second = importTaobaoBatchIntoDb(db, {
      source: "taobao-selenium",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=1018415883889",
      items: [
        {
          itemId: "1018415883889",
          detailUrl: "https://item.taobao.com/item.htm?id=1018415883889",
          detailTitle: "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
          detailProps: [
            { name: "品牌", value: "UTIMUS" },
            { name: "材质成分", value: "棉100%" }
          ],
          detailImages: ["https://img.alicdn.com/detail-tee.jpg"],
          detailDescription: "液氨纯棉，夏季短袖。"
        }
      ]
    });

    const sources = db.prepare(`
      SELECT sku, detail_title, detail_images
      FROM source_order_items
      WHERE item_id = ?
      ORDER BY sku
    `).all("1018415883889") as Array<{ sku: string; detail_title: string; detail_images: string }>;
    const garments = listGarments(db);

    expect(first.summary.createdGarments).toBe(2);
    expect(second.summary.createdGarments).toBe(0);
    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.detail_title)).toEqual([
      "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣"
    ]);
    expect(sources.map((source) => JSON.parse(source.detail_images))).toEqual([
      ["https://img.alicdn.com/detail-tee.jpg"],
      ["https://img.alicdn.com/detail-tee.jpg"]
    ]);
    expect(garments).toHaveLength(2);
    expect(garments.map((garment) => garment.color).sort()).toEqual(["black", "white"]);
    expect(garments.map((garment) => garment.imageUrl)).toEqual([
      "https://img.alicdn.com/detail-tee.jpg",
      "https://img.alicdn.com/detail-tee.jpg"
    ]);
  });

  it("uses an existing detail capture to enrich purchased SKU variants imported later", () => {
    const db = createDatabase(":memory:");

    const detailPayload = {
      source: "taobao-selenium",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=1018415883889",
      items: [
        {
          itemId: "1018415883889",
          detailUrl: "https://item.taobao.com/item.htm?id=1018415883889",
          detailTitle: "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
          detailProps: [
            { name: "品牌", value: "UTIMUS" },
            { name: "材质成分", value: "棉100%" }
          ],
          detailImages: ["https://img.alicdn.com/detail-tee.jpg"],
          detailDescription: "液氨纯棉，夏季短袖。"
        }
      ]
    };

    importTaobaoBatchIntoDb(db, detailPayload);
    const second = importTaobaoBatchIntoDb(db, {
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      pageUrl: "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm",
      items: [
        {
          itemId: "1018415883889",
          orderId: "9000000000000000001",
          title: "UTIMUS 纯棉短袖T恤",
          sku: "颜色: 黑色; 尺码: S",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=1018415883889"
        },
        {
          itemId: "1018415883889",
          orderId: "9000000000000000002",
          title: "UTIMUS 纯棉短袖T恤",
          sku: "颜色: 白色; 尺码: S",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=1018415883889"
        }
      ]
    });

    const sourceRows = db.prepare(`
      SELECT sku, detail_title
      FROM source_order_items
      WHERE item_id = ? AND COALESCE(sku, '') <> ''
      ORDER BY sku
    `).all("1018415883889") as Array<{ sku: string; detail_title: string }>;
    const garments = listGarments(db);
    const activeGarments = garments.filter((garment) => garment.owned && !garment.excluded);

    expect(second.summary.createdGarments).toBe(2);
    expect(sourceRows).toHaveLength(2);
    expect(sourceRows.map((source) => source.detail_title)).toEqual([
      "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣"
    ]);
    expect(activeGarments).toHaveLength(2);
    expect(activeGarments.map((garment) => garment.color).sort()).toEqual(["black", "white"]);
  });

  it("adds detail columns when migrating an existing source_order_items table", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE source_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_key TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    migrate(db);

    const columns = db.prepare("PRAGMA table_info(source_order_items)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      "item_id",
      "detail_title",
      "detail_props",
      "detail_description",
      "detail_images",
      "detail_raw_text",
      "detail_url"
    ]));
  });
});
