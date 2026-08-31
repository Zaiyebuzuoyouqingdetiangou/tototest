# RabbitMirror／兔子镜现行需求与开发规则（CURRENT）

更新：2026-08-31。对应测试候选：1.5.6 ABC1；运行时/manifest 为 `1.5.6`，核心模块 cache cohort 为 `1.5.6-abc1`。本文是本包唯一 CURRENT，不以旧 README/CHANGELOG 历史段落代替现状。

## 基线与授权

本轮唯一代码基线为用户上传的 `tototest-main(1).zip`（实际 1.5.5）。`兔子镜-multiface-step1(1).zip` 和移植说明仅作设计参考。输入原包未覆盖；GitHub 默认只读，本轮没有 commit、push、branch、PR 或正式晋升。

本轮仅授权 A：展现形式随机冷却窄修；B：默认关闭的增强视觉许可；C：多面第一阶段设置/计划/存储。C 第二阶段只设计，不实现。后续一律以用户当轮指定源码为准；仅要求检查时不修改。

## 已实现并有自动化证据：A

- 普通路线格式 group 乘数为 1，不让同一大类的不同玩法承担 group 连带降权。
- 仅最终选中主题的显式 tag 经 trim/小写化等于 `if` 时启用原 group 因子。`format_only` 或无可靠 tag 的自定义 IF 文本走普通策略，不猜标题/编号/正文。
- exact 同时保护近期 attempt 与正式 history；格式 family/group 只使用正式 history。失败的未提交格式不再让兄弟形式承受成功冷却。主题规则不变。
- family 首因子 0.28、group 首因子 0.35、后续衰减 0.72、软下界 0.12 不变；即时上一成功 family 避让保留。收藏 1–50 倍/旧默认 3 倍、黑名单、家族规模均衡和小池回退保留。不新增任何母本专属权重、硬保底或固定轮播。
- 单面 pity 仍在抽取时累计 eligible miss、抽中即清零，不能称为“实际显示成功才计数”。正式 history 本身也不是显示成功证明。
- 每侧普通/IF 各 50,000 轮生产 picker 主模拟已完成，另有失败/交替提交模拟。普通尾部整体改善，但部分条目和最长未命中变差；不承诺有限随机中每项都更频繁。

## 已实现并有自动化证据：B

- 字段 `enhancedVisualDrawing`，默认 `false`；只有字面量 `true` 开启，非布尔旧值、缺失值安全回落关闭，重置也关闭。
- 控件位于原“个性化视觉提示词”区域，沿用原生 checkbox/完整 label；增加一个 change 保存事件，不新增 UI 模板系统。
- 开启时仅追加：`可随本轮内容自由活用 HTML / CSS / 安全内联 SVG 等视觉技法；媒介与组合方式自由选择，不要求每轮使用 SVG。`
- 固定原包抽签结果的 192 组 OFF Prompt 逐字节一致；ON 只增加 65 字符/145 UTF-8 字节/估算 38–39 Token。原近输出锁、metadata、前后 Prompt 块不变。
- 不改变 picker/母本概率，不要求 SVG，不规定媒介职责。sanitizer 允许/禁止集合不变；不得为视觉功能绕开净化。
- 12,000 聊天正文、20,000 上下文、32,000 完整请求字符上限不变。ON 接近总预算时挤占 65 字符上下文余量；按条目裁剪可能影响条目取舍，不声称零成本。

## 已实现并有自动化证据：C 第一阶段

- `rabbitMirrorFaceCount` 严格只接受数字 1/2/3，默认 1；缺失、字符串、小数、NaN、越界值回落 1。当前生产 UI/API/Prompt 仍只生成单面，没有开放多面输出。
- `pickCombinationBatch(..., 1)` 立即走原单面入口，不读/清另一批 pending，不加 batchId/faceIndex、Prompt、Token、请求或 DOM。C 前后 240 次单面 RNG/结果/Prompt/存储 ledger 完全一致；普通/IF 的 10 份原始序列前缀也一致。
- 2/3 面入口要求调用方明确提供 `batchIdentity = { mesid, swipeId, sourceHash }`，与实际 chat key、generation scope、影响抽取的有界完整设置/指令签名绑定；不读取最终正文来猜身份，不存 API Key 或完整聊天。
- 一次共享候选/历史/指令快照；批内 exact theme/format 不重复，不强制“大类各一个”。小池、显式点菜/关闭、强制视觉路线冲突或存储失败时安全减少面数/保持单面，不发请求。
- 完整 batch 写入且读回成功后，才清理旧单槽 pending；异常尽可能回滚自己可确认的写入，不覆盖另一个身份刚写入的数据。永久失效的存储和跨标签页 localStorage 不具备原子 CAS，不能承诺无限故障下必然恢复。
- 带身份批次提交要求匹配 expected batchId + 完整 identity；只有显式提交的 face 入 history。正式 history 的 `batchId + faceIndex` 在有限保留窗口内防重复；读写失败不冒充提交成功。
- 存储失败复用已抽首面，按原单面顺序 finalize 一次，不再抽签。同一连续活跃 scope 保持该降级；不同 scope 可在存储恢复后重新规划。已消耗随机数不回滚，不把异常降级称为直接单面 RNG 兼容。
- 原单面 pending/commit/history key 与行为不变；无关 batch 不因单面生成被读取或清除。

