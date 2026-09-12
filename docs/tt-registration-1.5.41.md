# 给 TT 维护者：RabbitMirror ChatSurface 注册窗口

核验日期：2026-09-12。固定上游提交 `9693a4ec47cd4552f90878bccab453f176de0f18`。仅只读核验，没有修改、推送或发布 TT。

## 可复现的机制

- [src/script.js](https://github.com/Darkatse/TauriTavern/blob/9693a4ec47cd4552f90878bccab453f176de0f18/src/script.js#L1162) 先 await 系统扩展、指定渲染器，再调用非 await 的 autoloadLastChat；一般第三方扩展在 tokenizer/scraper 初始化后继续加载。由于自动载入聊天并发进行，这是竞态，不是保证每次失败。
- [src/scripts/extensions.js](https://github.com/Darkatse/TauriTavern/blob/9693a4ec47cd4552f90878bccab453f176de0f18/src/scripts/extensions.js#L1986) 首阶段仅 system 类型；类型来自 discover，不由 ZIP manifest 自报。loading_order 只在已过滤的阶段内排序。
- 同文件的 CHAT_SURFACE_RENDERER_CAPABILITIES 只提前加载 JS-Slash-Runner / LittleWhiteBox。该表还有“最多一个”和代码块委派语义，不能简单把 RabbitMirror 加进去，否则会与其他渲染器冲突。
- [participant-registry.js](https://github.com/Darkatse/TauriTavern/blob/9693a4ec47cd4552f90878bccab453f176de0f18/src/tauri/main/services/chat-surface/participant-registry.js#L76) 首次投影冻结后禁止注册。公开 API 无热注册/注销；[ChatSurface 契约](https://github.com/Darkatse/TauriTavern/blob/9693a4ec47cd4552f90878bccab453f176de0f18/docs/API/ChatSurface.md) 要求投影之前完成注册。

RabbitMirror 当前定义只含 id/protocolVersion/didMount/didCommitContent，符合 v1 字段。它在自己的入口模块求值时注册，而不是重 DOM 模块加载时；如果整个扩展已被宿主延后，插件内部再前移 import 无法跨越宿主阶段。

## 建议宿主协调方向（未实施）

提供与“互斥代码渲染器”分开的、显式声明的 participant 提前加载阶段，在任何聊天投影前 await 完成。仍保留同步钩子、AbortSignal 生命周期、DOM ownership 及冻结保护。需要 TT 维护者确定公开契约、版本兼容与 UI 开关，不在插件里发明私有热注册、伪装 system 或关闭虚化。

## 验证边界

本地测试使用固定提交的原始注册器：早注册可以接收 live lease，abort 后只清理一次；先 freeze 再注册稳定失败，并分类为 late-projection；重复 ID 可区分；未知异常只保留固定 host-rejected。测试通过表示机制被复现、诊断被验证，不表示用户 TT 界面消失已根治。

下一步需宿主提供正式提前加载契约后，再进行真实 TT 的长聊天、重启、虚化开关、生成和双插件兼容验收。不能仅凭 managed=true / registered=false 区分重复安装和晚注册，本版新增细分原因用于下一次明确判断。
