# Outfit 本地视觉模型升级剩余问题

更新时间：2026-06-18

## 结论

本轮已补齐本地视觉模型升级中影响可交付性的主要缺口：模型依赖可复现安装、rembg fallback、真实模型验证、设置页验证按钮和启用开关、后端验证 job、job 状态展示、缺模型错误覆盖，以及脚本/前端/后端/Python 测试覆盖。

## 已处理

- `requirements.txt` 和 `requirements.lock.txt` 已声明并锁定 `rembg[cpu]`。
- `output/models` 已实际生成，本机模型状态为：
  - `rembg-isnet`：已安装，当前 fallback 模型为 `u2netp`。
  - `clip-vit-base-patch32`：已安装。
- `npm run models:verify` 已改为使用临时小图真实加载 rembg 和 CLIP，而不是只检查文件存在。
- rembg 支持 `isnet-general-use`、`u2netp`、`silueta` fallback，并在真实执行前显式检查模型文件。
- CLIP 下载只保留必要运行时文件，避免拉取全部 ONNX 变体；如果本地已有 ONNX，会跳过重复 ONNX 下载。
- 模型下载脚本在检测到 `HTTP_PROXY` 或 `HTTPS_PROXY` 时会自动为 Node 启用环境代理。
- 后端新增 `POST /api/vision/models/:id/verify`，下载和验证 job 都会回填到 `GET /api/vision/models`。
- 设置页新增本地视觉启用开关、验证按钮，并展示未下载、下载中、已可用、失败状态。
- cutout 缺 rembg 模型时已覆盖 HTTP 409 `VISION_MODEL_MISSING`。
- 本地 `data/outfit.sqlite` 已通过项目迁移补出：
  - `garments.cutout_image_url`
  - `garments.vision_tags`
  - `garments.vision_updated_at`

## 当前验证结果

- `npm run models:status`：通过，两个模型均为 `installed: true`。
- `npm run models:verify`：通过，rembg 与 CLIP 均可本地加载。
- `python scripts/vision_rembg.py --status --model-dir output/models/rembg`：通过，`rembgInstalled: true`，`u2netp: true`。
- 局部回归测试已覆盖：
  - `tests/modelsScript.test.mjs`
  - `tests/modelFiles.test.mjs`
  - `tests/test_vision_rembg.py`
  - `tests/api.test.ts`
  - `tests/frontendApi.test.ts`
  - `tests/app.test.tsx`

## 尚未完成的人工验收

- 还没有使用真实淘宝商品图完成“3 张商品图去背景、5 件衣物标签建议、确认不会误改正式衣橱字段”的人工验收。当前已通过临时小图验证模型可加载，真实图片验收需要可用的本地衣物缩略图样本。

## 暂不纳入本轮

- 相似单品检索、主色提取、独立衣物图整理工作流仍未实现。它们属于原计划中的后续增强能力，不影响本轮已落地的模型下载、验证、去背景和标签建议入口。
