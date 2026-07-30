## 1.1.0-beta.14.14-test

- 模型列表拉取改为仅浏览器直连，不再在直连失败时自动访问 SillyTavern `/proxy/`。
- 避免启用酒馆访问认证时，点击“拉取模型”触发新的账号密码登录弹窗。
- 生成请求、参数兼容重试、失败重试与 API 检测链保持 beta.14.13-test 行为。

## 1.1.0-beta.14.13-test

- 独立 API 失败折叠页新增“重新生成”和“检测 API”按钮。
- 重新生成复用当前消息级外置宿主，并按当前消息与 Swipe 强制重新请求。
- API 检测先检查 `/models`，再发送一次极小真实生成请求，报告模型可见性、参数模式、代理路径与返回结果。
- 失败操作使用 document 捕获委托并在停用/热更新时解除，避免酒馆重绘后按钮失效或监听累积。

## 1.1.0-beta.14.13-test

- 独立 API 外置兔子镜从“生成中”阶段就使用完整原生折叠标题，并立即带有维修兔与挨打猫。
- 加载、成功、失败共用同一消息级外置宿主；成功更新时迁移并保留现有工具节点，避免按钮晚出现、闪动或重复挂载。
- 加载状态禁止自动巡逻；点击工具仅提示仍在生成。

# 1.1.0-beta.14.13-test

- 独立 API 请求不再只发送单条 system 消息。
- 新增 system+user、user-only 两类 Chat Completions 兼容请求。
- Chat Completions 均被参数错误拒绝时，继续尝试 Responses API。
- 成功的端点与消息格式仍按 API 地址+模型记忆。

# 1.1.0-beta.14.13-test

- 自动巡逻改为状态保持模式：不再安装会显隐正文的 focus-within / cross-parent / :has() 视觉桥接。
- 自动巡逻前后恢复 checkbox、radio 与 details 的原有 checked/open 状态，避免内容被提前展开或点击失效。
- 结构性高置信修复仍自动执行；视觉与第二层状态修复继续要求手动点击维修兔。

# 1.1.0-beta.14.13-test

- 独立 API 参数兼容重试：自动尝试 max_tokens / max_completion_tokens、去除 temperature/stream 与最小请求体，并按 API 地址+模型记住成功组合。
- 失败提示会列出已尝试的参数模式。

# 1.1.0-beta.14.13-test

- 外置兔子镜恢复为与正文内一致的原生 `<details><summary>【兔子镜：标题】</summary>` 折叠形态，仅改变挂载位置。
- 移除外置状态栏中的时间、角色信息、图标与二次开关，不再包裹额外主题 UI；兔子镜继续使用自身背景与配色。
- 外置运行时仅在“独立 API”或“跟随当前 API + 外置”模式下安装；正文内模式不安装聊天区观察器或宿主事件监听。
- MutationObserver 改为 120ms 去抖的消息级增量同步，忽略 RabbitMirror 自己新增的外置节点与工具入口，不再每次 DOM 变化扫描整段聊天。
- 宿主 eventSource 回调保存引用并在模式切换/停用/热更新时逐一解除；新增全局 cleanup，防止多版本热更新后监听累积。
- `syncMessages` 每轮只读取一次独立输出缓存；普通插件面板开关不再触发 RabbitMirror 全聊天重建。

## 1.1.0-beta.14.13-test

- 独立 API 外置兔子镜改为消息底部状态栏式折叠面板，不再使用右侧胶囊或全屏模态框。
- 修复入口同时绑定自身监听与 document 捕获委托导致一次点击被连续开关、表现为无法展开的问题。
- 状态栏和展开面板根据兔子镜实际背景色提取主题色，并自动选择可读前景色。
- API 地址输入允许数字 IP、端口和无协议地址；数字地址无协议时默认按 HTTP 处理。
- 浏览器直连因混合内容、CORS 或证书失败时，自动尝试 SillyTavern `/proxy/` 同源代理；代理不可用时显示具体配置提示。

## 1.1.0-beta.14.13-test
- 外置兔子镜入口改为每条消息/Swipe 单实例，修复生成中与成功入口重复堆叠。
- 外置入口改为完整构建后一次性插入，并清理同来源残留实例。
- 增加按钮自身点击监听与 document 捕获委托双保险，适配 SillyTavern 重绘/克隆。
- MutationObserver 改为微任务去抖并增加同步重入保护。

# 1.1.0-beta.14.13-test

- 修复独立 API 请求已成功但前端误判“兔子镜生成失败”的响应解析问题。
- 兼容 OpenAI content 字符串/数组、Responses output、Gemini candidates.parts、Anthropic content、SSE/NDJSON 与纯文本返回。
- 接受完整裸 `<details>` 兔子镜，不再强制服务商必须保留 `<toto>` 外壳。
- 对空正文、非完整兔子镜与输出截断分别显示更准确的失败原因和 finish_reason。

