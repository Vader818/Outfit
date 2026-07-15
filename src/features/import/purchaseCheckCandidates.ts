import type { TaobaoImportPreview, TaobaoImportPreviewItem } from "../../shared/types";

export function eligiblePurchaseCheckCandidates(
  preview: TaobaoImportPreview | null | undefined
): TaobaoImportPreviewItem[] {
  return preview?.candidates.filter((candidate) => (
    candidate.purchaseCheckEligible &&
    candidate.disposition !== "refund-sync" &&
    candidate.disposition !== "skip"
  )) ?? [];
}
