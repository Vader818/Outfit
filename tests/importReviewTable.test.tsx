import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ImportReviewTable } from "../src/features/import/ImportReviewTable";
import type {
  ImportDecision,
  TaobaoImportPreview,
  TaobaoImportPreviewItem
} from "../src/shared/types";

describe("ImportReviewTable", () => {
  it("disables field editing while a candidate is unchecked and re-enables it after selection", () => {
    const item = makeItem({ sourceItemKey: "order-disabled", disposition: "create" });
    const preview = makePreview(item);
    const decisions: Record<string, ImportDecision> = {
      [item.sourceItemKey]: { sourceItemKey: item.sourceItemKey, include: false }
    };
    const onDecision = vi.fn((sourceItemKey: string, next: ImportDecision) => {
      decisions[sourceItemKey] = next;
    });

    const uncheckedTable = ImportReviewTable({ preview, decisions, onDecision });
    const uncheckedEditor = renderFunctionComponent(findComponent(uncheckedTable, "ImportRowEditor"));
    const uncheckedFieldset = findElement(uncheckedEditor, (element) => element.type === "fieldset");
    const uncheckedName = findElement(uncheckedEditor, (element) => element.props.label === "名称");
    expect(uncheckedFieldset.props.disabled).toBe(true);
    invokeChange(uncheckedName, { target: { value: "不应写入" } });
    expect(onDecision).not.toHaveBeenCalled();

    const includeCheckbox = findElement(uncheckedTable, (element) => (
      element.type === "input"
        && typeof element.props.id === "string"
        && element.props.id.endsWith("-include")
    ));
    expect(includeCheckbox.props.disabled).toBe(false);
    invokeChange(includeCheckbox, { target: { checked: true } });

    const checkedTable = ImportReviewTable({ preview, decisions, onDecision });
    const checkedEditor = renderFunctionComponent(findComponent(checkedTable, "ImportRowEditor"));
    const checkedFieldset = findElement(checkedEditor, (element) => element.type === "fieldset");
    const checkedName = findElement(checkedEditor, (element) => element.props.label === "名称");
    expect(checkedFieldset.props.disabled).toBe(false);
    invokeChange(checkedName, { target: { value: "可以写入" } });
    expect(decisions[item.sourceItemKey]).toMatchObject({
      include: true,
      overrides: { name: "可以写入" }
    });
  });

  it("keeps an empty size as an explicit override so it can clear the stored size", () => {
    const item = makeItem({ sourceItemKey: "order-size", disposition: "update", size: "M" });
    const preview = makePreview(item);
    const decisions: Record<string, ImportDecision> = {
      [item.sourceItemKey]: { sourceItemKey: item.sourceItemKey, include: true }
    };
    const onDecision = vi.fn((sourceItemKey: string, next: ImportDecision) => {
      decisions[sourceItemKey] = next;
    });

    const table = ImportReviewTable({ preview, decisions, onDecision });
    const editor = renderFunctionComponent(findComponent(table, "ImportRowEditor"));
    const sizeField = findElement(editor, (element) => element.props.label === "尺码");
    invokeChange(sizeField, { target: { value: "" } });

    expect(decisions[item.sourceItemKey]).toEqual({
      sourceItemKey: item.sourceItemKey,
      include: true,
      overrides: { size: "" }
    });
  });

  it("removes field overrides when an edited candidate is unchecked", () => {
    const item = makeItem({ sourceItemKey: "order-1", disposition: "create" });
    const preview = makePreview(item);
    const decisions: Record<string, ImportDecision> = {
      [item.sourceItemKey]: { sourceItemKey: item.sourceItemKey, include: true }
    };
    const onDecision = vi.fn((sourceItemKey: string, next: ImportDecision) => {
      decisions[sourceItemKey] = next;
    });

    const editor = findComponent(
      ImportReviewTable({ preview, decisions, onDecision }),
      "ImportRowEditor"
    );
    const editorTree = renderFunctionComponent(editor);
    const nameField = findElement(editorTree, (element) => element.props.label === "名称");
    invokeChange(nameField, { target: { value: "修正后的名称" } });

    expect(decisions[item.sourceItemKey]).toEqual({
      sourceItemKey: item.sourceItemKey,
      include: true,
      overrides: { name: "修正后的名称" }
    });

    const editedTable = ImportReviewTable({ preview, decisions, onDecision });
    const includeCheckbox = findElement(editedTable, (element) => (
      element.type === "input"
        && typeof element.props.id === "string"
        && element.props.id.endsWith("-include")
    ));
    invokeChange(includeCheckbox, { target: { checked: false } });

    const commitPayload = { decisions: Object.values(decisions) };
    expect(commitPayload).toEqual({
      decisions: [{ sourceItemKey: item.sourceItemKey, include: false }]
    });
    expect(commitPayload.decisions[0]).not.toHaveProperty("overrides");

    const uncheckedTable = ImportReviewTable({ preview, decisions, onDecision });
    const uncheckedCheckbox = findElement(uncheckedTable, (element) => (
      element.type === "input"
        && typeof element.props.id === "string"
        && element.props.id.endsWith("-include")
    ));
    invokeChange(uncheckedCheckbox, { target: { checked: true } });
    expect(decisions[item.sourceItemKey]).toEqual({
      sourceItemKey: item.sourceItemKey,
      include: true
    });
  });

  it("keeps refund sync selectable while preventing field overrides", () => {
    const item = makeItem({ sourceItemKey: "refund-1", disposition: "refund-sync" });
    const preview = makePreview(item);
    const onDecision = vi.fn();
    const decisions = {
      [item.sourceItemKey]: { sourceItemKey: item.sourceItemKey, include: true }
    } satisfies Record<string, ImportDecision>;
    const table = ImportReviewTable({ preview, decisions, onDecision });

    const markup = renderToStaticMarkup(table);
    expect(markup).toContain("退款同步：字段不可修正");
    expect(markup).toContain("此候选仅同步退款状态；可以选择是否同步，但不能修改衣物字段。");
    expect(markup).toContain("<fieldset disabled=\"\"");

    const includeCheckbox = findElement(table, (element) => (
      element.type === "input"
        && typeof element.props.id === "string"
        && element.props.id.endsWith("-include")
    ));
    expect(includeCheckbox.props.disabled).toBe(false);
    invokeChange(includeCheckbox, { target: { checked: false } });
    expect(onDecision).toHaveBeenCalledWith(item.sourceItemKey, {
      sourceItemKey: item.sourceItemKey,
      include: false
    });

    onDecision.mockClear();
    const editor = findComponent(table, "ImportRowEditor");
    const editorTree = renderFunctionComponent(editor);
    const nameField = findElement(editorTree, (element) => element.props.label === "名称");
    invokeChange(nameField, { target: { value: "不应生效的修改" } });
    expect(onDecision).not.toHaveBeenCalled();
  });
});