## C 第一阶段明确未承诺的能力

1. 纯 batch 规划只读取已有 pity 倍率，不做全局 aging/reset，batch commit 也不做。C2 接入真实生命周期前须定义每批一次计数和真实成功面 reset；不能按面数累计。
2. 内存缓存与 pending 为有界单槽，不是并发 owner 注册表。相同当前身份连续读取稳定；交错另一 scope/槽位淘汰后不保证旧缓存仍在。C2 必须先实现或限制多个在途批次生命周期，不能因淘汰重复收费。
3. 当前正式 history 窗口按成功 face 条目计数，不按 batch 轮数。默认窗口 10 时，1/2/3 面模拟的 exact 最短轮距为 11/6/4；不能宣传成所有面数都保持“10 整轮”。C2 需明确该计数单位与 pity 一并验收。
4. 显式 commit 是调用方提供成功证据的基础接口；C1 不自行验证 DOM 渲染成功，也没有证明真实模型每面会兑现差异。

## 仅设计、尚未实现：C 第二阶段

见 `docs/multiface-phase2-design.md`。推荐一个 `<toto>` 协议 envelope、一个本地可信 batch host，内部多个受隔离 face；不固定三卡/页签/列布局。

2A：一次响应协议、受限解析、逐面净化与 CSS/ID/SVG 引用隔离、可信身份/总预算、部分成功和聚合数据。2B：挂载、历史恢复、维修/挨打猫/Touch 局部作用域、手机布局与性能。未实现任何新多面 Prompt 输出、scanner、sanitizer、host 或 DOM 链；2/3 面最终仍必须仅一次付费请求，无自动补面/重试。

## 不可顺手修改的保护边界

母本与主题正文、兔子洞、美化核心、配色/结构冷却、主/独立 API 触发、当前最终正文读取、单次付费 lease、owner/intent、SSE/NDJSON/非流式、DeepSeek reasoning 排除、标签过滤/隔离、世界书、最近 X 层、预算、旧 Swipe/sourceHash 防回绑、安卓/小米宽度、维修兔、挨打猫、Touch Theater、净化白名单、历史 schema/migration key 及启动延迟架构均不扩大本轮改动范围。

更新后整页刷新酒馆以结束旧模块实例。缓存闭包正确不代表未清理旧入口的同页热替换已通过实机；不要用清空/重置历史代替刷新。当前只新增一个设置 change 监听，不新增 fetch、计时器、Observer、常驻轮询或全聊天扫描。

## 自动化、已知原有失败与实机待验收

串行使用包内 `tests/hostLoader.mjs`。当前 53 个测试程序中 52 通过；105 个 JS/MJS 语法通过。唯一失败与原包相同：`libraryDataIntegrity.test.mjs:77` 的豆瓣 structured raw 与母本原文不一致。原包 47/48；该母本和断言都保留，需未来另案授权，不称全量全绿。

有生产 picker 原始分布、OFF/ON Prompt、单面逐字节 ledger、存储故障注入、缓存图和保护源码 hash 证据。打包 CRC、最终 SHA、逐文件清单和全新解压复测结果以本轮外附验证报告/证据包为准。

已有 sanitizer 内联 foreignObject/部分内部 owner-like 属性保留是原有策略差异，未在本轮更改，也不无证据宣称可利用或已修复。隔离页只验证有限 SVG/控件样本；自动化 Space 未触发 checkbox 切换，真实键盘可达性待验收。UI 设计检查使新控件沿用可点击原生 label，不增加面板层级。

仅完成源码、自动化测试与随机分布模拟验证，尚未完成真实 SillyTavern、真实模型网络及手机实机验证。美化效果、多样性交付质量、手机卡顿/白屏/发送箭头、真实模型列表/网络、并发与历史恢复仍需实机验收，不能宣称彻底解决或兼容无误。
