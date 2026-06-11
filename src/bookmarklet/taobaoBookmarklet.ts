import type { TaobaoCapturedBatch, TaobaoCapturedItem, TaobaoDetailProp, TaobaoPageType } from "../shared/types";

export interface TaobaoCaptureFixture {
  href: string;
  title?: string;
  bodyText?: string;
  images?: Array<{ src?: string; alt?: string }>;
  props?: TaobaoDetailProp[];
  links?: Array<{ href?: string; text?: string; title?: string }>;
  scripts?: string[];
}

export function captureTaobaoPage(page: TaobaoCaptureFixture): TaobaoCapturedBatch {
  const pageType = guessPageType(page.href);
  const capturedAt = new Date().toISOString();
  if (pageType === "item-detail") {
    return {
      source: "taobao-bookmarklet",
      pageType,
      capturedAt,
      pageUrl: page.href,
      items: [captureFixtureDetail(page)]
    };
  }

  return {
    source: "taobao-bookmarklet",
    pageType,
    capturedAt,
    pageUrl: page.href,
    items: (page.links || []).map((link) => ({
      pageType,
      itemId: extractItemId(link.href || ""),
      title: cleanText(link.text || link.title || ""),
      itemUrl: cleanText(link.href || "")
    })).filter((item) => item.title || item.itemUrl)
  };
}

function captureFixtureDetail(page: TaobaoCaptureFixture): TaobaoCapturedItem {
  const rawText = page.bodyText || "";
  const scriptData = extractScriptDetailData((page.scripts || []).join("\n"));
  const fallbackDescription = inferDescription(rawText);
  const detailTitle = firstMeaningful([
    scriptData.title,
    page.title,
    firstLine(rawText)
  ], 180);
  const detailProps = mergeProps([
    ...normalizeProps(page.props || []),
    ...scriptData.props,
    ...inferProps(rawText),
    ...inferProps(scriptData.rawText)
  ]);
  const detailDescription = firstMeaningful([
    scriptData.description,
    isNoiseText(fallbackDescription) ? "" : fallbackDescription
  ], 1000);
  const detailImages = uniqueStrings([
    ...scriptData.images,
    ...(page.images || []).map((image) => image.src || "")
  ].map(normalizeResourceUrl)).slice(0, 12);
  const detailRawText = cleanText([
    scriptData.rawText,
    rawText
  ].filter(Boolean).join("\n")).slice(0, 8000);
  return {
    pageType: "item-detail",
    itemId: extractItemId(page.href),
    detailUrl: page.href,
    detailTitle,
    detailProps,
    detailDescription,
    detailImages,
    detailRawText
  };
}

function cleanText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstLine(value: string): string {
  return String(value || "").split(/\n/).map(cleanText).find(Boolean) || "";
}

function normalizeProps(props: TaobaoDetailProp[]): TaobaoDetailProp[] {
  return props.map((prop) => ({ name: cleanText(prop.name), value: cleanText(prop.value) })).filter((prop) => prop.name && prop.value);
}

interface ExtractedScriptDetailData {
  title: string;
  props: TaobaoDetailProp[];
  description: string;
  images: string[];
  rawText: string;
}

const DETAIL_PROP_NAME_PATTERN = /品牌|材质|面料|颜色|尺码|尺寸|闭合|鞋面|成分|款式|厚薄|厚度|季节|风格|货号|版型|领型|袖长|衣长|裤长|腰型|图案|功能|性别|适用|上市|填充物|弹力/;
const NOISE_TEXT_PATTERN = /^(淘宝网(?:首页)?|天猫|我的淘宝|购物车\d*|收藏夹|帮助中心|免费开店|千牛卖家中心|用户调研|桌面版|进店|登录|注册|淘宝网\s*-\s*淘宝)$/;

