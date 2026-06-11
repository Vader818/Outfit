import { describe, expect, it } from "vitest";
import { normalizeTaobaoBatch } from "../server/services/importTaobao";

describe("normalizeTaobaoBatch", () => {
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
});
