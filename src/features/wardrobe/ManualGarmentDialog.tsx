import { ImagePlus, Save, X } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button, Dialog, Field, IconButton, Notice, SelectField } from "../../components/ui";
import {
  CATEGORY_OPTIONS,
  COLOR_OPTIONS,
  OCCASIONS,
  OCCASION_LABELS,
  SEASON_OPTIONS,
  WARMTH_OPTIONS,
  parseList
} from "../../shared/presentation";
import type {
  Formality,
  Garment,
  GarmentCategory,
  GarmentWarmth,
  ManualGarmentCreate,
  Season
} from "../../shared/types";
import { GARMENT_IMAGE_MIME_TYPES, isGarmentImageMimeType } from "../../lib/imageSanitization";

const FORMALITY_OPTIONS = OCCASIONS.map((value) => ({ value, label: OCCASION_LABELS[value] }));
const DEFAULT_SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

export interface ManualGarmentDialogProps {
  open: boolean;
  busy: boolean;
  error?: string;
  savedGarment?: Garment | null;
  onClose: () => void;
  onSubmit: (input: ManualGarmentCreate, imageFile?: File) => void | Promise<void>;
}

export function ManualGarmentDialog(props: ManualGarmentDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const [name, setName] = useState("");
  const [category, setCategory] = useState<GarmentCategory>("top");
  const [color, setColor] = useState("unknown");
  const [warmth, setWarmth] = useState<GarmentWarmth>("medium");
  const [seasons, setSeasons] = useState<Season[]>(DEFAULT_SEASONS);
  const [styles, setStyles] = useState("casual");
  const [formality, setFormality] = useState<Formality>("casual");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [materials, setMaterials] = useState("");
  const [patterns, setPatterns] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [acquiredAt, setAcquiredAt] = useState("");
  const [priceYuan, setPriceYuan] = useState("");
  const [imageFile, setImageFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const locked = Boolean(props.savedGarment);

  useEffect(() => {
    if (props.open) return;
    resetForm();
  }, [props.open]);

  useEffect(() => {
    if (!imageFile || typeof URL.createObjectURL !== "function") {
      setPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  function resetForm() {
    setName("");
    setCategory("top");
    setColor("unknown");
    setWarmth("medium");
    setSeasons(DEFAULT_SEASONS);
    setStyles("casual");
    setFormality("casual");
    setBrand("");
    setSize("");
    setMaterials("");
    setPatterns("");
    setTags("");
    setNotes("");
    setAcquiredAt("");
    setPriceYuan("");
    setImageFile(undefined);
    setFieldErrors({});
  }

  function requestClose() {
    if (!props.busy) props.onClose();
  }

  function toggleSeason(season: Season) {
    setSeasons((current) => current.includes(season)
      ? current.filter((value) => value !== season)
      : [...current, season]);
    setFieldErrors((current) => ({ ...current, seasons: undefined }));
  }

  function selectImage(file: File | undefined) {
    if (!file) {
      setImageFile(undefined);
      setFieldErrors((current) => ({ ...current, image: undefined }));
      return;
    }
    if (!isGarmentImageMimeType(file.type)) {
      setImageFile(undefined);
      setFieldErrors((current) => ({ ...current, image: "照片必须是 JPEG、PNG 或 WebP 格式" }));
      return;
    }
    setImageFile(file);
    setFieldErrors((current) => ({ ...current, image: undefined }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked && !imageFile) {
      setFieldErrors((current) => ({ ...current, image: "请选择要重试上传的照片" }));
      return;
    }

    const nextErrors: FormErrors = {};
    const cleanedName = name.trim();
    const styleValues = parseList(styles);
    if (!cleanedName) nextErrors.name = "请输入衣物名称";
    if (!seasons.length) nextErrors.seasons = "请至少选择一个适穿季节";
    if (!styleValues.length) nextErrors.styles = "请至少填写一个风格";

    const price = priceYuan.trim() ? yuanToCents(priceYuan) : undefined;
    if (priceYuan.trim() && price === null) {
      nextErrors.price = "价格应为不超过两位小数的非负金额";
    }
    if (Object.values(nextErrors).some(Boolean)) {
      setFieldErrors((current) => ({ ...current, ...nextErrors }));
      return;
    }
    setFieldErrors({});

    const input: ManualGarmentCreate = {
      name: cleanedName,
      category,
      color,
      warmth,
      seasons,
      styles: styleValues,
      formality,
      ...optionalText("brand", brand),
      ...optionalText("size", size),
      ...optionalList("materials", materials),
      ...optionalList("patterns", patterns),
      ...optionalList("tags", tags),
      ...optionalText("notes", notes),
      ...(acquiredAt ? { acquiredAt } : {}),
      ...(price === undefined || price === null ? {} : { purchasePriceCents: price, currency: "CNY" as const })
    };
    void props.onSubmit(input, imageFile);
  }

  const formDisabled = props.busy || locked;
  const imageErrorId = fieldErrors.image ? `${id}-image-error` : undefined;

  return (
    <Dialog
      open={props.open}
      onClose={requestClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="manual-garment-dialog"
    >
      <form className="manual-garment-dialog__panel" aria-busy={props.busy || undefined} onSubmit={submit}>
        <header className="manual-garment-dialog__header">
          <div>
            <span className="manual-garment-dialog__eyebrow">本地手工建档</span>
            <h2 id={titleId}>添加衣物</h2>
            <p id={descriptionId}>填写关键信息即可保存，照片可选且只上传到本机服务。</p>
          </div>
          <IconButton label="关闭添加衣物" disabled={props.busy} onClick={requestClose}>
            <X aria-hidden="true" size={19} />
          </IconButton>
        </header>

        {props.savedGarment ? (
          <Notice tone={props.error ? "warning" : "success"} role="status" title="衣物已经保存">
            「{props.savedGarment.name}」已进入衣橱。建档字段已锁定；如照片失败，可选择照片后重试上传，不会重复创建衣物。
          </Notice>
        ) : null}
        {props.error ? <Notice tone="danger" role="alert">{props.error}</Notice> : null}

        <div className="manual-garment-dialog__grid">
          <Field
            id={`${id}-name`}
            label="衣物名称"
            value={name}
            required
            autoFocus
            disabled={formDisabled}
            error={fieldErrors.name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldErrors((current) => ({ ...current, name: undefined }));
            }}
          />
          <Field id={`${id}-brand`} label="品牌" value={brand} disabled={formDisabled} onChange={(event) => setBrand(event.target.value)} />
          <SelectField
            id={`${id}-category`}
            label="类别"
            value={category}
            options={CATEGORY_OPTIONS}
            disabled={formDisabled}
            onChange={(event) => setCategory(event.target.value as GarmentCategory)}
          />
          <SelectField
            id={`${id}-color`}
            label="颜色"
            value={color}
            options={COLOR_OPTIONS}
            disabled={formDisabled}
            onChange={(event) => setColor(event.target.value)}
          />
          <SelectField
            id={`${id}-warmth`}
            label="厚度"
            value={warmth}
            options={WARMTH_OPTIONS}
            disabled={formDisabled}
            onChange={(event) => setWarmth(event.target.value as GarmentWarmth)}
          />
          <SelectField
            id={`${id}-formality`}
            label="正式度"
            value={formality}
            options={FORMALITY_OPTIONS}
            disabled={formDisabled}
            onChange={(event) => setFormality(event.target.value as Formality)}
          />
          <Field id={`${id}-size`} label="尺码" value={size} disabled={formDisabled} onChange={(event) => setSize(event.target.value)} />
          <Field
            id={`${id}-styles`}
            label="风格"
            value={styles}
            required
            disabled={formDisabled}
            hint="多个风格使用逗号分隔"
            error={fieldErrors.styles}
            onChange={(event) => {
              setStyles(event.target.value);
              setFieldErrors((current) => ({ ...current, styles: undefined }));
            }}
          />
          <Field id={`${id}-materials`} label="材质" value={materials} disabled={formDisabled} hint="多个材质使用逗号分隔" onChange={(event) => setMaterials(event.target.value)} />
          <Field id={`${id}-patterns`} label="图案" value={patterns} disabled={formDisabled} hint="多个图案使用逗号分隔" onChange={(event) => setPatterns(event.target.value)} />
          <Field id={`${id}-tags`} label="标签" value={tags} disabled={formDisabled} hint="多个标签使用逗号分隔" onChange={(event) => setTags(event.target.value)} />
          <Field id={`${id}-acquired-at`} label="购入日期" type="date" value={acquiredAt} disabled={formDisabled} onChange={(event) => setAcquiredAt(event.target.value)} />
          <Field
            id={`${id}-price`}
            label="购入价格（元）"
            type="text"
            inputMode="decimal"
            value={priceYuan}
            disabled={formDisabled}
            placeholder="例如 299.00"
            error={fieldErrors.price}
            onChange={(event) => {
              setPriceYuan(event.target.value);
              setFieldErrors((current) => ({ ...current, price: undefined }));
            }}
          />
          <SelectField id={`${id}-currency`} label="币种" value="CNY" options={[{ value: "CNY", label: "人民币（CNY）" }]} disabled />
        </div>

        <fieldset className="manual-garment-dialog__seasons" disabled={formDisabled} aria-describedby={fieldErrors.seasons ? `${id}-seasons-error` : undefined}>
          <legend>适穿季节</legend>
          <div className="manual-garment-dialog__season-options">
            {SEASON_OPTIONS.map((option) => {
              const season = option.value as Season;
              const selected = seasons.includes(season);
              return (
                <Button key={season} size="sm" variant={selected ? "primary" : "secondary"} aria-pressed={selected} onClick={() => toggleSeason(season)}>
                  {option.label}
                </Button>
              );
            })}
          </div>
          {fieldErrors.seasons ? <small id={`${id}-seasons-error`} className="ui-field__error">{fieldErrors.seasons}</small> : null}
        </fieldset>

        <label className="ui-field manual-garment-dialog__notes" htmlFor={`${id}-notes`}>
          <span className="ui-field__label">备注</span>
          <textarea id={`${id}-notes`} className="ui-input" value={notes} disabled={formDisabled} rows={4} onChange={(event) => setNotes(event.target.value)} />
        </label>

        <section className="manual-garment-dialog__image" aria-labelledby={`${id}-image-title`}>
          <div>
            <strong id={`${id}-image-title`}>本地照片（可选）</strong>
            <p>浏览器会先缩放预览；服务器仍会独立校验并净化图片。</p>
          </div>
          <label className="ui-button ui-button--secondary ui-button--md" htmlFor={`${id}-image-input`}>
            <ImagePlus aria-hidden="true" size={18} />
            {imageFile ? "更换照片" : "选择照片"}
          </label>
          <input
            id={`${id}-image-input`}
            className="sr-only"
            type="file"
            accept={GARMENT_IMAGE_MIME_TYPES.join(",")}
            disabled={props.busy}
            aria-describedby={imageErrorId}
            aria-invalid={Boolean(fieldErrors.image) || undefined}
            onChange={(event) => selectImage(event.target.files?.[0])}
          />
          {fieldErrors.image ? <small id={imageErrorId} className="ui-field__error">{fieldErrors.image}</small> : null}
          {previewUrl ? (
            <figure className="manual-garment-dialog__preview">
              <img src={previewUrl} alt="所选衣物照片预览" />
              <figcaption>{imageFile?.name} · {formatFileSize(imageFile?.size ?? 0)}</figcaption>
            </figure>
          ) : null}
        </section>

        <footer className="manual-garment-dialog__footer">
          <Button variant="ghost" disabled={props.busy} onClick={requestClose}>
            <X aria-hidden="true" size={16} />
            {props.savedGarment ? "稍后处理" : "取消"}
          </Button>
          <Button variant="primary" type="submit" disabled={props.busy || (locked && !imageFile)}>
            <Save aria-hidden="true" size={16} />
            {props.busy ? "处理中" : props.savedGarment ? "重试上传照片" : "保存衣物"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

interface FormErrors {
  name?: string;
  seasons?: string;
  styles?: string;
  price?: string;
  image?: string;
}

export function yuanToCents(value: string): number | null {
  const cleaned = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [yuan, fraction = ""] = cleaned.split(".");
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function optionalText<Key extends "brand" | "size" | "notes">(
  key: Key,
  value: string
): Pick<ManualGarmentCreate, Key> | Record<string, never> {
  const cleaned = value.trim();
  return cleaned ? { [key]: cleaned } as Pick<ManualGarmentCreate, Key> : {};
}

function optionalList<Key extends "materials" | "patterns" | "tags">(
  key: Key,
  value: string
): Pick<ManualGarmentCreate, Key> | Record<string, never> {
  const items = parseList(value);
  return items.length ? { [key]: items } as Pick<ManualGarmentCreate, Key> : {};
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
