from __future__ import annotations

import argparse
import json
import os
import random
import re
import time
from datetime import UTC, datetime
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


DETAIL_PROP_NAME_PATTERN = re.compile(
    r"品牌|材质|面料|颜色|尺码|尺寸|闭合|鞋面|成分|款式|厚薄|厚度|季节|风格|货号|版型|领型|袖长|衣长|裤长|腰型|图案|功能|性别|适用|上市|填充物|弹力"
)
NOISE_TEXT_PATTERN = re.compile(
    r"^(淘宝网(?:首页)?|天猫|我的淘宝|购物车\d*|收藏夹|帮助中心|免费开店|千牛卖家中心|用户调研|桌面版|进店|登录|注册|宝贝描述|卖家服务|淘宝网\s*-\s*淘宝)$"
)
IMAGE_URL_PATTERN = re.compile(
    r"""(?:https?:)?//[^"'\s<>\\]+?(?:alicdn|taobaocdn)[^"'\s<>\\]*?\.(?:jpg|jpeg|png|webp|gif)(?:_[^"'\s<>\\]*)?""",
    re.IGNORECASE,
)
VALUE_BEFORE_PARAM_NAMES = {
    "图案",
    "功能",
    "袖型",
    "面料",
    "适用体型",
    "领型设计",
    "材质成分",
    "版型分类",
}
NAME_BEFORE_PARAM_NAMES = {
    "基础风格",
    "是否商场同款",
    "结构细节",
    "适用场景",
    "适用季节",
    "上市年份季节",
    "袖长",
    "风格",
    "尺码",
    "颜色",
    "品牌",
    "适用人群",
    "货号",
    "适用性别",
    "产地",
    "厚薄",
    "衣门襟",
    "款式",
    "衣长类型",
}
PARAM_NAMES = VALUE_BEFORE_PARAM_NAMES | NAME_BEFORE_PARAM_NAMES
MAX_DETAIL_PROPS = 80
DEFAULT_PROFILE_DIR = Path("output/chrome-taobao-profile")
DEFAULT_RETRY_COUNT = 2
DEFAULT_READY_TIMEOUT = 45
DEFAULT_MIN_SCROLL_DELAY_SECONDS = 1.4
DEFAULT_MAX_SCROLL_DELAY_SECONDS = 3.2
RISK_URL_PATTERN = re.compile(r"punish|captcha|baxia|sec\.taobao|verify|_____tmd_____", re.I)
RISK_TEXT_PATTERN = re.compile(r"安全验证|验证码|拖动滑块|滑块|访问受限|访问被拒绝|风险|异常访问|验证身份")
LOGIN_TEXT_PATTERN = re.compile(r"扫码登录|手机扫码登录|密码登录|短信登录|登录页面|打开\s*淘宝APP")
EMPTY_SHELL_TEXT_PATTERN = re.compile(r"淘宝网首页|购物车\d*|收藏夹|帮助中心|免费开店|千牛卖家中心|登录|注册")


class RetryableCaptureError(RuntimeError):
    pass


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


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


def normalize_resource_url(value: str) -> str:
    url = clean_text(str(value or "").replace(r"\/", "/"))
    if not url:
        return ""
    return f"https:{url}" if url.startswith("//") else url


def strip_html(value: str) -> str:
    return clean_text(unescape(re.sub(r"<[^>]+>", " ", str(value or ""))))


def is_noise_text(value: str) -> bool:
    cleaned = clean_text(value)
    return not cleaned or bool(NOISE_TEXT_PATTERN.match(cleaned))


def first_meaningful(values: list[str | None], max_length: int) -> str:
    for value in values:
        cleaned = clean_text(value).replace("-淘宝网", "").replace("-天猫Tmall.com", "").replace("淘宝网", "")
        if cleaned and not is_noise_text(cleaned):
            return cleaned[:max_length]
    return ""


def first_line(value: str) -> str:
    for line in str(value or "").splitlines():
        cleaned = clean_text(line)
        if cleaned:
            return cleaned
    return ""


def decode_script_string(value: str) -> str:
    normalized = str(value or "").replace(r"\/", "/")
    try:
        return clean_text(json.loads(f'"{normalized}"'))
    except json.JSONDecodeError:
        decoded = re.sub(
            r"\\u([0-9a-fA-F]{4})",
            lambda match: chr(int(match.group(1), 16)),
            normalized,
        )
        return clean_text(decoded)