function makePreview(...candidates: TaobaoImportPreviewItem[]): TaobaoImportPreview {
  return {
    batchId: "batch-1",
    summary: {
      totalItems: candidates.length,
      uniqueItems: candidates.length,
      skippedRefunded: 0,
      skippedNonApparel: 0,
      createdGarments: 0
    },
    duplicateCount: 0,
    candidates,
    skipped: []
  };
}

function makeItem(overrides: Partial<TaobaoImportPreviewItem>): TaobaoImportPreviewItem {
  return {
    sourceItemKey: "item-1",
    brand: "示例品牌",
    name: "示例上衣",
    rawName: "示例上衣",
    category: "top",
    color: "black",
    warmth: "medium",
    seasons: ["spring"],
    styles: ["casual"],
    formality: "casual",
    materials: [],
    patterns: [],
    tags: [],
    notes: "",
    confidence: 0.9,
    imageUrl: "",
    disposition: "create",
    ...overrides
  };
}

function findComponent(node: ReactNode, name: string): ReactElement<Record<string, unknown>> {
  return findElement(node, (element) => (
    typeof element.type === "function" && element.type.name === name
  ));
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean
): ReactElement<Record<string, unknown>> {
  let match: ReactElement<Record<string, unknown>> | undefined;
  function visit(current: ReactNode) {
    if (match) return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement<Record<string, unknown>>(current)) return;
    if (predicate(current)) {
      match = current;
      return;
    }
    visit(current.props.children as ReactNode);
  }
  visit(node);
  if (!match) throw new Error("未找到预期的 React 元素");
  return match;
}

function renderFunctionComponent(element: ReactElement<Record<string, unknown>>): ReactElement {
  if (typeof element.type !== "function") throw new Error("目标不是函数组件");
  const Component = element.type as (props: Record<string, unknown>) => ReactElement;
  return Component(element.props);
}

function invokeChange(element: ReactElement<Record<string, unknown>>, event: unknown) {
  const onChange = element.props.onChange;
  if (typeof onChange !== "function") throw new Error("目标元素没有 onChange");
  onChange(event);
}
