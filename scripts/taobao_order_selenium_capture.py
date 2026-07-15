from __future__ import annotations

import argparse
import json
import random
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse, parse_qs

from selenium.webdriver.common.by import By

try:
    from scripts.taobao_selenium_capture import (
        DEFAULT_PROFILE_DIR,
        create_chrome_driver,
        scroll_for_lazy_content,
        wait_for_manual_login,
        wait_for_page_ready,
    )
except ModuleNotFoundError as error:
    if error.name != "scripts.taobao_selenium_capture":
        raise
    from taobao_selenium_capture import (  # type: ignore[no-redef]
        DEFAULT_PROFILE_DIR,
        create_chrome_driver,
        scroll_for_lazy_content,
        wait_for_manual_login,
        wait_for_page_ready,
    )


DEFAULT_BOUGHT_ITEMS_URL = "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm"
DEFAULT_OUTPUT_DIR = Path("output/taobao-captures")
DEFAULT_MAX_PAGES = 3
DEFAULT_LOGIN_WAIT = 60
DEFAULT_RETRY_COUNT = 2
DEFAULT_READY_TIMEOUT = 45
DEFAULT_MIN_PAGE_DELAY_SECONDS = 1.4
DEFAULT_MAX_PAGE_DELAY_SECONDS = 3.2

LOGIN_URL_PATTERN = re.compile(r"login\.taobao\.com|login\.tmall\.com|havanaone/login", re.I)
LOGIN_TEXT_PATTERN = re.compile(
    r"scan\s*qr|qr\s*code|login\s*page|open\s*taobao\s*app|"
    r"扫码登录|手机扫码登录|密码登录|短信登录|登录页面|打开\s*淘宝APP",
    re.I,
)
RISK_URL_PATTERN = re.compile(r"punish|captcha|baxia|sec\.taobao|verify|_____tmd_____", re.I)
RISK_TEXT_PATTERN = re.compile(
    r"security\s*verification|captcha|slider|abnormal\s*access|access\s*denied|"
    r"安全验证|验证码|拖动滑块|滑块|访问受限|访问被拒绝|风险|异常访问|验证身份",
    re.I,
)
STATUS_PATTERN = re.compile(
    r"Trade success|Transaction closed|Buyer paid|Seller shipped|Pending payment|Pending delivery|"
    r"Pending receipt|Pending review|Completed|交易成功|交易关闭|买家已付款|卖家已发货|"
    r"待付款|待发货|待收货|待评价|已完成",
    re.I,
)
REFUND_PATTERN = re.compile(
    r"Refund successful|Refunding|After-sale successful|"
    r"退款成功|退款中|退货退款|售后成功|售后中|申请退款",
    re.I,
)
SKU_PATTERN = re.compile(
    r"(Color|Colour|Size|Spec|SKU|颜色分类|颜色|尺码|规格|分类|款式|型号)\s*[:：]\s*"
    r"(.+?)(?=\s+(?:Color|Colour|Size|Spec|SKU|Quantity|Qty|颜色分类|颜色|尺码|规格|分类|款式|型号)\s*[:：]|"
    r"\s+[xX×]\s*\d|\s+[$¥￥]\s*\d|\s+(?:Trade|Transaction|Refund|Order)\b|$)",
    re.I,
)


class RetryableOrderCaptureError(RuntimeError):
    pass


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def iso_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_resource_url(value: str, base_url: str = DEFAULT_BOUGHT_ITEMS_URL) -> str:
    url = clean_text(str(value or "").replace(r"\/", "/"))
    if not url:
        return ""
    if url.startswith("//"):
        return f"https:{url}"
    return urljoin(base_url, url)