def merge_props(props: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: list[dict[str, str]] = []
    seen: set[str] = set()
    for prop in props:
        name = clean_text(prop.get("name", ""))
        value = clean_text(prop.get("value", ""))
        if not name or not value:
            continue
        key = f"{name}:{value}"
        if key in seen:
            continue
        seen.add(key)
        merged.append({"name": name, "value": value})
        if len(merged) >= MAX_DETAIL_PROPS:
            break
    return merged


def extract_string_properties(text: str, keys: list[str]) -> list[str]:
    allowed = set(keys)
    values: list[str] = []
    pattern = re.compile(r"""["']([A-Za-z][\w-]{0,40})["']\s*:\s*["']((?:\\.|[^"'\\]){1,2000})["']""")
    for match in pattern.finditer(text or ""):
        if match.group(1) not in allowed:
            continue
        value = decode_script_string(match.group(2))
        if value and not is_noise_text(value):
            values.append(value)
    return unique_strings(values)


def extract_script_props(text: str) -> list[dict[str, str]]:
    props: list[dict[str, str]] = []
    patterns = [
        re.compile(
            r"""["'](?:name|key|label|title)["']\s*:\s*["']((?:\\.|[^"'\\]){1,40})["'][^{}]{0,180}?["'](?:value|text|valueName|valueText)["']\s*:\s*["']((?:\\.|[^"'\\]){1,120})["']"""
        ),
        re.compile(
            r"""["'](?:value|text|valueName|valueText)["']\s*:\s*["']((?:\\.|[^"'\\]){1,120})["'][^{}]{0,180}?["'](?:name|key|label|title)["']\s*:\s*["']((?:\\.|[^"'\\]){1,40})["']"""
        ),
    ]
    for index, pattern in enumerate(patterns):
        for match in pattern.finditer(text or ""):
            first = decode_script_string(match.group(1))
            second = decode_script_string(match.group(2))
            prop = {"name": first, "value": second} if index == 0 else {"name": second, "value": first}
            if DETAIL_PROP_NAME_PATTERN.search(prop["name"]) and prop["value"] and not is_noise_text(prop["value"]):
                props.append(prop)
    return merge_props(props)


def extract_image_urls(text: str) -> list[str]:
    normalized = str(text or "").replace(r"\/", "/")
    return unique_strings([match.group(0) for match in IMAGE_URL_PATTERN.finditer(normalized)])


def normalize_snapshot_images(values: list[Any]) -> list[str]:
    images: list[str] = []
    for value in values:
        text = str(value or "")
        extracted = extract_image_urls(text)
        if extracted:
            images.extend(normalize_resource_url(url) for url in extracted)
        else:
            images.append(normalize_resource_url(text))
    return unique_strings(images)


def extract_script_detail_data(text: str) -> dict[str, Any]:
    props = extract_script_props(text)
    title = first_meaningful(
        extract_string_properties(text, ["itemTitle", "auctionTitle", "title", "itemName", "subject", "name"]),
        180,
    )
    description = first_meaningful(
        [
            strip_html(value)
            for value in extract_string_properties(
                text,
                ["description", "detailDescription", "pcDescContent", "descContent", "desc", "subTitle", "subtitle"],
            )
        ],
        1000,
    )
    images = unique_strings([normalize_resource_url(url) for url in extract_image_urls(text)])[:12]
    raw_text = clean_text(
        "\n".join(
            part
            for part in [
                title,
                "\n".join(f"{prop['name']} {prop['value']}" for prop in props),
                description,
            ]
            if part
        )
    )
    return {"title": title, "props": props, "description": description, "images": images, "rawText": raw_text}


def infer_props(text: str) -> list[dict[str, str]]:
    props: list[dict[str, str]] = []
    for line in str(text or "").splitlines():
        cleaned = clean_text(line)
        match = re.match(r"^(.{2,24})[:：\s]+(.{1,100})$", cleaned)
        if not match:
            continue
        name = clean_text(match.group(1))
        value = clean_text(match.group(2))
        if DETAIL_PROP_NAME_PATTERN.search(name) and value and not is_noise_text(value):
            props.append({"name": name, "value": value})
    return merge_props(props)


def infer_taobao_parameter_props(text: str) -> list[dict[str, str]]:
    normalized = clean_text(text)
    props: list[dict[str, str]] = []
    pattern = re.compile(r"参数信息\s+(.{10,1800}?)(?:尺码信息|图文详情|本店推荐|用户评价|看了又看|$)")
    for match in pattern.finditer(normalized):
        tokens = [token for token in match.group(1).split() if token]
        if len(tokens) < 4:
            continue
        for index, token in enumerate(tokens):
            if token in VALUE_BEFORE_PARAM_NAMES and index > 0:
                value = tokens[index - 1]
                if value not in PARAM_NAMES and not is_noise_text(value):
                    props.append({"name": token, "value": value})
            if token in NAME_BEFORE_PARAM_NAMES and index + 1 < len(tokens):
                value = tokens[index + 1]
                if value not in PARAM_NAMES and not is_noise_text(value):
                    props.append({"name": token, "value": value})
    return merge_props(props)


def infer_description(text: str) -> str:
    lines = [clean_text(line) for line in str(text or "").splitlines()]
    lines = [line for line in lines if line]
    detail_index = next((index for index, line in enumerate(lines) if re.search(r"商品详情|图文详情|详情|描述", line)), -1)
    if detail_index < 0:
        detail_index = next((index for index, line in enumerate(lines) if re.search(r"商品参数|参数信息", line)), -1)
    description = " ".join(lines[detail_index + 1 :] if detail_index >= 0 else lines)
    return "" if is_noise_text(description) else description[:1000]


def extract_item_id(url: str) -> str:
    try:
        parsed = urlparse(url)
        item_id = parse_qs(parsed.query).get("id", [""])[0]
        if item_id:
            return clean_text(item_id)
    except ValueError:
        pass
    match = re.search(r"[?&]id=(\d+)", str(url or ""))
    return match.group(1) if match else ""


def infer_product_title(text: str) -> str:
    normalized = clean_text(text)
    patterns = [
        re.compile(r"([A-Za-z][A-Za-z0-9._ -]{0,40}/[^¥]{8,160}?)\s+(?:已售|多人评价|回头客|券后|优惠前)"),
        re.compile(r"([\u4e00-\u9fffA-Za-z0-9/·._ -]{12,160}?(?:T恤|上衣|短袖|长袖|衬衫|外套|裤|鞋|裙|tee)[\u4e00-\u9fffA-Za-z0-9/·._ -]{0,60}?)\s+(?:已售|多人评价|回头客|券后|优惠前)", re.I),
    ]
    for pattern in patterns:
        candidates = [clean_text(match.group(1)) for match in pattern.finditer(normalized)]
        for candidate in reversed(candidates):
            if candidate and not is_noise_text(candidate):
                return candidate[:180]
    return ""


def guess_page_type(url: str) -> str:
    return "item-detail" if re.search(r"item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com", url or "", re.I) else "order-list"


def iso_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build_capture_payload(snapshot: dict[str, Any], captured_at: str | None = None) -> dict[str, Any]:
    url = clean_text(snapshot.get("url", ""))
    body_text = str(snapshot.get("bodyText", "") or "")
    script_text = "\n".join(str(script or "") for script in snapshot.get("scripts", []))[:250000]
    script_data = extract_script_detail_data(script_text)
    meta_titles = [clean_text(value) for value in snapshot.get("metaTitles", []) if clean_text(value)]
    page_title = clean_text(snapshot.get("title", ""))

    detail_title = first_meaningful(
        [infer_product_title(body_text), script_data["title"], *meta_titles, page_title, first_line(body_text)],
        180,
    )
    detail_props = merge_props(
        [
            *script_data["props"],
            *infer_taobao_parameter_props(body_text),
            *infer_props(body_text),
            *infer_props(script_data["rawText"]),
        ]
    )
    detail_description = first_meaningful(
        [script_data["description"], infer_description(body_text)],
        1000,
    )
    detail_images = unique_strings(
        [
            *script_data["images"],
            *normalize_snapshot_images(snapshot.get("images", [])),
        ]
    )[:12]
    detail_raw_text = clean_text("\n".join(part for part in [script_data["rawText"], body_text] if part))[:8000]

    return {
        "source": "taobao-selenium",
        "pageType": guess_page_type(url),
        "capturedAt": captured_at or iso_now(),
        "pageUrl": url,
        "items": [
            {
                "pageType": "item-detail",
                "itemId": extract_item_id(url),
                "detailUrl": url,
                "detailTitle": detail_title,
                "detailProps": detail_props,
                "detailDescription": detail_description,
                "detailImages": detail_images,
                "detailRawText": detail_raw_text,
            }
        ],
    }


def validate_item_detail_payload(payload: dict[str, Any]) -> None:
    page_url = clean_text(payload.get("pageUrl", ""))
    items = payload.get("items")
    item = items[0] if isinstance(items, list) and items else {}
    detail_title = clean_text(item.get("detailTitle", ""))
    detail_props = item.get("detailProps", [])
    detail_images = item.get("detailImages", [])
    detail_description = clean_text(item.get("detailDescription", ""))
    detail_raw_text = clean_text(item.get("detailRawText", ""))
    page_text = clean_text("\n".join([detail_title, detail_description, detail_raw_text]))

    if "login.taobao.com" in page_url or LOGIN_TEXT_PATTERN.search(page_text):
        raise RetryableCaptureError("Capture is still on Taobao login page / QR login needed; scan the QR code and run again with a longer --login-wait.")
    if RISK_URL_PATTERN.search(page_url) or RISK_TEXT_PATTERN.search(page_text):
        raise RuntimeError("Capture is on a Taobao risk/captcha page; handle the verification manually before running again. This script does not bypass verification.")
    if payload.get("pageType") != "item-detail":
        raise RuntimeError(f"Capture is not an item detail page: {page_url}")
    if is_empty_shell_capture(detail_props, detail_images, detail_description, detail_raw_text):
        raise RetryableCaptureError("Capture reached an empty shell page; product content did not load yet.")
    if not clean_text(item.get("itemId", "")):
        raise RetryableCaptureError("Capture did not find a Taobao item id; page may still be loading or login may not be complete.")
    if not detail_title:
        raise RetryableCaptureError("Capture did not find a product title; page may still be loading.")


def is_empty_shell_capture(detail_props: Any, detail_images: Any, detail_description: str, detail_raw_text: str) -> bool:
    props = detail_props if isinstance(detail_props, list) else []
    images = detail_images if isinstance(detail_images, list) else []
    text = clean_text("\n".join([detail_description, detail_raw_text]))
    if props or images:
        return False
    if len(text) > 220:
        return False
    return bool(EMPTY_SHELL_TEXT_PATTERN.search(text))


def build_collector_snapshot_script() -> str:
    return r"""
return (() => {
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const attr = (node, name) => node && node.getAttribute ? node.getAttribute(name) : "";
  const imageValues = [];
  for (const node of document.querySelectorAll("img,source")) {
    for (const key of ["currentSrc", "src", "data-src", "data-ks-lazyload", "data-lazyload", "data-original", "srcset"]) {
      const value = node[key] || attr(node, key);
      if (value) imageValues.push(value);
    }
  }
  const metaTitles = Array.from(document.querySelectorAll("meta[property='og:title'],meta[name='title']"))
    .map(node => node.content || attr(node, "content"))
    .filter(Boolean);
  return {
    url: location.href,
    title: document.title || "",
    bodyText: (document.body && document.body.innerText) || "",
    metaTitles,
    images: Array.from(new Set(imageValues.filter(Boolean))),
    scripts: Array.from(document.scripts).map(node => node.textContent || "")
  };
})();
"""


def wait_for_page_ready(driver: Any, timeout: int = 20) -> None:
    from selenium.webdriver.support.ui import WebDriverWait

    WebDriverWait(driver, timeout).until(lambda current: current.execute_script("return document.readyState") in {"interactive", "complete"})
    WebDriverWait(driver, timeout).until(lambda current: current.execute_script("return Boolean(document.body)"))


def wait_for_manual_login(seconds: int) -> None:
    if seconds <= 0:
        return
    print(f"Waiting {seconds} seconds for manual login. Scan QR code in the opened browser if needed.")
    for remaining in range(seconds, 0, -1):
        if remaining == seconds or remaining <= 5 or remaining % 10 == 0:
            print(f"{remaining} seconds remaining...")
        time.sleep(1)


def scroll_for_lazy_content(driver: Any, steps: int = 7, min_delay_seconds: float = 0.9, max_delay_seconds: float = 1.7) -> None:
    if steps < 2:
        steps = 2
    if max_delay_seconds < min_delay_seconds:
        max_delay_seconds = min_delay_seconds
    for index in range(steps):
        height = int(driver.execute_script("return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)") or 0)
        viewport = int(driver.execute_script("return window.innerHeight || document.documentElement.clientHeight || 800") or 800)
        max_scroll = max(0, height - viewport)
        y = int(max_scroll * (index / (steps - 1)))
        driver.execute_script("window.scrollTo(0, arguments[0])", y)
        time.sleep(random.uniform(min_delay_seconds, max_delay_seconds))
    driver.execute_script("window.scrollTo(0, 0)")
    time.sleep(0.6)


def collect_snapshot(driver: Any) -> dict[str, Any]:
    snapshot = driver.execute_script(build_collector_snapshot_script())
    if not isinstance(snapshot, dict):
        raise RuntimeError("Unable to collect page snapshot from browser")
    return snapshot


def ensure_local_webdriver_bypasses_proxy() -> None:
    existing = os.environ.get("NO_PROXY") or os.environ.get("no_proxy") or ""
    entries = [entry.strip() for entry in existing.split(",") if entry.strip()]
    for host in ["localhost", "127.0.0.1", "::1"]:
        if host not in entries:
            entries.append(host)
    value = ",".join(entries)
    os.environ["NO_PROXY"] = value
    os.environ["no_proxy"] = value


def create_chrome_driver(profile_dir: Path | None = DEFAULT_PROFILE_DIR) -> Any:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    ensure_local_webdriver_bypasses_proxy()
    profile_path = profile_dir.resolve() if profile_dir is not None else None
    if profile_dir is not None:
        profile_path.mkdir(parents=True, exist_ok=True)
    options = Options()
    options.add_argument("--lang=zh-CN")
    options.add_argument("--start-maximized")
    if profile_path is not None:
        options.add_argument(f"--user-data-dir={profile_path}")
    return webdriver.Chrome(options=options)


def default_output_path(output_dir: Path, payload: dict[str, Any]) -> Path:
    item = payload.get("items", [{}])[0]
    item_id = clean_text(item.get("itemId", "")) or "taobao-item"
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return output_dir / f"{item_id}-{timestamp}.json"


def write_payload(payload: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = default_output_path(output_dir, payload)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def capture_with_browser(
    url: str,
    login_wait: int,
    output_dir: Path,
    profile_dir: Path = DEFAULT_PROFILE_DIR,
    retry_count: int = DEFAULT_RETRY_COUNT,
    ready_timeout: int = DEFAULT_READY_TIMEOUT,
    min_scroll_delay: float = DEFAULT_MIN_SCROLL_DELAY_SECONDS,
    max_scroll_delay: float = DEFAULT_MAX_SCROLL_DELAY_SECONDS,
) -> Path:
    driver = create_chrome_driver(profile_dir)
    try:
        driver.get(url)
        wait_for_page_ready(driver, ready_timeout)
        wait_for_manual_login(login_wait)
        last_error: RetryableCaptureError | None = None
        for attempt in range(max(0, retry_count) + 1):
            if attempt > 0:
                print(f"Retrying Taobao capture after retryable page state ({attempt}/{retry_count}): {last_error}")
                time.sleep(random.uniform(min_scroll_delay, max_scroll_delay))
                driver.refresh()
            wait_for_page_ready(driver, ready_timeout)
            scroll_for_lazy_content(driver, min_delay_seconds=min_scroll_delay, max_delay_seconds=max_scroll_delay)
            snapshot = collect_snapshot(driver)
            payload = build_capture_payload(snapshot)
            try:
                validate_item_detail_payload(payload)
                return write_payload(payload, output_dir)
            except RetryableCaptureError as error:
                last_error = error
                if attempt >= max(0, retry_count):
                    raise
        if last_error:
            raise last_error
        raise RuntimeError("Capture failed before a page snapshot could be validated.")
    finally:
        driver.quit()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture visible Taobao item detail data into an Outfit-compatible JSON payload.",
        epilog=(
            "First run: scan the QR code in the opened Chrome window. Later runs reuse --profile-dir. "
            "If Taobao shows verification, handle it manually; this script does not bypass captcha or risk controls."
        ),
    )
    parser.add_argument("--url", required=True, help="Taobao/Tmall item detail URL to open in Chrome.")
    parser.add_argument("--login-wait", type=int, default=30, help="Seconds to wait for manual QR login before capturing.")
    parser.add_argument("--output-dir", type=Path, default=Path("output/taobao-captures"), help="Directory for captured JSON files.")
    parser.add_argument("--profile-dir", type=Path, default=DEFAULT_PROFILE_DIR, help="Persistent Chrome user data directory for reusing Taobao login state.")
    parser.add_argument("--retry-count", type=int, default=DEFAULT_RETRY_COUNT, help="Retries for retryable page states such as login or empty content shells.")
    parser.add_argument("--ready-timeout", type=int, default=DEFAULT_READY_TIMEOUT, help="Seconds to wait for the page body and document readiness.")
    parser.add_argument("--min-scroll-delay", type=float, default=DEFAULT_MIN_SCROLL_DELAY_SECONDS, help="Minimum seconds between lazy-load scroll steps.")
    parser.add_argument("--max-scroll-delay", type=float, default=DEFAULT_MAX_SCROLL_DELAY_SECONDS, help="Maximum seconds between lazy-load scroll steps.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    output_path = capture_with_browser(
        args.url,
        args.login_wait,
        args.output_dir,
        args.profile_dir,
        args.retry_count,
        args.ready_timeout,
        args.min_scroll_delay,
        args.max_scroll_delay,
    )
    print(f"Wrote Taobao capture JSON: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
