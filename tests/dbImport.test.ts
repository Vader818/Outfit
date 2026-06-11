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
