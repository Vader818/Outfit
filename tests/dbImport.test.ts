import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createDatabase, importTaobaoBatchIntoDb, legacyBaseline0, listGarments, migrate, updateGarment } from "../server/db";

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
  it("configures a SQLite busy timeout for local database writes", () => {
    const db = createDatabase(":memory:");
    const row = db.prepare("PRAGMA busy_timeout").get() as { timeout: number };

    expect(row.timeout).toBe(5000);
  });

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

  it("backfills brand, raw name, short name, and trusted images when migrating existing garments", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE source_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_key TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        page_type TEXT,
        item_id TEXT,
        order_id TEXT,
        order_time TEXT,
        title TEXT NOT NULL,
        sku TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        payment REAL,
        status TEXT,
        refund_text TEXT,
        item_url TEXT,
        image_url TEXT,
        raw_text TEXT,
        detail_url TEXT,
        detail_title TEXT,
        detail_props TEXT,
        detail_description TEXT,
        detail_images TEXT,
        detail_raw_text TEXT,
        is_refunded INTEGER NOT NULL DEFAULT 0,
        is_apparel INTEGER NOT NULL DEFAULT 0,
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE garments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_order_item_id INTEGER UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        color TEXT NOT NULL,
        warmth TEXT NOT NULL,
        seasons TEXT NOT NULL,
        styles TEXT NOT NULL,
        formality TEXT NOT NULL,
        image_url TEXT,
        owned INTEGER NOT NULL DEFAULT 1,
        confirmed INTEGER NOT NULL DEFAULT 0,
        excluded INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.prepare(`
      INSERT INTO source_order_items (
        id, external_key, source, page_type, item_id, title, sku, image_url,
        detail_title, detail_props, detail_images, is_apparel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      "legacy-unconfirmed",
      "taobao-selenium",
      "item-detail",
      "505",
      "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      "颜色分类: 深灰色",
      "https://gw.alicdn.com/tfs/TB1platform_80x36.png",
      "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      JSON.stringify([{ name: "品牌", value: "UTIMUS" }]),
      JSON.stringify([
        "https://gw.alicdn.com/tfs/TB1platform_80x36.png",
        "https://img.alicdn.com/imgextra/i2/123456/O1CN01real-product.jpg"
      ]),
      1
    );
    db.prepare(`
      INSERT INTO garments (
        source_order_item_id, name, category, color, warmth, seasons, styles,
        formality, image_url, confirmed, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      "top",
      "gray",
      "light",
      JSON.stringify(["summer"]),
      JSON.stringify(["casual"]),
      "casual",
      "https://gw.alicdn.com/tfs/TB1platform_80x36.png",
      0,
      0.9
    );

    migrate(db);

    expect(listGarments(db)[0]).toMatchObject({
      brand: "UTIMUS",
      rawName: "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      name: "宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
      imageUrl: "https://img.alicdn.com/imgextra/i2/123456/O1CN01real-product.jpg"
    });
  });

  it("does not overwrite a confirmed garment name during migration backfill", () => {
    const db = createDatabase(":memory:");
    importTaobaoBatchIntoDb(db, {
      source: "taobao-selenium",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=606",
      items: [
        {
          itemId: "606",
          detailTitle: "BOSIE/小方领蓝色短袖衬衫 夏季通勤上衣",
          detailProps: [{ name: "品牌", value: "BOSIE" }],
          detailImages: ["https://img.alicdn.com/imgextra/i1/606/O1CN01shirt.jpg"]
        }
      ]
    });
    const garment = listGarments(db)[0];
    updateGarment(db, garment.id, {
      name: "我手动改过的衬衫",
      confirmed: true,
      imageUrl: "https://gw.alicdn.com/tfs/TB1platform_80x36.png"
    });

    legacyBaseline0(db);

    expect(listGarments(db)[0]).toMatchObject({
      brand: "BOSIE",
      rawName: "BOSIE/小方领蓝色短袖衬衫 夏季通勤上衣",
      name: "我手动改过的衬衫",
      imageUrl: "https://img.alicdn.com/imgextra/i1/606/O1CN01shirt.jpg",
      confirmed: true
    });
  });

  it("preserves local thumbnail URLs during migration backfill", () => {
    const db = createDatabase(":memory:");
    importTaobaoBatchIntoDb(db, {
      source: "taobao-selenium",
      pageType: "item-detail",
      items: [
        {
          itemId: "608",
          detailTitle: "范斯低帮休闲帆布鞋",
          detailImages: ["https://img.alicdn.com/imgextra/i1/608/O1CN01shoe_!!608-0-item_pic.jpg"]
        }
      ]
    });
    const garment = listGarments(db)[0];
    updateGarment(db, garment.id, {
      imageUrl: "/api/garment-thumbnails/garment-1-608.webp"
    });

    legacyBaseline0(db);

    expect(listGarments(db)[0]).toMatchObject({
      imageUrl: "/api/garment-thumbnails/garment-1-608.webp"
    });
  });

  it("preserves a confirmed manually edited name that starts with the brand", () => {
    const db = createDatabase(":memory:");
    importTaobaoBatchIntoDb(db, {
      source: "taobao-selenium",
      pageType: "item-detail",
      items: [
        {
          itemId: "607",
          detailTitle: "BOSIE/小方领蓝色短袖衬衫 夏季通勤上衣",
          detailProps: [{ name: "品牌", value: "BOSIE" }],
          detailImages: ["https://img.alicdn.com/imgextra/i1/607/O1CN01shirt.jpg"]
        }
      ]
    });
    const garment = listGarments(db)[0];
    updateGarment(db, garment.id, {
      name: "BOSIE 蓝衬衫",
      confirmed: true
    });

    legacyBaseline0(db);

    expect(listGarments(db)[0]).toMatchObject({
      brand: "BOSIE",
      rawName: "BOSIE/小方领蓝色短袖衬衫 夏季通勤上衣",
      name: "BOSIE 蓝衬衫",
      confirmed: true
    });
  });

  it("cleans a confirmed garment when its name is still the captured order text", () => {
    const db = createDatabase(":memory:");
    const noisyName =
      "2025-10-10 UTIMUS 订单详情 交易成功 UTIMUS拼接长袖打底衫基础款秋冬保暖软糯磨毛套头卫衣纯色270G [交易快照] 深灰色;M 大促价保 7天无理由退货 加入购物车申请售后";

    importTaobaoBatchIntoDb(db, {
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      pageUrl: "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm",
      items: [
        {
          itemId: "707",
          orderId: "9000000000000000007",
          title: noisyName,
          sku: "颜色分类: 深灰色; 尺码: M",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=707"
        }
      ]
    });
    const garment = listGarments(db)[0];
    updateGarment(db, garment.id, {
      name: noisyName,
      confirmed: true
    });

    legacyBaseline0(db);

    expect(listGarments(db)[0]).toMatchObject({
      brand: "UTIMUS",
      rawName: noisyName,
      name: "拼接长袖打底衫基础款秋冬保暖软糯磨毛套头卫衣纯色270G",
      confirmed: true
    });
  });

  it("repairs a confirmed garment from an older partial brand backfill", () => {
    const db = createDatabase(":memory:");
    const noisyName =
      "2025-10-10 UTIMUS 订单详情 交易成功 UTIMUS拼接长袖打底衫基础款秋冬保暖软糯磨毛套头卫衣纯色270G [交易快照] 深灰色;M 大促价保 7天无理由退货 加入购物车申请售后";

    importTaobaoBatchIntoDb(db, {
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        {
          itemId: "708",
          orderId: "9000000000000000008",
          title: noisyName,
          sku: "颜色分类: 深灰色; 尺码: M",
          status: "交易成功",
          itemUrl: "https://item.taobao.com/item.htm?id=708"
        }
      ]
    });
    const garment = listGarments(db)[0];
    updateGarment(db, garment.id, {
      brand: "UTIMU",
      name: "UTIMUS拼接长袖打底衫基础款秋冬保暖软糯磨毛套头卫衣纯色270G",
      rawName: noisyName,
      confirmed: true
    });

    legacyBaseline0(db);

    expect(listGarments(db)[0]).toMatchObject({
      brand: "UTIMUS",
      name: "拼接长袖打底衫基础款秋冬保暖软糯磨毛套头卫衣纯色270G",
      rawName: noisyName,
      confirmed: true
    });
  });

  it("repairs a confirmed garment from an older multi-word brand backfill", () => {
    const db = createDatabase(":memory:");
    const noisyName =
      "2026-03-23 Gnomes lab 订单详情 交易成功 Gnomes lab 25AW碳素磨毛亲肤舒适纯棉活页色织格纹通勤衬衫 [交易快照] 黑色;S 大促价保 极速退款 7天无理由退货 加入购物车申请售后";

    importTaobaoBatchIntoDb(db, {
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        {
          itemId: "808",
          orderId: "9000000000000000008",
          title: noisyName,
          sku: "颜色分类: 黑色; 尺码: S",
          status: "交易成功"
        }
      ]
    });
    const garment = listGarments(db)[0];
    updateGarment(db, garment.id, {
      brand: "Gnomes",
      name: "lab 25AW碳素磨毛亲肤舒适纯棉活页色织格纹通勤衬衫",
      rawName: noisyName,
      confirmed: true
    });

    legacyBaseline0(db);

    expect(listGarments(db)[0]).toMatchObject({
      brand: "Gnomes lab",
      name: "25AW碳素磨毛亲肤舒适纯棉活页色织格纹通勤衬衫",
      rawName: noisyName,
      confirmed: true
    });
  });
});
