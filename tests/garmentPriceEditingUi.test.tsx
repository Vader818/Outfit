import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  GarmentEditor,
  yuanPriceToCents
} from "../src/features/wardrobe/GarmentEditor";
import type { Garment } from "../src/shared/types";

describe("GarmentEditor purchase price", () => {
  it.each([
    ["0", 0],
    ["1299", 129_900],
    [" 1299.5 ", 129_950],
    ["1299.05", 129_905]
  ])("converts %s yuan into integer cents", (value, expected) => {
    expect(yuanPriceToCents(value)).toBe(expected);
  });

  it.each(["", "-1", "1.234", "1,299", "abc", "90071992547410"])(
    "rejects invalid yuan amount %j",
    (value) => {
      expect(yuanPriceToCents(value)).toBeNull();
    }
  );

  it("renders the current amount and reports valid cents through onUpdate", () => {
    const onUpdate = vi.fn();
    const tree = GarmentEditor({ item: garment({ purchasePriceCents: 39_900 }), onUpdate });
    const priceField = findElement(tree, (element) => element.props.label === "购入价格（元）");
    const setCustomValidity = vi.fn();

    expect(renderToStaticMarkup(tree)).toContain("购入价格（元）");
    expect(priceField.props.defaultValue).toBe("399.00");
    invokeBlur(priceField, {
      target: { value: "1299.50" },
      currentTarget: { value: "1299.50", setCustomValidity, reportValidity: vi.fn() }
    });

    expect(setCustomValidity).toHaveBeenCalledWith("");
    expect(onUpdate).toHaveBeenCalledWith({ purchasePriceCents: 129_950 });
  });

  it("does not update when the entered amount is invalid", () => {
    const onUpdate = vi.fn();
    const tree = GarmentEditor({ item: garment(), onUpdate });
    const priceField = findElement(tree, (element) => element.props.label === "购入价格（元）");
    const setCustomValidity = vi.fn();
    const reportValidity = vi.fn();

    invokeBlur(priceField, {
      target: { value: "12.345" },
      currentTarget: { value: "12.345", setCustomValidity, reportValidity }
    });

    expect(setCustomValidity).toHaveBeenCalledWith("价格应为不超过两位小数的非负金额");
    expect(reportValidity).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

function garment(overrides: Partial<Garment> = {}): Garment {
  return {
    id: 1,
    brand: "",
    name: "测试大衣",
    rawName: "测试大衣",
    category: "outerwear",
    color: "black",
    warmth: "heavy",
    seasons: ["winter"],
    styles: ["minimal"],
    formality: "smart-casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    availabilityStatus: "available",
    confidence: 1,
    origin: "taobao",
    ...overrides
  };
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean
): ReactElement<Record<string, unknown>> {
  if (node === null || node === undefined || typeof node === "boolean") {
    throw new Error("未找到目标元素");
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return findElement(child, predicate);
      } catch {
        // Continue searching sibling elements.
      }
    }
    throw new Error("未找到目标元素");
  }
  if (typeof node === "string" || typeof node === "number") {
    throw new Error("未找到目标元素");
  }
  const element = node as ReactElement<Record<string, unknown>>;
  if (predicate(element)) return element;
  return findElement(element.props.children as ReactNode, predicate);
}

function invokeBlur(element: ReactElement<Record<string, unknown>>, event: unknown): void {
  const onBlur = element.props.onBlur;
  if (typeof onBlur !== "function") throw new Error("目标元素没有 onBlur");
  onBlur(event);
}