function extractScriptDetailData(text: string): ExtractedScriptDetailData {
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

function extractStringProperties(text: string, keys: string[]): string[] {
  const allowed = new Set(keys);
  const values: string[] = [];
  const pattern = /["']([A-Za-z][\w-]{0,40})["']\s*:\s*["']((?:\\.|[^"'\\]){1,2000})["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (!allowed.has(match[1])) continue;
    const value = cleanScriptString(match[2]);
    if (!value || isNoiseText(value)) continue;
    values.push(value);
  }
  return uniqueStrings(values);
}

function extractScriptProps(text: string): TaobaoDetailProp[] {
  const props: TaobaoDetailProp[] = [];
  const patterns = [
    /["'](?:name|key|label|title)["']\s*:\s*["']((?:\\.|[^"'\\]){1,40})["'][^{}]{0,180}?["'](?:value|text|valueName|valueText)["']\s*:\s*["']((?:\\.|[^"'\\]){1,120})["']/g,
    /["'](?:value|text|valueName|valueText)["']\s*:\s*["']((?:\\.|[^"'\\]){1,120})["'][^{}]{0,180}?["'](?:name|key|label|title)["']\s*:\s*["']((?:\\.|[^"'\\]){1,40})["']/g
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const first = cleanScriptString(match[1]);
      const second = cleanScriptString(match[2]);
      const prop = pattern === patterns[0] ? { name: first, value: second } : { name: second, value: first };
      if (DETAIL_PROP_NAME_PATTERN.test(prop.name) && prop.value && !isNoiseText(prop.value)) {
        props.push(prop);
      }
    }
  }
  return mergeProps(props);
}

function extractImageUrls(text: string): string[] {
  const normalized = String(text || "").replace(/\\\//g, "/");
  const pattern = /(?:https?:)?\/\/[^"'\s<>\\]+?(?:alicdn|taobaocdn)[^"'\s<>\\]*?\.(?:jpg|jpeg|png|webp|gif)(?:_[^"'\s<>\\]*)?/gi;
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized))) {
    urls.push(match[0]);
  }
  return uniqueStrings(urls);
}

function cleanScriptString(value: string): string {
  const normalized = String(value || "").replace(/\\\//g, "/");
  try {
    return cleanText(JSON.parse(`"${normalized}"`));
  } catch {
    return cleanText(normalized.replace(/\\u([0-9a-fA-F]{4})/g, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16))));
  }
}

function stripHtml(value: string): string {
  return cleanText(String(value || "").replace(/<[^>]+>/g, " "));
}