def unique_strings(values: list[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = clean_text(value)
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        output.append(cleaned)
    return output


def extract_item_id(url: str | None) -> str:
    if not url:
        return ""
    try:
        parsed = urlparse(url)
        item_id = parse_qs(parsed.query).get("id", [""])[0]
        if item_id:
            return clean_text(item_id)
    except ValueError:
        pass
    match = re.search(r"[?&]id=(\d+)", str(url or ""))
    return match.group(1) if match else ""


def extract_order_id(raw_text: str) -> str:
    patterns = [
        r"(?:Order\s*(?:No|Number|ID)?|OrderNo)\s*[:：#]?\s*(\d{10,30})",
        r"(?:订单号|订单编号)\s*[:：]?\s*(\d{10,30})",
        r"\b(\d{16,30})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, raw_text, re.I)
        if match:
            return clean_text(match.group(1))
    return ""


def extract_order_time(raw_text: str) -> str:
    match = re.search(r"(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?\s+\d{1,2}:\d{2}(?::\d{2})?)", raw_text)
    return clean_text(match.group(1)) if match else ""


def extract_sku(raw_text: str) -> str:
    parts: list[str] = []
    for match in SKU_PATTERN.finditer(raw_text):
        name = clean_text(match.group(1))
        value = clean_text(match.group(2))
        value = re.sub(r"\s+(?:Quantity|Qty)\s*[:：]?\s*\d+.*$", "", value, flags=re.I)
        value = re.sub(r"\s+[xX×]\s*\d+.*$", "", value)
        value = re.sub(r"\s+[$¥￥]\s*\d+.*$", "", value)
        value = re.sub(r"\s+(?:Trade|Transaction|Refund)\b.*$", "", value, flags=re.I)
        if name and value:
            parts.append(f"{name}: {value}")
    return "; ".join(unique_strings(parts))


def extract_quantity(raw_text: str) -> int | None:
    match = re.search(r"(?:Quantity|Qty|数量)\s*[:：]?\s*(\d{1,3})", raw_text, re.I)
    if not match:
        match = re.search(r"(?:^|\s)[x×]\s*(\d{1,3})(?=\s*[$¥￥])", raw_text)
    if not match:
        return None
    parsed = int(match.group(1))
    return parsed if parsed > 0 else None


def extract_payment(raw_text: str) -> str:
    labels = r"(?:Total(?:\s+Paid)?|Paid|Payment|实付款|实付|付款|合计|总价)"
    amount = r"([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)"
    for pattern in [
        rf"{labels}\s*[:：]?\s*[$¥￥]?\s*{amount}",
        rf"[$¥￥]\s*{amount}\s*{labels}",
    ]:
        match = re.search(pattern, raw_text, re.I)
        if match:
            return clean_text(match.group(1)).replace(",", "")
    unlabeled = re.findall(rf"[$¥￥]\s*{amount}", raw_text)
    quantity = extract_quantity(raw_text)
    if len(unlabeled) == 1 and quantity in {None, 1}:
        return clean_text(unlabeled[0]).replace(",", "")
    return ""


def extract_status(raw_text: str) -> str:
    match = STATUS_PATTERN.search(raw_text)
    return clean_text(match.group(0)) if match else ""


def extract_refund_text(raw_text: str) -> str:
    match = REFUND_PATTERN.search(raw_text)
    return clean_text(match.group(0)) if match else ""


def first_link(links: Any) -> dict[str, Any]:
    if not isinstance(links, list):
        return {}
    for link in links:
        if not isinstance(link, dict):
            continue
        href = clean_text(link.get("href", ""))
        if re.search(r"item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com", href, re.I):
            return link
    for link in links:
        if isinstance(link, dict):
            return link
    return {}


def unique_product_links(links: Any, base_url: str) -> list[dict[str, Any]]:
    if not isinstance(links, list):
        return []
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for value in links:
        if not isinstance(value, dict):
            continue
        href = normalize_resource_url(str(value.get("href", "")), base_url)
        if not re.search(r"item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com", href, re.I):
            continue
        key = extract_item_id(href) or href
        if not key or key in seen:
            continue
        seen.add(key)
        result.append({**value, "href": href})
    return result


def first_image(images: Any, base_url: str) -> str:
    if not isinstance(images, list):
        return ""
    for image in images:
        url = normalize_resource_url(str(image or ""), base_url)
        if url:
            return url
    return ""


def title_from_container(container: dict[str, Any], link: dict[str, Any], raw_text: str) -> str:
    candidates = [
        link.get("text", ""),
        link.get("title", ""),
        container.get("title", ""),
    ]
    for candidate in candidates:
        title = clean_text(candidate)
        if title:
            return title[:180]

    cleaned = raw_text
    for pattern in [
        r"20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?\s+\d{1,2}:\d{2}(?::\d{2})?",
        r"(?:Order\s*(?:No|Number|ID)?|OrderNo)\s*[:：#]?\s*\d{10,30}",
        r"(?:订单号|订单编号)\s*[:：]?\s*\d{10,30}",
        r"(Color|Colour|Size|Spec|SKU|Quantity|Qty|颜色分类|颜色|尺码|规格|分类|款式|型号)\s*[:：].*$",
        r"[xX×]\s*\d+.*$",
        r"[$¥￥]\s*\d+(?:\.\d{1,2})?.*$",
    ]:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.I)
    return clean_text(cleaned)[:180]


def normalize_order_item(container: dict[str, Any], base_url: str) -> dict[str, Any] | None:
    raw_text = clean_text(container.get("rawText", ""))
    link = first_link(container.get("links", []))
    item_url = normalize_resource_url(str(link.get("href", "")), base_url)
    title = title_from_container(container, link, raw_text)
    image_url = first_image(container.get("images", []), base_url)
    if not raw_text and not title and not item_url:
        return None

    item = {
        "pageType": "order-list",
        "itemId": extract_item_id(item_url),
        "orderId": extract_order_id(raw_text),
        "orderTime": extract_order_time(raw_text),
        "title": title,
        "sku": extract_sku(raw_text),
        "payment": extract_payment(raw_text),
        "status": extract_status(raw_text),
        "refundText": extract_refund_text(raw_text),
        "itemUrl": item_url,
        "imageUrl": image_url,
        "rawText": raw_text[:2000],
    }
    quantity = extract_quantity(raw_text)
    if quantity is not None:
        item["quantity"] = quantity
    return item


def normalize_order_items(container: dict[str, Any], base_url: str) -> list[dict[str, Any]]:
    links = unique_product_links(container.get("links", []), base_url)
    if len(links) <= 1:
        item = normalize_order_item(container, base_url)
        return [item] if item else []

    raw_text = clean_text(container.get("rawText", ""))
    common = {
        "pageType": "order-list",
        "orderId": extract_order_id(raw_text),
        "orderTime": extract_order_time(raw_text),
        "sku": "",
        "payment": "",
        "status": extract_status(raw_text),
        "refundText": extract_refund_text(raw_text),
        "imageUrl": "",
        "rawText": raw_text[:2000],
    }
    return [{
        **common,
        "itemId": extract_item_id(str(link.get("href", ""))),
        "title": title_from_container(container, link, raw_text),
        "itemUrl": str(link.get("href", "")),
    } for link in links]


def merge_order_items(current: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = dict(current)
    for key, value in incoming.items():
        if key not in merged or merged[key] in {None, ""}:
            if value not in {None, ""}:
                merged[key] = value
    return merged


def item_dedupe_key(item: dict[str, Any]) -> str:
    item_id = clean_text(item.get("itemId", ""))
    sku = clean_text(item.get("sku", ""))
    order_id = clean_text(item.get("orderId", ""))
    if item_id or sku or order_id:
        return f"{item_id}|{sku}|{order_id}"
    return clean_text("|".join([item.get("itemUrl", ""), item.get("title", ""), item.get("rawText", "")[:240]]))


def build_order_payload(snapshots: list[dict[str, Any]], captured_at: str | None = None) -> dict[str, Any]:
    first_snapshot = snapshots[0] if snapshots else {}
    page_url = clean_text(first_snapshot.get("url", "")) or DEFAULT_BOUGHT_ITEMS_URL
    page_text = clean_text(
        " ".join(
            clean_text(f"{snapshot.get('title', '')} {snapshot.get('bodyText', '')}")
            for snapshot in snapshots
            if isinstance(snapshot, dict)
        )
    )
    items_by_key: dict[str, dict[str, Any]] = {}
    item_order: list[str] = []

    for snapshot in snapshots:
        base_url = clean_text(snapshot.get("url", "")) or page_url
        containers = snapshot.get("containers", [])
        if not isinstance(containers, list):
            continue
        for container in containers:
            if not isinstance(container, dict):
                continue
            for item in normalize_order_items(container, base_url):
                key = item_dedupe_key(item)
                if key in items_by_key:
                    items_by_key[key] = merge_order_items(items_by_key[key], item)
                    continue
                item_order.append(key)
                items_by_key[key] = item

    items = [items_by_key[key] for key in item_order]

    return {
        "source": "taobao-selenium-order-list",
        "pageType": "order-list",
        "capturedAt": captured_at or iso_now(),
        "pageUrl": page_url,
        "items": items,
        "_pageText": page_text[:4000],
    }


def validate_order_list_payload(payload: dict[str, Any]) -> None:
    page_url = clean_text(payload.get("pageUrl", ""))
    page_text = clean_text(
        " ".join(
            [
                page_url,
                clean_text(payload.get("_pageText", "")),
                *[clean_text(item.get("rawText", "")) for item in payload.get("items", []) if isinstance(item, dict)],
            ]
        )
    )

    if LOGIN_URL_PATTERN.search(page_url) or LOGIN_TEXT_PATTERN.search(page_text):
        raise RetryableOrderCaptureError("Capture is still on Taobao login page / QR login needed; scan the QR code and run again with a longer --login-wait.")
    if RISK_URL_PATTERN.search(page_url) or RISK_TEXT_PATTERN.search(page_text):
        raise RuntimeError("Capture is on a Taobao risk/captcha page; handle the verification manually before running again. This script does not bypass verification.")
    if payload.get("pageType") != "order-list":
        raise RuntimeError(f"Capture is not an order-list payload: {page_url}")
    if not payload.get("items"):
        raise RuntimeError("No Taobao order items were captured; the page may not have finished loading or the DOM selectors may need updating.")


def build_order_collector_snapshot_script() -> str:
    return r"""
return (() => {
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const attr = (node, name) => node && node.getAttribute ? node.getAttribute(name) : "";
  const visible = node => {
    if (!node || !node.getBoundingClientRect) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const abs = value => {
    try { return new URL(value, location.href).href; } catch { return clean(value); }
  };
  const imageValues = node => {
    const values = [];
    for (const image of node.querySelectorAll("img,source")) {
      for (const key of ["currentSrc", "src", "data-src", "data-ks-lazyload", "data-lazyload", "data-original", "srcset"]) {
        const value = image[key] || attr(image, key);
        if (value) values.push(value);
      }
    }
    return [...new Set(values.map(value => {
      const normalized = clean(String(value).replace(/\\\//g, "/"));
      return normalized.startsWith("//") ? "https:" + normalized : abs(normalized);
    }).filter(Boolean))];
  };
  const linkValues = node => Array.from(node.querySelectorAll("a[href]"))
    .filter(visible)
    .map(link => ({ href: abs(link.href || attr(link, "href")), text: clean(link.innerText || link.textContent), title: clean(attr(link, "title")) }))
    .filter(link => link.href || link.text || link.title);
  const nodes = [];
  const selectors = [
    "#tp-bought-root .js-order-container",
    ".js-order-container",
    "[class*='order-container']",
    "[class*='bought']",
    "[data-id*='order']"
  ];
  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      if (visible(node) && !nodes.includes(node)) nodes.push(node);
    }
  }
  if (!nodes.length) {
    for (const link of document.querySelectorAll("a[href*='item'],a[href*='detail']")) {
      let node = link;
      for (let depth = 0; depth < 6 && node.parentElement; depth += 1) {
        node = node.parentElement;
        if (clean(node.innerText).length > 60) break;
      }
      if (visible(node) && !nodes.includes(node)) nodes.push(node);
    }
  }
  return {
    url: location.href,
    title: document.title || "",
    bodyText: (document.body && document.body.innerText) || "",
    containers: nodes.map(node => ({
      rawText: clean(node.innerText || node.textContent).slice(0, 4000),
      links: linkValues(node),
      images: imageValues(node)
    })).filter(item => item.rawText || item.links.length || item.images.length)
  };
})();
"""


def collect_order_snapshot(driver: Any) -> dict[str, Any]:
    snapshot = driver.execute_script(build_order_collector_snapshot_script())
    if not isinstance(snapshot, dict):
        raise RuntimeError("Unable to collect Taobao order-list snapshot from browser")
    return snapshot


def default_output_path(output_dir: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return output_dir / f"taobao-orders-{timestamp}.json"


def write_payload(payload: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = default_output_path(output_dir)
    public_payload = {key: value for key, value in payload.items() if not str(key).startswith("_")}
    path.write_text(json.dumps(public_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def is_clickable_next_button(button: Any) -> bool:
    class_name = clean_text(button.get_attribute("class") or "").lower()
    aria_disabled = clean_text(button.get_attribute("aria-disabled") or "").lower()
    disabled = clean_text(button.get_attribute("disabled") or "").lower()
    if aria_disabled == "true" or disabled in {"true", "disabled"}:
        return False
    if any(token in class_name for token in ["disabled", "pagination-disabled", "next-disabled"]):
        return False
    enabled = getattr(button, "is_enabled", None)
    if callable(enabled):
        return bool(enabled())
    if enabled is not None:
        return bool(enabled)
    return True


def find_next_button(driver: Any) -> Any | None:
    selectors = [".pagination-next", "button.pagination-next", "a.pagination-next", "[class*='pagination-next']"]
    for selector in selectors:
        buttons = driver.find_elements(By.CSS_SELECTOR, selector)
        for button in buttons:
            if is_clickable_next_button(button):
                return button
    return None


def collect_valid_snapshot(driver: Any, retry_count: int, ready_timeout: int) -> dict[str, Any]:
    last_error: RetryableOrderCaptureError | None = None
    for attempt in range(max(0, retry_count) + 1):
        if attempt > 0:
            print(f"Retrying Taobao order capture after retryable page state ({attempt}/{retry_count}): {last_error}")
            time.sleep(random.uniform(DEFAULT_MIN_PAGE_DELAY_SECONDS, DEFAULT_MAX_PAGE_DELAY_SECONDS))
            refresh = getattr(driver, "refresh", None)
            if callable(refresh):
                refresh()
        wait_for_page_ready(driver, ready_timeout)
        scroll_for_lazy_content(driver)
        snapshot = collect_order_snapshot(driver)
        payload = build_order_payload([snapshot])
        try:
            validate_order_list_payload(payload)
            return snapshot
        except RetryableOrderCaptureError as error:
            last_error = error
            if attempt >= max(0, retry_count):
                raise
    if last_error:
        raise last_error
    raise RuntimeError("Capture failed before an order-list snapshot could be validated.")


def capture_orders_with_browser(
    url: str,
    login_wait: int,
    output_dir: Path,
    profile_dir: Path = DEFAULT_PROFILE_DIR,
    max_pages: int = DEFAULT_MAX_PAGES,
    retry_count: int = DEFAULT_RETRY_COUNT,
    ready_timeout: int = DEFAULT_READY_TIMEOUT,
    min_page_delay: float = DEFAULT_MIN_PAGE_DELAY_SECONDS,
    max_page_delay: float = DEFAULT_MAX_PAGE_DELAY_SECONDS,
) -> Path:
    driver = create_chrome_driver(profile_dir)
    snapshots: list[dict[str, Any]] = []
    try:
        driver.get(url)
        wait_for_page_ready(driver, ready_timeout)
        wait_for_manual_login(login_wait)
        for page_index in range(max(1, max_pages)):
            snapshots.append(collect_valid_snapshot(driver, retry_count, ready_timeout))
            if page_index >= max(1, max_pages) - 1:
                break
            next_button = find_next_button(driver)
            if not next_button:
                break
            next_button.click()
            delay_max = max(min_page_delay, max_page_delay)
            time.sleep(random.uniform(min_page_delay, delay_max))
        payload = build_order_payload(snapshots)
        validate_order_list_payload(payload)
        return write_payload(payload, output_dir)
    finally:
        driver.quit()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture Taobao bought-item order list data into an Outfit-compatible JSON payload.",
        epilog=(
            "First run: scan the QR code in the opened Chrome window. Later runs reuse --profile-dir. "
            "If Taobao shows verification, handle it manually; this script does not bypass captcha or risk controls."
        ),
    )
    parser.add_argument("--url", default=DEFAULT_BOUGHT_ITEMS_URL, help="Taobao bought-items order list URL.")
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES, help="Maximum order-list pages to capture.")
    parser.add_argument("--login-wait", type=int, default=DEFAULT_LOGIN_WAIT, help="Seconds to wait for manual QR login before capturing.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Directory for captured JSON files.")
    parser.add_argument("--profile-dir", type=Path, default=DEFAULT_PROFILE_DIR, help="Persistent Chrome user data directory for reusing Taobao login state.")
    parser.add_argument("--retry-count", type=int, default=DEFAULT_RETRY_COUNT, help="Retries for retryable page states such as login pages.")
    parser.add_argument("--ready-timeout", type=int, default=DEFAULT_READY_TIMEOUT, help="Seconds to wait for page body and document readiness.")
    parser.add_argument("--min-page-delay", type=float, default=DEFAULT_MIN_PAGE_DELAY_SECONDS, help="Minimum seconds between page turns.")
    parser.add_argument("--max-page-delay", type=float, default=DEFAULT_MAX_PAGE_DELAY_SECONDS, help="Maximum seconds between page turns.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    output_path = capture_orders_with_browser(
        url=args.url,
        login_wait=args.login_wait,
        output_dir=args.output_dir,
        profile_dir=args.profile_dir,
        max_pages=args.max_pages,
        retry_count=args.retry_count,
        ready_timeout=args.ready_timeout,
        min_page_delay=args.min_page_delay,
        max_page_delay=args.max_page_delay,
    )
    print(f"Wrote Taobao order capture JSON: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