# RabbitMirror 1.1.0-beta.14.13-test

- 测试仓新增“维修兔自动巡逻（测试）”本地开关，默认关闭。
- 开启时只对之后新生成或重新生成的兔子镜自动尝试一次高置信安全修复。
- 自动范围仅包括局部 ID/radio 隔离、精确 radio 取消程序、唯一缺失 checked 控制类、无 label focus-within 持久桥接、局部 checked/:has 状态桥、WebKit 3D 前缀。
- 手机排版、网格重排、静态内容改交互、源码恢复、内容猜测仍保持手动。
- 自动巡逻完全在本地运行，不增加 Prompt 或 Token。

# RabbitMirror 1.1.0-beta.14.2

- 修复模型在 CSS 中写出 `.trigger:checked`，却遗漏将该 class 放到唯一隐藏 checkbox/radio 上时，label 可勾选但前后层永远不切换的问题。
- 仅在原始源码可证明：缺失 class 唯一、候选控件唯一、控件已有 label，且补上 class 后至少一至两条局部 `:checked` 规则能命中有正文的状态层时恢复。
- 只给当前兔子镜中的对应控件补回模型已经引用的 class；不执行脚本、不创建新分支、不改写正文，也不影响其他镜面。
- 维修兔诊断新增“checked缺失控制类恢复”统计；Prompt、点菜、随机抽取、母本库、Token、挨打猫及工具入口稳定性逻辑未改。

# RabbitMirror 1.1.0-beta.14.1

- 正式仓库 SillyTavern 适配热修：维修兔与挨打猫改用独立工具入口容器，并以运行时内联 `!important` 样式隔离兔子镜自身的 `button`、`summary > *`、透明度、位移与裁切规则。
- 维修兔状态图标改为真实按钮文本，不再只依赖 `::before`，避免伪元素被宿主或局部 CSS 清除后入口看似消失。
- 新增聊天区捕获阶段事件委托；酒馆重绘、克隆或替换消息 DOM 后，即使节点属性被保留但原监听器丢失，两个入口仍可点击。
- 已存在的入口不再只做“存在即跳过”，每轮重挂载都会恢复容器位置、可见性、点击能力与当前版本。
- 观察器补充 `style` 节点、局部 class/style/hidden 变化及样式文本变化；兔子镜 CSS 晚于按钮到达时也会重新校正。
- 每面兔子镜的内部 details、维修兔、挨打猫安装分别隔离异常，一个复杂镜面失败不会阻断后续消息的入口安装。
- 不修改 Prompt、点菜、母本库、Token 统计、聊天原文、旧 Swipe 或 `display_text`。维修兔仍为手动模式。

## 1.1.0-beta.14 — 双列关系树手机保形

- 将“关系树／节点网络”从通用手机单列压缩中分离。
- 保留双列人物节点，并让展开详情在窄屏横跨两列，而不是把整棵关系图改成单列。
- 不再向关系树内部批量安装通用 fit/min/break-text 标记。
- 仅在两列网格、每列具有 label + checkbox/radio + 折叠详情，并存在关系/羁绊/节点语义时启用。

# Changelog

## 1.1.0-beta.14 — radio 取消程序局部恢复

- 修复宿主删除 `document.querySelectorAll('input[type=radio]').forEach(r => r.checked=false)` 后，恋爱游戏等 radio 分支只能进入结果、无法返回初始选项的问题。
- 只识别“固定选择器＋固定 `checked=false`”这一类安全程序；不执行任意原始 JavaScript，不把普通 label、按钮或其他脚本猜成取消操作。
- 原脚本的整页 `document` 作用域被收紧到当前兔子镜，取消时只复原本镜面的 radio 与已有 CSS 状态，不影响其他消息、旧 Swipe 或其他兔子镜。
- 取消操作会终止尚未完成的 label 状态校验，避免 0/70/240ms 的旧校验把刚取消的 radio 再次选中。
- 未修改 Prompt、点菜、随机抽取、母本库、挨打猫、Token 统计及其他维修路线；未点菜时不增加 Token。

## 1.1.0-beta.11 — 外置 checked CSS 回收与静态分段误修保护

- 修复宿主移除 `<toto>` 后，镜面作用域 `<style>` 留在 `<details>` 外侧时，控件 ID/label 已隔离但 `:checked` CSS 未同步，导致“生成报告／返回”按钮只切换 checkbox、内容区不变化的问题。
- 交互检测、checked 规则解析、3D/Touch Hover 等本地样式读取统一回收同一镜面 scope token 的外置样式，不跨镜面读取。
- 结构化静态分段急救新增明确交互意图门槛：普通漫画四格、通知卡、信息块不得被维修兔擅自改造成折叠控件。
- 升级后会撤回旧版本留在此类静态分段上的内部折叠标记与急救样式，不改原始正文和作者样式。

