import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const DEFAULT_LOGIN_WAIT_SECONDS = 60;
const DEFAULT_OUTPUT_DIR = path.join("output", "taobao-captures");
const DEFAULT_PROFILE_DIR = path.join("output", "playwright-taobao-profile");
const RISK_URL_PATTERN = /punish|captcha|baxia|sec\.taobao|verify|_____tmd_____/i;
const RISK_TEXT_PATTERN = /安全验证|验证码|拖动滑块|滑块|访问受限|访问被拒绝|风险|异常访问|验证身份/;
const LOGIN_TEXT_PATTERN = /扫码登录|手机扫码登录|密码登录|短信登录|登录页面|打开\s*淘宝APP/;
const EMPTY_SHELL_TEXT_PATTERN = /淘宝网首页|购物车\d*|收藏夹|帮助中心|免费开店|千牛卖家中心|登录|注册/;
const DETAIL_PROP_NAME_PATTERN = /品牌|材质|面料|颜色|尺码|尺寸|闭合|鞋面|成分|款式|厚薄|厚度|季节|风格|货号|版型|领型|袖长|衣长|裤长|腰型|图案|功能|性别|适用|上市|填充物|弹力/;
const NOISE_TEXT_PATTERN = /^(淘宝网(?:首页)?|天猫|我的淘宝|购物车\d*|收藏夹|帮助中心|免费开店|千牛卖家中心|用户调研|桌面版|进店|登录|注册|淘宝网\s*-\s*淘宝)$/;
const IMAGE_URL_PATTERN = /(?:https?:)?\/\/[^"'\s<>\\]+?(?:alicdn|taobaocdn)[^"'\s<>\\]*?\.(?:jpg|jpeg|png|webp|gif)(?:_[^"'\s<>\\]*)?/gi;

export function parseCaptureArgs(argv = process.argv.slice(2)) {
  const values = {
    url: "",
    loginWait: DEFAULT_LOGIN_WAIT_SECONDS,
    outputDir: DEFAULT_OUTPUT_DIR,
    profileDir: DEFAULT_PROFILE_DIR
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url") {
      values.url = requiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--login-wait") {
      values.loginWait = parseNonNegativeInteger(requiredOptionValue(argv, index, arg), arg, 600);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      values.outputDir = requiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!values.url) {
    throw new Error("Missing required --url argument.");
  }
  if (!isTaobaoItemUrl(values.url)) {
    throw new Error("--url must be a Taobao or Tmall item detail URL.");
  }
  return values;
}

export function buildCapturePayload(snapshot, capturedAt = new Date().toISOString()) {
  const url = cleanText(snapshot?.url || "");
  const bodyText = String(snapshot?.bodyText || "");
  const scriptText = (Array.isArray(snapshot?.scripts) ? snapshot.scripts : []).map((script) => String(script || "")).join("\n").slice(0, 250000);
  const scriptData = extractScriptDetailData(scriptText);
  const metaTitles = (Array.isArray(snapshot?.metaTitles) ? snapshot.metaTitles : []).map(cleanText).filter(Boolean);
  const fallbackDescription = inferDescription(bodyText);
  const detailTitle = firstMeaningful([
    scriptData.title,
    ...metaTitles,
    snapshot?.title,
    firstLine(bodyText)
  ], 180);
  const detailProps = mergeProps([
    ...scriptData.props,
    ...normalizeProps(Array.isArray(snapshot?.props) ? snapshot.props : []),
    ...inferProps(bodyText),
    ...inferProps(scriptData.rawText)
  ]);
  const detailDescription = firstMeaningful([
    scriptData.description,
    isNoiseText(fallbackDescription) ? "" : fallbackDescription
  ], 1000);
  const detailImages = uniqueStrings([
    ...scriptData.images,
    ...normalizeSnapshotImages(Array.isArray(snapshot?.images) ? snapshot.images : [])
  ].map(normalizeResourceUrl)).slice(0, 12);
  const detailRawText = cleanText([
    scriptData.rawText,
    bodyText
  ].filter(Boolean).join("\n")).slice(0, 8000);

  return {
    source: "taobao-playwright-item-detail",
    pageType: guessPageType(url),
    capturedAt,
    pageUrl: url,
    items: [
      {
        pageType: "item-detail",
        itemId: extractItemId(url),
        detailUrl: url,
        detailTitle,
        detailProps,
        detailDescription,
        detailImages,
        detailRawText
      }
    ]
  };
}

