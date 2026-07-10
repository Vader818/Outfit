import type { Garment } from "../shared/types";

export async function refreshGarmentsForView(
  loadGarments: () => Promise<Garment[]>,
  onGarments: (garments: Garment[]) => void,
  onError: (message: string) => void
): Promise<void> {
  onError("");
  try {
    onGarments(await loadGarments());
  } catch (error) {
    onError(error instanceof Error ? error.message : "衣橱读取失败");
  }
}

export async function copyTextToClipboard(
  writeText: (text: string) => Promise<unknown>,
  text: string,
  onError: (message: string) => void
): Promise<void> {
  onError("");
  try {
    await writeText(text);
  } catch (error) {
    onError(error instanceof Error ? error.message : "复制失败");
  }
}

export async function deleteGarmentForView(
  removeGarment: (id: number) => Promise<void>,
  id: number,
  onGarments: (updater: (items: Garment[]) => Garment[]) => void,
  onSelectedIds: (updater: (ids: number[]) => number[]) => void,
  onError: (message: string) => void
): Promise<void> {
  onError("");
  try {
    await removeGarment(id);
    onGarments((items) => items.filter((item) => item.id !== id));
    onSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id));
  } catch (error) {
    onError(error instanceof Error ? error.message : "衣物删除失败");
  }
}