## 1.1.0-beta.10 — 触屏 Hover 仅接管真实第二状态

- 修复普通通知卡片的 `:hover { transform: translateX(...) }` 被错误安装为触屏持久状态，导致点击后卡片一直偏移的问题。
- 触屏 Hover 现在只接管真实揭示隐藏内容、从零尺寸展开、生成伪元素正文或执行 3D 翻面的规则；颜色、阴影、边框、平面位移、缩放等装饰 Hover 不再登记点击监听。
- 刷新扫描时会清除旧版误装的 `data-rm-touch-hover`、`data-rm-touch-hover-ready` 与对应救援 CSS；无合格候选时也会撤销当前根节点的触屏 Hover 标记。
- 真正的 Hover 第二层内容与 3D 翻面触屏兜底继续保留。
- 未修改 Prompt、主题库、展现形式库、点菜、每次重抽、挨打猫及其他维修路线；不增加模型 Token。

## 1.1.0-beta.9 — 无 label 的 focus-within 持久翻面恢复

- 修复透明 checkbox 没有 label、且背面只依赖父容器 `:focus-within` 显示时，在 iPhone Safari / WebView 中无法稳定翻面或再次关闭的问题。
- 仅在“透明绝对定位 checkbox＋同一局部容器＋原 CSS 明确揭示第二层正文”的高置信结构中建立持久状态桥接；普通焦点样式、按钮变色和静态 Hover 不接管。
- 第一次点击显示模型原有背面，第二次点击恢复正面；每张照片独立切换，并支持 Enter / 空格键。
- 原有 `:focus-within` CSS 会被等价映射到当前兔子镜内的本地状态属性，不执行模型脚本、不改写正文，也不补写不存在的内容。
- 维修兔诊断新增“无label focus-within持久桥接”统计，不再把这一结构误报为触屏 Hover 缺失。
- 未修改 Prompt、主题库、展现形式库、点菜、随机抽取、挨打猫及生成完整性逻辑；不增加模型 Token。

## 1.1.0-beta.8 — 生成完整性验收与本轮源码快照

- 生成结束后先检查兔子镜标题、正文主体、`details` 闭合及 CSS 结构；截断、空壳或样式中途结束不再视为成功输出。
- 不完整输出不会提交正式抽取历史，也不会消耗挨打猫反馈；无点菜时重说仍重新随机，有点菜时仍保持同一条用户消息的点菜组合。
- 在生成期间仅于浏览器 `sessionStorage` 保存当前消息、当前 swipe 的完整兔子镜临时快照；若完整源码后来被宿主显示链截断，维修兔可按同标题恢复。
- 所有来源都没有完整正文时，维修兔只显示不可恢复说明，并明确保持 `sourceRepair changed=false`，不再标记为已修复。
- 截断说明及其子节点不再进入“疑似隐藏内容”统计。
- 此功能全部在本地 JavaScript 中完成，不修改模型 Prompt，不增加 Token。

## 1.1.0-beta.7 — 维修兔跨容器 :has() 分支恢复

- 修复模型把 radio/checkbox 放在控制区，却把 `:has(input:checked)` 写在不包含控件的正文容器上，导致所有非默认正文永远透明的问题。
- 维修兔只在“控件明确位于 host 外、对应正文明确位于 host 内”的高置信结构中建立本地状态桥接；不执行脚本，也不补写不存在的剧情。
- 原始三组月相正文会随 radio 往返切换，不再被误判为“只有选中样式”，也不再生成虚假的缺失分支提示。
- 此路线由浏览器本地 JavaScript 与局部 CSS 完成，不修改模型 Prompt，不增加 Token。
- 未修改主题库、展现形式库、点菜逻辑、随机抽取、挨打猫或其他维修路线。

## 1.1.0-beta.6 — 维修兔静态 Hover 与隐藏候选误判修正

- 纯配色、阴影、边框和普通平面位移的 `onmouseover/onmouseout` 仅恢复桌面鼠标悬停，不再伪装成可点击按钮，也不会在触屏上形成持久选中状态。
- 只有明确揭示第二层内容或执行 3D 翻面的 Hover 才进入触屏交互急救。
- 全链路诊断不再用字符串片段判断透明度；`opacity:0.7`、`opacity:0.8` 等正常可见装饰不会再被列为“疑似隐藏内容”。
- 原始与渲染均没有 checkbox/radio 时，隔离副本验证显示“无需验证”，不再误报 `no-safe-candidate`。
- 未修改主题库、展现形式库、随机抽取、用户点菜、挨打猫或模型 Prompt。