function normalizeResourceUrl(value: string): string {
  const url = cleanText(String(value || "").replace(/\\\//g, "/"));
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}

function firstMeaningful(values: Array<string | undefined>, maxLength: number): string {
  for (const value of values) {
    const cleaned = cleanText(value || "").replace(/-淘宝网|-天猫Tmall\.com|淘宝网$/g, "");
    if (cleaned && !isNoiseText(cleaned)) return cleaned.slice(0, maxLength);
  }
  return "";
}

function isNoiseText(value: string): boolean {
  const cleaned = cleanText(value);
  if (!cleaned) return true;
  return NOISE_TEXT_PATTERN.test(cleaned);
}

function mergeProps(props: TaobaoDetailProp[]): TaobaoDetailProp[] {
  const seen = new Set<string>();
  const merged: TaobaoDetailProp[] = [];
  for (const prop of normalizeProps(props)) {
    const key = `${prop.name}:${prop.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(prop);
  }
  return merged.slice(0, 24);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function inferProps(text: string): TaobaoDetailProp[] {
  const props: TaobaoDetailProp[] = [];
  for (const line of String(text || "").split(/\n/).map(cleanText)) {
    const match = line.match(/^(.{2,16})[:：\s]+(.{1,80})$/);
    if (!match) continue;
    const name = cleanText(match[1]);
    const value = cleanText(match[2]);
    if (/品牌|材质|面料|颜色|尺码|尺寸|闭合|鞋面|成分|款式|厚薄|季节|风格/.test(name)) {
      props.push({ name, value });
    }
  }
  return props.slice(0, 24);
}

function inferDescription(text: string): string {
  const lines = String(text || "").split(/\n/).map(cleanText).filter(Boolean);
  const detailIndex = lines.findIndex((line) => /商品详情|详情|描述/.test(line));
  return (detailIndex >= 0 ? lines.slice(detailIndex + 1) : lines).join(" ").slice(0, 1000);
}

function extractItemId(url: string): string {
  try {
    const parsed = new URL(url, "https://item.taobao.com");
    return cleanText(parsed.searchParams.get("id") || "");
  } catch {
    const match = String(url || "").match(/[?&]id=(\d+)/);
    return match ? match[1] : "";
  }
}

function guessPageType(url: string): TaobaoPageType {
  return /item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com/i.test(url) ? "item-detail" : "order-list";
}

const TAOBAO_BOOKMARKLET_SCRIPT = String.raw`(()=>{const clean=t=>String(t||"").replace(/\s+/g," ").trim();const abs=u=>{try{return new URL(u,location.href).href}catch{return clean(u)}};const itemId=u=>{try{return new URL(u,location.href).searchParams.get("id")||""}catch{const m=String(u||"").match(/[?&]id=(\d+)/);return m?m[1]:""}};const sleep=ms=>new Promise(r=>setTimeout(r,ms));const visible=e=>{if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)!==0&&r.width>0&&r.height>0};const text=e=>clean((e&&e.innerText)||"");const lines=t=>String(t||"").split(/\n|\s{2,}/).map(clean).filter(Boolean);const match=(t,r)=>{const m=String(t||"").match(r);return m?clean(m[1]||m[0]):undefined};const uniq=a=>[...new Set(a.map(clean).filter(Boolean))];const pageType=/item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com/i.test(location.href)?"item-detail":"order-list";const propName=/品牌|材质|面料|颜色|尺码|尺寸|闭合|鞋面|成分|款式|厚薄|厚度|季节|风格|货号|版型|领型|袖长|衣长|裤长|腰型|图案|功能|性别|适用|上市|填充物|弹力/;const noise=/^(淘宝网(?:首页)?|天猫|我的淘宝|购物车\d*|收藏夹|帮助中心|免费开店|千牛卖家中心|用户调研|桌面版|进店|登录|注册|淘宝网\s*-\s*淘宝)$/;const isNoise=t=>{const v=clean(t);return !v||noise.test(v)};const first=(a,n)=>{for(const v of a){const c=clean(v||"").replace(/-淘宝网|-天猫Tmall\.com|淘宝网$/g,"");if(c&&!isNoise(c))return c.slice(0,n)}return""};const norm=u=>{const v=clean(String(u||"").replace(/\\\//g,"/"));return v.startsWith("//")?"https:"+v:v};const strip=s=>clean(String(s||"").replace(/<[^>]+>/g," "));const cleanScript=s=>{const v=String(s||"").replace(/\\\//g,"/");try{return clean(JSON.parse('"'+v+'"'))}catch{return clean(v.replace(/\\u([0-9a-fA-F]{4})/g,(_,c)=>String.fromCharCode(parseInt(c,16))))}};const propMerge=props=>{const seen=new Set,out=[];for(const p of props){const name=clean(p&&p.name),value=clean(p&&p.value);if(!name||!value)continue;const key=name+":"+value;if(seen.has(key))continue;seen.add(key);out.push({name:name,value:value});if(out.length>=24)break}return out};const inferProps=raw=>{const out=[];for(const line of lines(raw)){const m=line.match(/^(.{2,24})[:：\s]+(.{1,100})$/);if(!m)continue;const name=clean(m[1]),value=clean(m[2]);if(propName.test(name)&&value&&!isNoise(value))out.push({name:name,value:value})}return propMerge(out)};const imageUrls=raw=>{const s=String(raw||"").replace(/\\\//g,"/"),out=[];const re=/(?:https?:)?\/\/[^"'\s<>\\]+?(?:alicdn|taobaocdn)[^"'\s<>\\]*?\.(?:jpg|jpeg|png|webp|gif)(?:_[^"'\s<>\\]*)?/ig;let m;while((m=re.exec(s)))out.push(m[0]);return uniq(out)};const scriptStrings=(raw,keys)=>{const allow=new Set(keys),out=[];const re=/["']([A-Za-z][\w-]{0,40})["']\s*:\s*["']((?:\\.|[^"'\\]){1,2000})["']/g;let m;while((m=re.exec(raw))){if(!allow.has(m[1]))continue;const v=cleanScript(m[2]);if(v&&!isNoise(v))out.push(v)}return uniq(out)};const scriptProps=raw=>{const out=[],patterns=[/["'](?:name|key|label|title)["']\s*:\s*["']((?:\\.|[^"'\\]){1,40})["'][^{}]{0,180}?["'](?:value|text|valueName|valueText)["']\s*:\s*["']((?:\\.|[^"'\\]){1,120})["']/g,/["'](?:value|text|valueName|valueText)["']\s*:\s*["']((?:\\.|[^"'\\]){1,120})["'][^{}]{0,180}?["'](?:name|key|label|title)["']\s*:\s*["']((?:\\.|[^"'\\]){1,40})["']/g];for(let i=0;i<patterns.length;i++){let m;while((m=patterns[i].exec(raw))){const a=cleanScript(m[1]),b=cleanScript(m[2]),p=i===0?{name:a,value:b}:{name:b,value:a};if(propName.test(p.name)&&p.value&&!isNoise(p.value))out.push(p)}}return propMerge(out)};const scriptData=raw=>{const props=scriptProps(raw),title=first(scriptStrings(raw,["itemTitle","auctionTitle","title","itemName","subject","name"]),180),description=first(scriptStrings(raw,["description","detailDescription","pcDescContent","descContent","desc","subTitle","subtitle"]).map(strip),1000),images=uniq(imageUrls(raw).map(norm)).slice(0,12),rawText=clean([title,props.map(p=>p.name+" "+p.value).join("\n"),description].filter(Boolean).join("\n"));return{title:title,props:props,description:description,images:images,rawText:rawText}};const inferDesc=raw=>{const parts=String(raw||"").split(/\n/).map(clean).filter(Boolean),idx=parts.findIndex(line=>/商品详情|商品参数|详情|描述/.test(line)),v=(idx>=0?parts.slice(idx+1):parts).join(" ");return isNoise(v)?"":v.slice(0,1000)};const docImages=()=>{const vals=[];for(const img of document.querySelectorAll("img,source")){["currentSrc","src","data-src","data-ks-lazyload","data-lazyload","data-original","srcset"].forEach(k=>{const v=img[k]||img.getAttribute&&img.getAttribute(k);if(v)vals.push(v)})}return uniq([...imageUrls(vals.join(" ")).map(norm),...vals.map(v=>abs(norm(v))).filter(v=>/(alicdn|taobaocdn).+\.(jpg|jpeg|png|webp|gif)/i.test(v))]).slice(0,12)};const detailTitle=()=>first([document.querySelector("h1")&&document.querySelector("h1").innerText,document.querySelector("meta[property='og:title']")&&document.querySelector("meta[property='og:title']").content,document.querySelector("meta[name='title']")&&document.querySelector("meta[name='title']").content,document.title],180);const loadDetail=async()=>{try{const y=scrollY,h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)-innerHeight;for(const p of[0,.35,.7,1]){scrollTo(0,Math.max(0,h*p));await sleep(220)}scrollTo(0,y);await sleep(120)}catch{}};const detailItem=async()=>{await loadDetail();const raw=text(document.body).slice(0,8000),scripts=[...document.scripts].map(s=>s.textContent||"").join("\n").slice(0,250000),data=scriptData(scripts),props=propMerge([...data.props,...inferProps(raw),...inferProps(data.rawText)]),url=abs(location.href),title=first([data.title,detailTitle(),lines(raw).find(v=>!isNoise(v))],180),description=first([data.description,inferDesc(raw)],1000),images=uniq([...data.images,...docImages()]).slice(0,12),detailRawText=clean([data.rawText,raw].filter(Boolean).join("\n")).slice(0,8000);return{pageType:pageType,itemId:itemId(url),detailUrl:url,detailTitle:title,detailProps:props,detailDescription:description,detailImages:images,detailRawText:detailRawText}};const nearestBox=e=>{let node=e,best=e;for(let i=0;i<7&&node;i+=1,node=node.parentElement){const value=text(node);if(value.length>80&&value.length<3500){best=node;break}if(value.length>text(best).length)best=node}return best};const titleFrom=(el,box,raw)=>{const img=box.querySelector("img");const candidates=[el.textContent,el.getAttribute&&el.getAttribute("title"),img&&img.getAttribute("alt"),...lines(raw).filter(value=>!/订单号|交易|退款|付款|实付|合计|数量|颜色|尺码|规格|¥|￥|\d{4}[-/.年]\d{1,2}/.test(value))];return first(candidates,120)||undefined};const skuFrom=t=>{const found=String(t||"").match(/((颜色|尺码|规格|分类|款式|型号|套餐|尺寸)[^\n。；;]{0,80})/g);return found?clean([...new Set(found.map(clean))].join("; ")):undefined};const qtyFrom=t=>{const found=String(t||"").match(/(?:数量\s*[:：]?\s*|[xX×*]\s*)(\d{1,3})(?!\d)/);return found?Number(found[1]):undefined};const paymentFrom=t=>match(t,/(?:实付款|实付|付款|合计|总价)?\s*[¥￥]\s*([0-9]+(?:\.[0-9]{1,2})?)/);const statusFrom=t=>match(t,/(交易成功|交易关闭|卖家已发货|买家已付款|待付款|待发货|待收货|待评价|已完成|已取消)/);const refundFrom=t=>match(t,/(退款成功|退款中|退货退款|售后中|申请退款|已退款|售后成功|退款关闭)/);const orderIdFrom=t=>match(t,/(?:订单号|订单编号)\s*[:：]?\s*(\d{10,30})/)||match(t,/\b(\d{16,30})\b/);const timeFrom=t=>match(t,/((?:20\d{2})[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?\s+\d{1,2}:\d{2}(?::\d{2})?)/);const imageFrom=box=>{const img=[...box.querySelectorAll("img")].find(visible);return img?abs(norm(img.currentSrc||img.src||img.getAttribute("data-src")||img.getAttribute("data-ks-lazyload")||"")):undefined};const urlFrom=(el,box)=>{const link=(el.closest&&el.closest("a"))||box.querySelector("a[href*='item'],a[href*='detail']");return link?abs(link.href):undefined};const run=async()=>{let items=[];if(pageType==="item-detail"){items=[await detailItem()]}else{const seeds=[...document.querySelectorAll("a[href],img")].filter(visible).filter(el=>el.tagName==="IMG"||/item|detail|trade|order|tmall|taobao/i.test(el.getAttribute("href")||""));const seen=new Set;for(const seed of seeds){const box=nearestBox(seed),raw=text(box);if(raw.length<8)continue;const itemUrl=urlFrom(seed,box),imageUrl=imageFrom(box),title=titleFrom(seed,box,raw);if(!title&&!itemUrl&&!imageUrl)continue;const key=[itemUrl,title,imageUrl,raw.slice(0,160)].join("|");if(seen.has(key))continue;seen.add(key);items.push({pageType:pageType,itemId:itemId(itemUrl),orderId:orderIdFrom(raw),orderTime:timeFrom(raw),title:title,sku:skuFrom(raw),quantity:qtyFrom(raw),payment:paymentFrom(raw),status:statusFrom(raw),refundText:refundFrom(raw),itemUrl:itemUrl,imageUrl:imageUrl,rawText:raw.slice(0,2000),detailUrl:undefined,detailTitle:undefined,detailProps:undefined,detailDescription:undefined,detailImages:undefined,detailRawText:undefined})}}const output={source:"taobao-bookmarklet",pageType:pageType,capturedAt:new Date().toISOString(),pageUrl:location.href,items:items};const json=JSON.stringify(output,null,2);const done=()=>alert("Outfit Taobao JSON copied. Items: "+items.length+" Mode: "+pageType);const fallback=()=>prompt("Copy Outfit Taobao JSON",json);if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(json).then(done).catch(fallback)}else fallback()};run().catch(error=>prompt("Outfit Taobao capture failed",String(error&&error.message||error)))})();`;

export function getTaobaoBookmarklet(): string {
  return `javascript:${TAOBAO_BOOKMARKLET_SCRIPT}`;
}