export function validateItemDetailPayload(payload) {
  const pageUrl = cleanText(payload?.pageUrl || "");
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const item = items[0] && typeof items[0] === "object" ? items[0] : {};
  const detailTitle = cleanText(item.detailTitle || "");
  const detailProps = Array.isArray(item.detailProps) ? item.detailProps : [];
  const detailImages = Array.isArray(item.detailImages) ? item.detailImages : [];
  const detailDescription = cleanText(item.detailDescription || "");
  const detailRawText = cleanText(item.detailRawText || "");
  const pageText = cleanText([detailTitle, detailDescription, detailRawText].join("\n"));

  if (pageUrl.includes("login.taobao.com") || LOGIN_TEXT_PATTERN.test(pageText)) {
    throw new Error("Capture is still on Taobao login page / QR login needed; scan the QR code and run again with a longer --login-wait.");
  }
  if (RISK_URL_PATTERN.test(pageUrl) || RISK_TEXT_PATTERN.test(pageText)) {
    throw new Error("Capture is on a Taobao risk/captcha/verification page; handle verification manually before running again.");
  }
  if (payload?.pageType !== "item-detail") {
    throw new Error(`Capture is not an item detail page: ${pageUrl}`);
  }
  if (isEmptyShellCapture(detailProps, detailImages, detailDescription, detailRawText)) {
    throw new Error("Capture reached an empty shell page; product content did not load yet.");
  }
  if (!cleanText(item.itemId || "")) {
    throw new Error("Capture did not find a Taobao item id; page may still be loading or login may not be complete.");
  }
  if (!detailTitle) {
    throw new Error("Capture did not find a product title; page may still be loading.");
  }
}

export async function captureWithBrowser(options) {
  const context = await chromium.launchPersistentContext(options.profileDir, {
    headless: false,
    channel: process.env.OUTFIT_PLAYWRIGHT_CHANNEL || "chrome"
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForPageReady(page);
    if (options.loginWait > 0) {
      console.log(`Waiting ${options.loginWait} seconds for manual login or verification handling.`);
      await page.waitForTimeout(options.loginWait * 1000);
    }
    await scrollForLazyContent(page);
    const snapshot = await collectSnapshot(page);
    const payload = buildCapturePayload(snapshot);
    validateItemDetailPayload(payload);
    return writePayload(payload, options.outputDir);
  } finally {
    await context.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseCaptureArgs(argv);
    const outputPath = await captureWithBrowser(options);
    console.log(`Wrote Taobao Playwright capture JSON: ${outputPath}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function requiredOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}.`);
  }
  return value;
}

function parseNonNegativeInteger(value, optionName, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    throw new Error(`${optionName} must be an integer between 0 and ${max}.`);
  }
  return parsed;
}

function isTaobaoItemUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && /(^|\.)((item\.taobao\.com)|(detail\.tmall\.com)|(item\.tmall\.com))$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstLine(value) {
  return String(value || "").split(/\n/).map(cleanText).find(Boolean) || "";
}

function normalizeProps(props) {
  return props.map((prop) => ({
    name: cleanText(prop?.name || ""),
    value: cleanText(prop?.value || "")
  })).filter((prop) => prop.name && prop.value);
}

function extractScriptDetailData(text) {
  const title = firstMeaningful(extractStringProperties(text, ["itemTitle", "auctionTitle", "title", "itemName", "subject", "name"]), 180);
  const props = extractScriptProps(text);
  const description = firstMeaningful(extractStringProperties(text, [
    "description",
    "detailDescription",
    "pcDescContent",
    "descContent",
    "desc",
    "subTitle",
    "subtitle"
  ]).map(stripHtml), 1000);
  const images = uniqueStrings(extractImageUrls(text).map(normalizeResourceUrl)).slice(0, 12);
  const rawText = cleanText([
    title,
    props.map((prop) => `${prop.name} ${prop.value}`).join("\n"),
    description
  ].filter(Boolean).join("\n"));
  return { title, props, description, images, rawText };
}

