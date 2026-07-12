import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  FeedbackManagementDialog,
  buildFeedbackClearScope
} from "../src/features/insights/FeedbackManagementDialog";

describe("FeedbackManagementDialog", () => {
  it("builds explicit all, candidate, and date-range scopes", () => {
    expect(buildFeedbackClearScope("all", "", "", "")).toEqual({ scope: "all" });
    expect(buildFeedbackClearScope(
      "candidate",
      "11111111-1111-4111-8111-111111111111",
      "",
      ""
    )).toEqual({
      scope: "candidate",
      candidateId: "11111111-1111-4111-8111-111111111111"
    });
    expect(buildFeedbackClearScope("date-range", "", "2026-07-01", "2026-07-12")).toEqual({
      scope: "date-range",
      from: "2026-07-01",
      to: "2026-07-12"
    });
    expect(() => buildFeedbackClearScope("candidate", "", "", "")).toThrow(/候选/);
    expect(() => buildFeedbackClearScope("date-range", "", "2026-07-12", "2026-07-01")).toThrow(/日期/);
  });

  it("shows the preview scope and impact before exposing final confirmation", () => {
    const markup = renderToStaticMarkup(
      <FeedbackManagementDialog
        open
        busy={false}
        preview={{
          scope: "date-range",
          from: "2026-07-01",
          to: "2026-07-12",
          feedbackCount: 7,
          affectedPairCount: 11
        }}
        onClose={vi.fn()}
        onPreview={vi.fn()}
        onConfirm={vi.fn()}
        onResetPreview={vi.fn()}
      />
    );

    expect(markup).toContain("管理反馈数据");
    expect(markup).toContain("2026-07-01");
    expect(markup).toContain("2026-07-12");
    expect(markup).toContain("7 条反馈");
    expect(markup).toContain("11 对衣物组合");
    expect(markup).toContain("确认清空");
  });

  it("keeps confirmation unavailable until a preview exists", () => {
    const markup = renderToStaticMarkup(
      <FeedbackManagementDialog
        open
        busy={false}
        preview={null}
        onClose={vi.fn()}
        onPreview={vi.fn()}
        onConfirm={vi.fn()}
        onResetPreview={vi.fn()}
      />
    );

    expect(markup).toContain("预览影响范围");
    expect(markup).not.toMatch(/<button[^>]*>确认清空<\/button>/);
  });
});
