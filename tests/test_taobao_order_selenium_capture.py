import importlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pytest


BOUGHT_ITEMS_URL = "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm"


def load_capture():
    try:
        return importlib.import_module("scripts.taobao_order_selenium_capture")
    except ModuleNotFoundError as error:
        pytest.fail(f"crawler module missing: {error}")


class TaobaoOrderSeleniumCaptureTests(unittest.TestCase):
    def test_extract_payment_prefers_explicit_paid_total_over_unit_price(self):
        capture = load_capture()

        self.assertEqual(
            capture.extract_payment("单价￥100 x2 实付款￥200"),
            "200",
        )
        self.assertEqual(capture.extract_payment("实付款：￥1,299.00"), "1299.00")

    def test_does_not_invent_quantity_or_payment_from_model_tokens_and_unit_prices(self):
        capture = load_capture()

        self.assertIsNone(capture.extract_quantity("型号: X100 ￥200"))
        self.assertIsNone(capture.extract_quantity("联名款X2 ￥300"))
        self.assertEqual(capture.extract_payment("商品 x2 ￥100"), "")
        self.assertEqual(capture.extract_refund_text("Refund closed"), "")

    def test_does_not_invent_quantity_when_order_text_has_no_quantity_evidence(self):
        capture = load_capture()

        item = capture.normalize_order_item(
            {
                "rawText": "Order No: 1234567890123456789 White cotton shirt $129.00 Trade success",
                "links": [{"href": "https://item.taobao.com/item.htm?id=1001", "text": "White cotton shirt"}],
                "images": ["https://img.alicdn.com/shirt.jpg"],
            },
            BOUGHT_ITEMS_URL,
        )

        self.assertIsNotNone(item)
        self.assertNotIn("quantity", item)
        self.assertEqual(item["payment"], "129.00")

    def test_builds_import_payload_from_order_list_snapshots(self):
        capture = load_capture()

        payload = capture.build_order_payload(
            [
                {
                    "url": BOUGHT_ITEMS_URL,
                    "title": "Bought items",
                    "bodyText": "Bought items",
                    "containers": [
                        {
                            "rawText": (
                                "2026-01-03 12:30:00 Order No: 1234567890123456789 "
                                "Black wool coat women winter thick Color: Black Size: M "
                                "x1 $399.00 Trade success"
                            ),
                            "links": [
                                {
                                    "href": "https://item.taobao.com/item.htm?id=101",
                                    "text": "Black wool coat women winter thick",
                                    "title": "",
                                }
                            ],
                            "images": ["//img.alicdn.com/coat.jpg"],
                        },
                        {
                            "rawText": (
                                "2026-01-05 09:00:00 Order No: 2234567890123456789 "
                                "Blue straight jeans Color: Blue Size: 30 Quantity: 2 "
                                "$129.50 Refund successful"
                            ),
                            "links": [
                                {
                                    "href": "https://detail.tmall.com/item.htm?id=202",
                                    "text": "Blue straight jeans",
                                    "title": "Blue straight jeans",
                                }
                            ],
                            "images": ["https://img.alicdn.com/pants.jpg"],
                        },
                    ],
                }
            ],
            captured_at="2026-06-11T05:30:00.000Z",
        )

        self.assertEqual(payload["source"], "taobao-selenium-order-list")
        self.assertEqual(payload["pageType"], "order-list")
        self.assertEqual(payload["capturedAt"], "2026-06-11T05:30:00.000Z")
        self.assertEqual(payload["pageUrl"], BOUGHT_ITEMS_URL)
        self.assertEqual(len(payload["items"]), 2)
        self.assertEqual(
            payload["items"][0],
            {
                "pageType": "order-list",
                "itemId": "101",
                "orderId": "1234567890123456789",
                "orderTime": "2026-01-03 12:30:00",
                "title": "Black wool coat women winter thick",
                "sku": "Color: Black; Size: M",
                "quantity": 1,
                "payment": "399.00",
                "status": "Trade success",
                "refundText": "",
                "itemUrl": "https://item.taobao.com/item.htm?id=101",
                "imageUrl": "https://img.alicdn.com/coat.jpg",
                "rawText": (
                    "2026-01-03 12:30:00 Order No: 1234567890123456789 "
                    "Black wool coat women winter thick Color: Black Size: M "
                    "x1 $399.00 Trade success"
                ),
            },
        )
        self.assertEqual(payload["items"][1]["quantity"], 2)
        self.assertEqual(payload["items"][1]["payment"], "")
        self.assertEqual(payload["items"][1]["refundText"], "Refund successful")
        json.dumps(payload, ensure_ascii=False)

    def test_deduplicates_by_item_id_sku_and_order_id(self):
        capture = load_capture()
        snapshot = {
            "url": BOUGHT_ITEMS_URL,
            "title": "Bought items",
            "bodyText": "Bought items",
            "containers": [
                {
                    "rawText": "Order No: 1234567890123456789 White shirt Color: White Size: L x1 $199 Trade success",
                    "links": [{"href": "https://item.taobao.com/item.htm?id=303", "text": "White shirt"}],
                    "images": ["https://img.alicdn.com/shirt.jpg"],
                },
                {
                    "rawText": "Order No: 1234567890123456789 White shirt Color: White Size: L x1 $199 Trade success",
                    "links": [{"href": "https://item.taobao.com/item.htm?id=303", "text": "White shirt"}],
                    "images": ["https://img.alicdn.com/shirt.jpg"],
                },
            ],
        }

        payload = capture.build_order_payload([snapshot], captured_at="2026-06-11T05:30:00.000Z")

        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["itemId"], "303")
        self.assertEqual(payload["items"][0]["sku"], "Color: White; Size: L")

    def test_duplicate_snapshots_enrich_missing_explicit_amount_evidence(self):
        capture = load_capture()
        base = {
            "url": BOUGHT_ITEMS_URL,
            "title": "Bought items",
            "bodyText": "Bought items",
        }
        payload = capture.build_order_payload(
            [
                {
                    **base,
                    "containers": [{
                        "rawText": "Order No: 1234567890123456789 White shirt Color: White",
                        "links": [{"href": "https://item.taobao.com/item.htm?id=303", "text": "White shirt"}],
                        "images": [],
                    }],
                },
                {
                    **base,
                    "containers": [{
                        "rawText": "Order No: 1234567890123456789 White shirt Color: White Quantity: 2 Paid: ￥398",
                        "links": [{"href": "https://item.taobao.com/item.htm?id=303", "text": "White shirt"}],
                        "images": [],
                    }],
                },
            ],
            captured_at="2026-06-11T05:30:00.000Z",
        )

        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["quantity"], 2)
        self.assertEqual(payload["items"][0]["payment"], "398")

    def test_keeps_each_product_from_a_multi_item_order_without_guessing_shared_amounts(self):
        capture = load_capture()
        payload = capture.build_order_payload(
            [{
                "url": BOUGHT_ITEMS_URL,
                "title": "Bought items",
                "bodyText": "Bought items",
                "containers": [{
                    "rawText": (
                        "Order No: 1234567890123456789 "
                        "Black shirt Color: Black x1 ￥100 "
                        "White jeans Color: White x1 ￥200 实付款￥300 Trade success"
                    ),
                    "links": [
                        {"href": "https://item.taobao.com/item.htm?id=101", "text": "Black shirt"},
                        {"href": "https://item.taobao.com/item.htm?id=202", "text": "White jeans"},
                    ],
                    "images": [
                        "https://img.alicdn.com/shirt.jpg",
                        "https://img.alicdn.com/jeans.jpg",
                    ],
                }],
            }],
            captured_at="2026-06-11T05:30:00.000Z",
        )

        self.assertEqual([item["itemId"] for item in payload["items"]], ["101", "202"])
        for item in payload["items"]:
            self.assertNotIn("quantity", item)
            self.assertEqual(item["payment"], "")
            self.assertEqual(item["sku"], "")

    def test_collector_javascript_avoids_cookies_and_browser_storage(self):
        capture = load_capture()

        script = capture.build_order_collector_snapshot_script()

        self.assertNotIn("document.cookie", script)
        self.assertNotIn("localStorage", script)
        self.assertNotIn("sessionStorage", script)
        self.assertIn("document.querySelectorAll", script)
        self.assertIn("containers", script)

    def test_validate_order_payload_rejects_login_and_risk_pages(self):
        capture = load_capture()

        login_payload = capture.build_order_payload(
            [
                {
                    "url": "https://login.taobao.com/havanaone/login/login.htm",
                    "title": "Login page",
                    "bodyText": "Scan QR code login Open Taobao APP",
                    "containers": [],
                }
            ],
            captured_at="2026-06-11T05:30:00.000Z",
        )
        with self.assertRaisesRegex(RuntimeError, "login page"):
            capture.validate_order_list_payload(login_payload)

        risk_payload = capture.build_order_payload(
            [
                {
                    "url": "https://sec.taobao.com/query.htm",
                    "title": "Security verification",
                    "bodyText": "Security verification drag slider captcha abnormal access",
                    "containers": [],
                }
            ],
            captured_at="2026-06-11T05:30:00.000Z",
        )
        with self.assertRaisesRegex(RuntimeError, "risk/captcha"):
            capture.validate_order_list_payload(risk_payload)

    def test_validate_order_payload_uses_snapshot_text_for_login_detection(self):
        capture = load_capture()

        login_shell_payload = capture.build_order_payload(
            [
                {
                    "url": BOUGHT_ITEMS_URL,
                    "title": "Login required",
                    "bodyText": "Scan QR code login Open Taobao APP",
                    "containers": [],
                }
            ],
            captured_at="2026-06-11T05:30:00.000Z",
        )

        with self.assertRaisesRegex(RuntimeError, "login page"):
            capture.validate_order_list_payload(login_shell_payload)

    def test_validate_order_payload_rejects_empty_order_list_snapshots(self):
        capture = load_capture()

        empty_payload = capture.build_order_payload(
            [
                {
                    "url": BOUGHT_ITEMS_URL,
                    "title": "Bought items",
                    "bodyText": "已买到的宝贝 暂无订单 请稍后重试",
                    "containers": [],
                }
            ],
            captured_at="2026-06-11T05:30:00.000Z",
        )

        with self.assertRaisesRegex(RuntimeError, "No Taobao order items"):
            capture.validate_order_list_payload(empty_payload)

    def test_capture_paginates_retries_and_writes_payload(self):
        capture = load_capture()

        class FakeDriver:
            def __init__(self):
                self.loaded_urls = []
                self.clicks = 0
                self.quit_called = False

            def get(self, url):
                self.loaded_urls.append(url)

            def execute_script(self, _script):
                return {
                    "url": BOUGHT_ITEMS_URL,
                    "title": "Bought items",
                    "bodyText": "Bought items",
                    "containers": [
                        {
                            "rawText": f"Order No: 123456789012345678{self.clicks} Black tee x1 $99 Trade success",
                            "links": [{"href": f"https://item.taobao.com/item.htm?id=10{self.clicks}", "text": "Black tee"}],
                            "images": ["https://img.alicdn.com/tee.jpg"],
                        }
                    ],
                }

            def find_elements(self, _by, _selector):
                return [FakeNextButton(self)] if self.clicks < 1 else []

            def quit(self):
                self.quit_called = True

        class FakeNextButton:
            def __init__(self, driver):
                self.driver = driver

            def get_attribute(self, name):
                return "" if name == "class" else None

            def is_enabled(self):
                return True

            def click(self):
                self.driver.clicks += 1

        driver = FakeDriver()
        with tempfile.TemporaryDirectory() as output_dir:
            with patch.object(capture, "create_chrome_driver", return_value=driver) as create_driver:
                with patch.object(capture, "wait_for_page_ready"):
                    with patch.object(capture, "wait_for_manual_login"):
                        with patch.object(capture, "scroll_for_lazy_content"):
                            with patch.object(capture.time, "sleep"):
                                output_path = capture.capture_orders_with_browser(
                                    url=BOUGHT_ITEMS_URL,
                                    login_wait=0,
                                    output_dir=Path(output_dir),
                                    profile_dir=Path("output/chrome-taobao-profile"),
                                    max_pages=2,
                                    retry_count=0,
                                    ready_timeout=45,
                                    min_page_delay=0.1,
                                    max_page_delay=0.1,
                                )
            payload = json.loads(output_path.read_text(encoding="utf-8"))

        create_driver.assert_called_once_with(Path("output/chrome-taobao-profile"))
        self.assertEqual(driver.loaded_urls, [BOUGHT_ITEMS_URL])
        self.assertEqual(driver.clicks, 1)
        self.assertTrue(driver.quit_called)
        self.assertEqual(len(payload["items"]), 2)
        self.assertTrue(output_path.name.startswith("taobao-orders-"))

    def test_capture_retries_login_page_by_refreshing_before_success(self):
        capture = load_capture()

        class FakeDriver:
            def __init__(self):
                self.loaded_urls = []
                self.refresh_count = 0
                self.quit_called = False
                self.snapshots = [
                    {
                        "url": "https://login.taobao.com/havanaone/login/login.htm",
                        "title": "Login page",
                        "bodyText": "Scan QR code login Open Taobao APP",
                        "containers": [],
                    },
                    {
                        "url": BOUGHT_ITEMS_URL,
                        "title": "Bought items",
                        "bodyText": "Bought items",
                        "containers": [
                            {
                                "rawText": "Order No: 1234567890123456789 White shirt Color: White Size: M x1 $199 Trade success",
                                "links": [{"href": "https://item.taobao.com/item.htm?id=404", "text": "White shirt"}],
                                "images": ["https://img.alicdn.com/shirt.jpg"],
                            }
                        ],
                    },
                ]

            def get(self, url):
                self.loaded_urls.append(url)

            def execute_script(self, _script):
                return self.snapshots.pop(0)

            def find_elements(self, _by, _selector):
                return []

            def refresh(self):
                self.refresh_count += 1

            def quit(self):
                self.quit_called = True

        driver = FakeDriver()
        with tempfile.TemporaryDirectory() as output_dir:
            with patch.object(capture, "create_chrome_driver", return_value=driver):
                with patch.object(capture, "wait_for_page_ready"):
                    with patch.object(capture, "wait_for_manual_login"):
                        with patch.object(capture, "scroll_for_lazy_content"):
                            with patch.object(capture.time, "sleep"):
                                output_path = capture.capture_orders_with_browser(
                                    url=BOUGHT_ITEMS_URL,
                                    login_wait=0,
                                    output_dir=Path(output_dir),
                                    profile_dir=Path("output/chrome-taobao-profile"),
                                    max_pages=1,
                                    retry_count=1,
                                    ready_timeout=45,
                                    min_page_delay=0.1,
                                    max_page_delay=0.1,
                                )
            payload = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(driver.refresh_count, 1)
        self.assertTrue(driver.quit_called)
        self.assertEqual(payload["items"][0]["itemId"], "404")

    def test_parse_args_accepts_order_capture_options(self):
        capture = load_capture()

        args = capture.parse_args(
            [
                "--url",
                BOUGHT_ITEMS_URL,
                "--max-pages",
                "5",
                "--login-wait",
                "60",
                "--output-dir",
                "captures",
                "--profile-dir",
                "profiles/taobao",
                "--retry-count",
                "2",
                "--ready-timeout",
                "50",
                "--min-page-delay",
                "1.5",
                "--max-page-delay",
                "4.0",
            ]
        )

        self.assertEqual(args.max_pages, 5)
        self.assertEqual(args.login_wait, 60)
        self.assertEqual(args.output_dir, Path("captures"))
        self.assertEqual(args.profile_dir, Path("profiles/taobao"))
        self.assertEqual(args.retry_count, 2)
        self.assertEqual(args.ready_timeout, 50)
        self.assertEqual(args.min_page_delay, 1.5)
        self.assertEqual(args.max_page_delay, 4.0)

    def test_cli_help_runs_when_script_is_executed_by_path(self):
        project_root = Path(__file__).resolve().parents[1]

        result = subprocess.run(
            [sys.executable, "scripts/taobao_order_selenium_capture.py", "--help"],
            cwd=project_root,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--max-pages", result.stdout)
        self.assertIn("--login-wait", result.stdout)


if __name__ == "__main__":
    unittest.main()