## 1.1.0-beta.5 — 点菜同回复固定与非点菜每次重抽

- “用户指令优先”继续作为唯一总开关；未勾选时不识别点菜，勾选但没有明确点菜时不增加任何 Prompt。
- 同时识别“兔子镜”和“小剧场”的明确点菜句式；普通剧情中仅提到这些词不会误触发。
- 母本库外的点菜原文继续作为本轮最高优先要求直接注入，库内命中仅用于补充参考。
- 点菜按“聊天＋来源用户消息＋点菜内容”绑定：同一条用户消息下反复重说、重新生成或 Swipe，继续使用同一组主题、展现形式及随机补足项。
- 用户发送新的消息后，旧点菜自然失效；新消息没有点菜时恢复正常随机。
- 没有点菜时，每次新的助手生成或重说都会重新抽取，并在本地硬排除近期生成尝试中刚用过的主题与展现形式；不等待显示扫描完成。
- 同一次模型请求内部仍保留单次抽取缓存，避免 Prompt、母本检索与 Token 统计使用不同组合。
- 点菜缓存、生成尝试记录和避重判断均在浏览器本地完成，不新增模型 Prompt 或 Token。
- 更新内部缓存标识，避免覆盖安装后继续读取旧模块。

## 1.1.0-beta.4 — 本轮点菜强捕获

- 仅捕获带有“兔子镜／小剧场”明确点菜信号的指令区块，普通剧情发言和普通提及不会进入点菜 Prompt。
- 多行点菜原文完整写入本轮 Prompt，并设为最高优先；库内匹配只作为母本参考。
- 明确指定主题时不再随机补主题，明确指定展现形式时不再随机补形式；未分类自由点菜不会被随机主题或形式冲掉。
- 点菜不写入设置；新用户消息没有明确点菜时恢复正常随机。
- 更新内部缓存标识，避免覆盖安装后继续读取旧模块。

## 1.1.0-beta.3 — 用户自由点菜热修复

- “用户指令优先”开启时，母本库未收录的点菜内容不再丢失。
- 显式主题、显式展现形式与未分类点菜原文会直接写入本轮 Prompt，并高于随机抽取与母本补足。
- 自定义要求只作用于兔子镜内部，不反向改写主回复。
- 更新内部缓存标识，避免覆盖安装后继续读取旧模块。

## 1.1.0-beta.2 — Beta v1.1 索引整理版

- 重新整理结构化主题与展现形式索引顺序，使新增项目与母本库中的父子层级一致。
- 将 `11.2.1` 展现形式名称简化为“相册”，并同步结构化索引与母本库。
- 更新内部缓存标识，避免覆盖安装后继续读取旧索引。

## 1.1.0-beta.1 — Beta v1.1

- 将父主题中具有独立玩法、流程或执行要求的方向展开为正式子主题。
- 新增时间循环、身体互换、记忆丧失、每日新物种、荒野求生等可独立抽取与点菜的主题。
- 同步展开世界观、身份、种族、性转、关系、仪式与通灵类的明确独立方向。
- 普通情境修饰与仅用于举例的变体继续留在父主题内部，不机械拆分。
- 主题随机改为“先抽父主题家族，再抽家族内部项目”，避免子主题增多后抬高整类 IF 的总概率。
- 每轮仍只注入实际抽中的主题，母本检索预算与固定 Prompt 未增加。

## 1.0.0-beta.1 — Beta v1.0

- 发布 RabbitMirror Beta v1.0。
- 简化设置页说明，让功能和 Token 影响更容易理解。
- “发散孵化模式”更名为“随机发挥模式”。
- “Visual Scenery”显示名称改为“动态视觉场景”，不公开具体实现方式。
- “用户指令优先”改为自由点菜说明。
- 共同回忆、挨打猫与维修兔的 Token 说明改为用户可直接理解的文案。
- “小小维修兔”更名为“维修兔”。
- 从设置页移除重复的全链路诊断入口；维修兔菜单内的诊断功能继续保留。
- 生成 Prompt、母本预算和正常每轮注入逻辑均未增加。

## 1.1.0-beta.14.13-test
- Added mutually exclusive RabbitMirror generation modes: follow the current API, or use a separately configured OpenAI-compatible API/model.
- Independent mode clears the current-model RabbitMirror injection and automatically generates one message-level external RabbitMirror after an assistant response.
- Added model-list retrieval, connection testing, fixed model selection, temperature and maximum-output controls.
- Independent context bundle includes chat messages, available stored reasoning fields, character card, Persona, world-info/author-note and extension-prompt context when exposed by SillyTavern.
- Added external presentation for follow-current-API mode without rewriting stored chat message text.
- Preserved safe auto-patrol as an opt-in test feature.
