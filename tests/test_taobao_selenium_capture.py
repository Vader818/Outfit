import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import taobao_selenium_capture as capture
from scripts.taobao_selenium_capture import (
    build_capture_payload,
    build_collector_snapshot_script,
    create_chrome_driver,
    ensure_local_webdriver_bypasses_proxy,
    extract_script_detail_data,
    parse_args,
    validate_item_detail_payload,
)


class TaobaoSeleniumCaptureTests(unittest.TestCase):
    def test_extracts_product_detail_data_from_inline_state(self):
        data = extract_script_detail_data(
            """
            window.__ITEM_DETAIL__ = {
              "itemId": "1018415883889",
              "title": "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
              "props": [
                { "name": "品牌", "value": "UTIMUS" },
                { "name": "材质成分", "value": "棉100%" },
                { "name": "颜色分类", "value": "黑色,白色" }
              ],
              "images": ["//img.alicdn.com/imgextra/i1/1018415883889/O1CN01detail.jpg"],
              "description": "液氨纯棉，抗皱透气。"
            };
            """
        )

        self.assertEqual(data["title"], "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣")
        self.assertEqual(
            data["props"],
            [
                {"name": "品牌", "value": "UTIMUS"},
                {"name": "材质成分", "value": "棉100%"},
                {"name": "颜色分类", "value": "黑色,白色"},
            ],
        )
        self.assertEqual(data["description"], "液氨纯棉，抗皱透气。")
        self.assertIn(
            "https://img.alicdn.com/imgextra/i1/1018415883889/O1CN01detail.jpg",
            data["images"],
        )
        self.assertIn("UTIMUS/宗师tee01", data["rawText"])

    def test_nav_heavy_body_text_prefers_inline_product_data(self):
        payload = build_capture_payload(
            {
                "url": "https://item.taobao.com/item.htm?id=1018415883889&mi_id=0000oyhC1F3JLTafdCbmCAahR1vEjNT5Qt2A-aPf8y6V6U4",
                "title": "淘宝网 - 淘宝",
                "bodyText": "svader\n淘宝网首页\n购物车30\n帮助中心\n进店",
                "metaTitles": [],
                "images": ["https://img.alicdn.com/tfs/nav.png"],
                "scripts": [
                    """
                    window.__ITEM_DETAIL__ = {
                      "title": "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣",
                      "props": [{ "name": "品牌", "value": "UTIMUS" }],
                      "images": ["https://img.alicdn.com/imgextra/i1/1018415883889/O1CN01detail.jpg"],
                      "description": "液氨纯棉，抗皱透气。"
                    };
                    """
                ],
            },
            captured_at="2026-06-10T16:14:40.763Z",
        )

        item = payload["items"][0]
        self.assertEqual(payload["source"], "taobao-selenium")
        self.assertEqual(payload["pageType"], "item-detail")
        self.assertEqual(payload["capturedAt"], "2026-06-10T16:14:40.763Z")
        self.assertEqual(item["itemId"], "1018415883889")
        self.assertEqual(item["detailTitle"], "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣")
        self.assertEqual(item["detailProps"], [{"name": "品牌", "value": "UTIMUS"}])
        self.assertEqual(
            item["detailImages"][0],
            "https://img.alicdn.com/imgextra/i1/1018415883889/O1CN01detail.jpg",
        )
        self.assertIn("液氨纯棉", item["detailDescription"])

    def test_payload_is_json_serializable_and_matches_import_shape(self):
        payload = build_capture_payload(
            {
                "url": "https://item.taobao.com/item.htm?id=101",
                "title": "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
                "bodyText": "商品参数\n品牌 TANZ\n颜色分类 蓝色\n商品详情\n夏季透气，适合通勤和跑步。",
                "metaTitles": ["蓝色透气运动鞋 夏季 轻便跑步休闲鞋"],
                "images": ["//img.alicdn.com/main.jpg", "//img.alicdn.com/main.jpg"],
                "scripts": [],
            },
            captured_at="2026-06-10T08:00:00.000Z",
        )

        json.dumps(payload, ensure_ascii=False)
        self.assertEqual(
            set(payload.keys()),
            {"source", "pageType", "capturedAt", "pageUrl", "items"},
        )
        self.assertEqual(
            set(payload["items"][0].keys()),
            {
                "pageType",
                "itemId",
                "detailUrl",
                "detailTitle",
                "detailProps",
                "detailDescription",
                "detailImages",
                "detailRawText",
            },
        )
        self.assertEqual(payload["items"][0]["detailImages"], ["https://img.alicdn.com/main.jpg"])

    def test_snapshot_image_values_can_contain_srcset_candidates(self):
        payload = build_capture_payload(
            {
                "url": "https://item.taobao.com/item.htm?id=202",
                "title": "黑色短袖T恤",
                "bodyText": "商品参数\n品牌 UTIMUS",
                "metaTitles": [],
                "images": [
                    "//img.alicdn.com/main-small.jpg 1x, //img.alicdn.com/main-large.jpg 2x",
                    "https://img.alicdn.com/main-large.jpg",
                ],
                "scripts": [],
            },
            captured_at="2026-06-10T08:00:00.000Z",
        )

        self.assertEqual(
            payload["items"][0]["detailImages"],
            [
                "https://img.alicdn.com/main-small.jpg",
                "https://img.alicdn.com/main-large.jpg",
            ],
        )

    def test_real_taobao_parameter_text_yields_product_title_and_props(self):
        raw_text = (
            "宝贝描述 袖长 15.5cm 衣长 59cm 袖长 19cm 衣长 64cm 袖长 20cm 衣长 66cm "
            "袖长 21cm 衣长 68cm 袖长 22cm 衣长 70cm 袖长 23cm 衣长 72cm "
            "参数信息 纯色 图案 抗菌 功能 常规袖 袖型 纯棉 面料 通用型 适用体型 "
            "圆领 领型设计 棉100% 材质成分 标准 版型分类 基础风格 其他 是否商场同款 否 "
            "结构细节 无帽 适用场景 日常 适用季节 夏季 上市年份季节 2026年春季 袖长 短袖 "
            "风格 通勤风 尺码 S,M,L,XL,XS,2XS 颜色 深灰色,黑色,白色,绿色,花灰色,湖蓝 "
            "品牌 UTIMUS 适用人群 青少年,中青年,青年,中年,其他 货号 C2601018 适用性别 男士 "
            "产地 中国 厚薄 常规 衣门襟 套头 款式 套头 衣长类型 常规款 尺码信息 "
            "您有650元消费券待使用，请尽快使用哦 距结束 4天18小时 "
            "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣 已售 5000+ "
            "多人评价\"尺码刚好\" 回头客898人 超5千人加购 券后 ￥ 51 优惠前￥69.9 "
            "颜色 切换大图模式 白色 千人加购 黑色 深灰色 花灰色 湖蓝 绿色 尺码 2XS 女生码 XS S M L XL"
        )

        payload = build_capture_payload(
            {
                "url": "https://item.taobao.com/item.htm?id=1018415883889",
                "title": "宝贝描述",
                "bodyText": raw_text,
                "metaTitles": [],
                "images": [],
                "scripts": [
                    """
                    window.__NAV__ = {"title": "卖家服务"};
                    window.__SIZE__ = {
                      "props": [
                        {"name": "袖长", "value": "15.5cm"},
                        {"name": "衣长", "value": "59cm"},
                        {"name": "袖长", "value": "19cm"},
                        {"name": "衣长", "value": "64cm"},
                        {"name": "袖长", "value": "20cm"},
                        {"name": "衣长", "value": "66cm"},
                        {"name": "袖长", "value": "21cm"},
                        {"name": "衣长", "value": "68cm"},
                        {"name": "袖长", "value": "22cm"},
                        {"name": "衣长", "value": "70cm"},
                        {"name": "袖长", "value": "23cm"},
                        {"name": "衣长", "value": "72cm"}
                      ]
                    };
                    """
                ],
            },
            captured_at="2026-06-10T08:00:00.000Z",
        )

        item = payload["items"][0]
        props = {prop["name"]: prop["value"] for prop in item["detailProps"]}
        self.assertEqual(item["detailTitle"], "UTIMUS/宗师tee01 液氨纯棉情侣短袖T恤男女同款夏季抗皱透气上衣")
        self.assertEqual(props["品牌"], "UTIMUS")
        self.assertEqual(props["材质成分"], "棉100%")
        self.assertEqual(props["面料"], "纯棉")
        self.assertEqual(props["适用季节"], "夏季")
        self.assertEqual(props["货号"], "C2601018")
        self.assertEqual(props["颜色"], "深灰色,黑色,白色,绿色,花灰色,湖蓝")

    def test_collector_javascript_does_not_read_browser_credentials_or_storage(self):
        script = build_collector_snapshot_script()

        self.assertNotIn("document.cookie", script)
        self.assertNotIn("localStorage", script)
        self.assertNotIn("sessionStorage", script)
        self.assertIn("document.body", script)
        self.assertIn("document.scripts", script)
        self.assertIn("bodyText: (document.body && document.body.innerText) || \"\"", script)

    def test_webdriver_localhost_connections_bypass_configured_http_proxy(self):
        with patch.dict(os.environ, {"HTTP_PROXY": "http://127.0.0.1:10809", "NO_PROXY": "example.com"}, clear=False):
            ensure_local_webdriver_bypasses_proxy()

            entries = {entry.strip() for entry in os.environ["NO_PROXY"].split(",")}
            self.assertIn("example.com", entries)
            self.assertIn("localhost", entries)
            self.assertIn("127.0.0.1", entries)
            self.assertIn("::1", entries)
            self.assertEqual(os.environ["no_proxy"], os.environ["NO_PROXY"])

    def test_create_chrome_driver_uses_persistent_profile_dir(self):
        profile_dir = Path("output/chrome-taobao-profile")

        with patch("selenium.webdriver.chrome.options.Options") as options_factory:
            with patch("selenium.webdriver.Chrome") as chrome:
                create_chrome_driver(profile_dir=profile_dir)

        options = options_factory.return_value
        options.add_argument.assert_any_call(f"--user-data-dir={profile_dir}")
        chrome.assert_called_once_with(options=options)

    def test_scroll_for_lazy_content_uses_bounded_jitter_between_steps(self):
        class FakeDriver:
            def __init__(self):
                self.scrolls = []

            def execute_script(self, script, *args):
                if script.startswith("return Math.max"):
                    return 2000
                if script.startswith("return window.innerHeight"):
                    return 1000
                if script.startswith("window.scrollTo"):
                    self.scrolls.append(args[0] if args else 0)
                return None

        driver = FakeDriver()
        with patch.object(capture.random, "uniform", side_effect=[0.9, 1.1, 1.3]) as uniform:
            with patch.object(capture.time, "sleep") as sleep:
                capture.scroll_for_lazy_content(driver, steps=3, min_delay_seconds=0.8, max_delay_seconds=1.4)

        uniform.assert_any_call(0.8, 1.4)
        self.assertEqual(driver.scrolls, [0, 500, 1000, 0])
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [0.9, 1.1, 1.3, 0.6])

    def test_capture_passes_configured_scroll_delays(self):
        class FakeDriver:
            def __init__(self):
                self.quit_called = False

            def get(self, _url):
                pass

            def quit(self):
                self.quit_called = True

        driver = FakeDriver()
        snapshot = {
            "url": "https://item.taobao.com/item.htm?id=101",
            "title": "黑色短袖T恤",
            "bodyText": "商品参数\n品牌 UTIMUS\n商品详情\n纯棉短袖。",
            "metaTitles": ["黑色短袖T恤"],
            "images": ["https://img.alicdn.com/main.jpg"],
            "scripts": [],
        }

        with tempfile.TemporaryDirectory() as output_dir:
            with patch.object(capture, "create_chrome_driver", return_value=driver):
                with patch.object(capture, "wait_for_page_ready"):
                    with patch.object(capture, "wait_for_manual_login"):
                        with patch.object(capture, "scroll_for_lazy_content") as scroll:
                            with patch.object(capture, "collect_snapshot", return_value=snapshot):
                                capture.capture_with_browser(
                                    "https://item.taobao.com/item.htm?id=101",
                                    login_wait=0,
                                    output_dir=Path(output_dir),
                                    profile_dir=Path("output/chrome-taobao-profile"),
                                    retry_count=0,
                                    ready_timeout=45,
                                    min_scroll_delay=1.4,
                                    max_scroll_delay=3.2,
                                )

        scroll.assert_called_once_with(driver, min_delay_seconds=1.4, max_delay_seconds=3.2)
        self.assertTrue(driver.quit_called)

    def test_capture_retries_login_page_and_writes_final_successful_payload(self):
        class FakeDriver:
            def __init__(self):
                self.loaded_urls = []
                self.refresh_count = 0
                self.quit_called = False

            def get(self, url):
                self.loaded_urls.append(url)

            def refresh(self):
                self.refresh_count += 1

            def quit(self):
                self.quit_called = True

        driver = FakeDriver()
        login_snapshot = {
            "url": "https://login.taobao.com/havanaone/login/login.htm",
            "title": "服务协议及隐私保护",
            "bodyText": "手机扫码登录 打开 淘宝APP",
            "metaTitles": [],
            "images": [],
            "scripts": [],
        }
        success_snapshot = {
            "url": "https://item.taobao.com/item.htm?id=101",
            "title": "黑色短袖T恤",
            "bodyText": "商品参数\n品牌 UTIMUS\n商品详情\n纯棉短袖。",
            "metaTitles": ["黑色短袖T恤"],
            "images": ["https://img.alicdn.com/main.jpg"],
            "scripts": [],
        }

        with tempfile.TemporaryDirectory() as output_dir:
            with patch.object(capture, "create_chrome_driver", return_value=driver) as create_driver:
                with patch.object(capture, "wait_for_page_ready"):
                    with patch.object(capture, "wait_for_manual_login"):
                        with patch.object(capture, "scroll_for_lazy_content"):
                            with patch.object(capture, "collect_snapshot", side_effect=[login_snapshot, success_snapshot]):
                                output_path = capture.capture_with_browser(
                                    "https://item.taobao.com/item.htm?id=101",
                                    login_wait=0,
                                    output_dir=Path(output_dir),
                                    profile_dir=Path("output/chrome-taobao-profile"),
                                    retry_count=1,
                                    ready_timeout=45,
                                    min_scroll_delay=1.4,
                                    max_scroll_delay=3.2,
                                )

            payload = json.loads(output_path.read_text(encoding="utf-8"))

        create_driver.assert_called_once_with(Path("output/chrome-taobao-profile"))
        self.assertEqual(driver.loaded_urls, ["https://item.taobao.com/item.htm?id=101"])
        self.assertEqual(driver.refresh_count, 1)
        self.assertTrue(driver.quit_called)
        self.assertEqual(payload["items"][0]["itemId"], "101")
        self.assertEqual(payload["items"][0]["detailTitle"], "黑色短袖T恤")

    def test_validate_item_detail_payload_rejects_login_page_capture(self):
        payload = build_capture_payload(
            {
                "url": "https://login.taobao.com/havanaone/login/login.htm",
                "title": "服务协议及隐私保护",
                "bodyText": "手机扫码登录 打开 淘宝APP",
                "metaTitles": [],
                "images": [],
                "scripts": [],
            },
            captured_at="2026-06-10T08:00:00.000Z",
        )

        with self.assertRaisesRegex(RuntimeError, "login page"):
            validate_item_detail_payload(payload)

    def test_validate_item_detail_payload_rejects_risk_or_captcha_page(self):
        payload = build_capture_payload(
            {
                "url": "https://item.taobao.com/item.htm?id=101",
                "title": "安全验证",
                "bodyText": "安全验证 请拖动滑块完成验证",
                "metaTitles": [],
                "images": [],
                "scripts": [],
            },
            captured_at="2026-06-10T08:00:00.000Z",
        )

        with self.assertRaisesRegex(RuntimeError, "risk/captcha"):
            validate_item_detail_payload(payload)

    def test_validate_item_detail_payload_rejects_empty_shell_page(self):
        payload = build_capture_payload(
            {
                "url": "https://item.taobao.com/item.htm?id=101",
                "title": "淘宝网 - 淘宝",
                "bodyText": "淘宝网首页 购物车30 收藏夹 帮助中心 登录 注册",
                "metaTitles": [],
                "images": [],
                "scripts": [],
            },
            captured_at="2026-06-10T08:00:00.000Z",
        )

        with self.assertRaisesRegex(RuntimeError, "empty shell"):
            validate_item_detail_payload(payload)

    def test_parse_args_accepts_persistent_capture_options(self):
        args = parse_args(
            [
                "--url",
                "https://item.taobao.com/item.htm?id=101",
                "--profile-dir",
                "profiles/taobao",
                "--retry-count",
                "4",
                "--ready-timeout",
                "50",
                "--min-scroll-delay",
                "1.4",
                "--max-scroll-delay",
                "3.2",
            ]
        )

        self.assertEqual(args.profile_dir, Path("profiles/taobao"))
        self.assertEqual(args.retry_count, 4)
        self.assertEqual(args.ready_timeout, 50)
        self.assertEqual(args.min_scroll_delay, 1.4)
        self.assertEqual(args.max_scroll_delay, 3.2)


if __name__ == "__main__":
    unittest.main()