function extractStringProperties(text, keys) {
  const allowed = new Set(keys);
  const values = [];
  const pattern = /["']([A-Za-z][\w-]{0,40})["']\s*:\s*["']((?:\\.|[^"'\\]){1,2000})["']/g;
  let match;
  while ((match = pattern.exec(text || ""))) {
    if (!allowed.has(match[1])) continue;
    const value = cleanScriptString(match[2]);
    if (!value || isNoiseText(value)) continue;
    values.push(value);
  }
  return uniqueStrings(values);
}

function extractScriptProps(text) {
  const props = [];
  const patterns = [
    /["'](?:name|key|label|title)["']\s*:\s*["']((?:\\.|[^"'\\]){1,40})["'][^{}]{0,180}?["'](?:value|text|valueName|valueText)["']\s*:\s*["']((?:\\.|[^"'\\]){1,120})["']/g,
    /["'](?:value|text|valueName|valueText)["']\s*:\s*["']((?:\\.|[^"'\\]){1,120})["'][^{}]{0,180}?["'](?:name|key|label|title)["']\s*:\s*["']((?:\\.|[^"'\\]){1,40})["']/g
  ];
  for (const [index, pattern] of patterns.entries()) {
    let match;
    while ((match = pattern.exec(text || ""))) {
      const first = cleanScriptString(match[1]);
      const second = cleanScriptString(match[2]);
      const prop = index === 0 ? { name: first, value: second } : { name: second, value: first };
      if (DETAIL_PROP_NAME_PATTERN.test(prop.name) && prop.value && !isNoiseText(prop.value)) {
        props.push(prop);
      }
    }
  }
  return mergeProps(props);
}

function extractImageUrls(text) {
  const normalized = String(text || "").replace(/\\\//g, "/");
  return uniqueStrings(Array.from(normalized.matchAll(IMAGE_URL_PATTERN), (match) => match[0]));
}

function normalizeSnapshotImages(values) {
  const images = [];
  for (const value of values) {
    const text = typeof value === "string" ? value : value?.src || value?.currentSrc || value?.url || "";
    const extracted = extractImageUrls(text);
    if (extracted.length) {
      images.push(...extracted.map(normalizeResourceUrl));
    } else {
      images.push(normalizeResourceUrl(text));
    }
  }
  return uniqueStrings(images);
}

function cleanScriptString(value) {
  const normalized = String(value || "").replace(/\\\//g, "/");
  try {
    return cleanText(JSON.parse(`"${normalized}"`));
  } catch {
    return cleanText(normalized.replace(/\\u([0-9a-fA-F]{4})/g, (_match, code) => String.fromCharCode(Number.parseInt(code, 16))));
  }
}

function stripHtml(value) {
  return cleanText(String(value || "").replace(/<[^>]+>/g, " "));
}

function normalizeResourceUrl(value) {
  const url = cleanText(String(value || "").replace(/\\\//g, "/"));
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}

function firstMeaningful(values, maxLength) {
  for (const value of values) {
    const cleaned = cleanText(String(value || "").replace(/-淘宝网|-天猫Tmall\.com|淘宝网/g, ""));
    if (cleaned && !isNoiseText(cleaned)) return cleaned.slice(0, maxLength);
  }
  return "";
}

function isNoiseText(value) {
  const cleaned = cleanText(value);
  return !cleaned || NOISE_TEXT_PATTERN.test(cleaned);
}

function mergeProps(props) {
  const seen = new Set();
  const merged = [];
  for (const prop of normalizeProps(props)) {
    const key = `${prop.name}:${prop.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(prop);
  }
  return merged.slice(0, 24);
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function inferProps(text) {
  const props = [];
  for (const line of String(text || "").split(/\n/).map(cleanText)) {
    const match = line.match(/^([^:：\s][^:：]{1,23})[:：]\s*(.{1,100})$/) || line.match(/^([^\s:：]{2,24})\s+(.{1,100})$/);
    if (!match) continue;
    const name = cleanText(match[1]);
    const value = cleanText(match[2]);
    if (DETAIL_PROP_NAME_PATTERN.test(name) && value && !isNoiseText(value)) {
      props.push({ name, value });
    }
  }
  return props.slice(0, 24);
}

function inferDescription(text) {
  const lines = String(text || "").split(/\n/).map(cleanText).filter(Boolean);
  let detailIndex = lines.findIndex((line) => /商品详情|图文详情|详情|描述/.test(line));
  if (detailIndex < 0) {
    detailIndex = lines.findIndex((line) => /商品参数|参数信息/.test(line));
  }
  return (detailIndex >= 0 ? lines.slice(detailIndex + 1) : lines).join(" ").slice(0, 1000);
}

function extractItemId(url) {
  try {
    const parsed = new URL(url, "https://item.taobao.com");
    return cleanText(parsed.searchParams.get("id") || "");
  } catch {
    const match = String(url || "").match(/[?&]id=(\d+)/);
    return match ? match[1] : "";
  }
}

function guessPageType(url) {
  return /item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com/i.test(url || "") ? "item-detail" : "order-list";
}

function isEmptyShellCapture(detailProps, detailImages, detailDescription, detailRawText) {
  const props = Array.isArray(detailProps) ? detailProps : [];
  const images = Array.isArray(detailImages) ? detailImages : [];
  const text = cleanText([detailDescription, detailRawText].join("\n"));
  if (props.length || images.length) return false;
  if (!text) return true;
  if (text.length > 220) return false;
  return EMPTY_SHELL_TEXT_PATTERN.test(text);
}

async function waitForPageReady(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => undefined);
  await page.waitForFunction(() => Boolean(document.body), undefined, { timeout: 20000 }).catch(() => undefined);
}

async function scrollForLazyContent(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const originalY = window.scrollY;
    const maxY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;
    for (const position of [0, 0.35, 0.7, 1]) {
      window.scrollTo(0, Math.max(0, maxY * position));
      await sleep(220);
    }
    window.scrollTo(0, originalY);
    await sleep(120);
  });
}

async function collectSnapshot(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const attr = (node, name) => node && node.getAttribute ? node.getAttribute(name) : "";
    const imageValues = [];
    for (const node of document.querySelectorAll("img,source")) {
      for (const key of ["currentSrc", "src", "data-src", "data-ks-lazyload", "data-lazyload", "data-original", "srcset"]) {
        const value = node[key] || attr(node, key);
        if (value) imageValues.push(value);
      }
    }
    const props = [];
    for (const node of document.querySelectorAll(".attributes-list li, .J_AttrUL li, [class*='Attrs'] li, [class*='props'] li, [class*='Props'] li")) {
      const text = clean(node.innerText || node.textContent || "");
      const match = text.match(/^(.{2,24})[:：\s]+(.{1,100})$/);
      if (match) props.push({ name: clean(match[1]), value: clean(match[2]) });
    }
    return {
      url: location.href,
      title: document.title,
      bodyText: document.body ? document.body.innerText || "" : "",
      metaTitles: [
        document.querySelector("meta[property='og:title']")?.content,
        document.querySelector("meta[name='title']")?.content
      ].filter(Boolean),
      images: imageValues,
      props,
      scripts: Array.from(document.scripts, (script) => script.textContent || "")
    };
  });
}

function defaultOutputPath(outputDir, payload) {
  const item = Array.isArray(payload.items) && payload.items[0] ? payload.items[0] : {};
  const itemId = cleanText(item.itemId || "") || "item";
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
  return path.join(outputDir, `${sanitizeFileBase(itemId)}-${timestamp}.json`);
}

function sanitizeFileBase(value) {
  return cleanText(value).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

function writePayload(payload, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = defaultOutputPath(outputDir, payload);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await main();
  process.exitCode = code;
}
