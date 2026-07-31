## 1.1.0-beta.14.47-test
正文重说／Swipe 提交期间，“外置后内嵌”宿主不再放进 `.mes_text`，而是使用紧邻正文节点的专属 sibling anchor；旧缓存只有在正文指纹完全一致时才允许恢复。旧副 API 任务还会绑定逐消息修订号，正文变化后即使内容短暂切回也不能回写旧结果。


独立 API 每条消息/Swipe 现在只允许一个生成任务；流式阶段的早期渲染事件不会再启动副 API。旧任务若对应的正文已经变化，其结果会被丢弃，不会先显示 A 再被 B 覆盖。加载、成功与失败继续复用最初创建的同一个外置宿主，成功后不再重新插入或改变宿主位置。

### beta.14.23-test

独立 API 外置失败卡片的“重新生成／检测 API”在 iPhone/Safari 上改为按钮节点直接绑定；长度截断时会显示当前最大输出设置与提高建议。

## 独立 API 内置后端通道（beta.14.19-test）

独立 API 现直接复用 SillyTavern 自带的“Custom Chat Completions”后端路由。只需安装本前端扩展 ZIP，不再需要额外 Server Plugin、`enableServerPlugins` 或通用 `/proxy/`。模型列表、连接检测和正式生成均由 SillyTavern 服务器向目标 API 发起请求。

## 1.1.0-beta.14.22-test

- 独立 API 生成失败时，在同一个外置折叠兔子镜中显示“重新生成”和“检测 API”。
- “重新生成”按当前消息、当前 Swipe 和当前独立 API 设置原位重试，不新增第二个入口。
- “检测 API”同时检查模型列表与最小真实生成请求，并显示成功参数模式或具体失败阶段。
- 按钮仅在失败状态出现；加载中和成功状态不显示，不影响维修兔、挨打猫、自动巡逻、Prompt 或 Token。


## 1.1.0-beta.14.22-test

- 独立 API 开始请求时立即创建原生外置 `<details>`：`【兔子镜：正在生成中……】`。
- 占位标题从第一帧起同步安装维修兔与挨打猫，不再等待生成结束或 MutationObserver 后挂载。
- 生成成功时保留同一工具节点，并在同一消息级外置宿主内原位切换为实际兔子镜；失败时同一折叠节点原位显示错误。
- 生成期间点击维修兔或挨打猫只显示等待提示，不执行维修、自动巡逻或反馈提交。
- 不修改独立 API Prompt、美化母本、正文、Swipe、`display_text` 或 Token 逻辑。
> 测试版本：1.1.0-beta.14.47-test（恢复最初外置圆框；移除自动取色与整框染色）

# RabbitMirror 兔子镜 — Beta v1.1

> **源码可见，但不是开源软件（Source Available — Not Open Source）。**  
> 仅授权个人、非商业安装和使用。禁止二改、提取代码、制作衍生版本、转载、重新打包、镜像分发、整合到其他项目或商业使用。详见 [LICENSE](LICENSE)。

RabbitMirror 是一个用于 SillyTavern 的互动小剧场扩展。它会根据当前对话生成不同主题、展现形式和交互方式的“兔子镜”。

## 安装

1. 在 SillyTavern 的扩展管理中使用本仓库地址安装，或下载本版本 ZIP 后安装。
2. 安装完成后刷新 SillyTavern。
3. 打开扩展设置，确认“兔子镜自动注入”已启用。

更新前建议备份当前插件目录。卸载时删除 RabbitMirror 扩展目录；本地设置可在插件设置中重置。

## 主要功能

- 随机抽取主题与展现形式；没有点菜时，每次新的助手回复或重说都会本地重新抽取并避开近期刚出现的项目；
- 独立玩法型主题可被精确抽取、点菜与母本检索；主题先按父主题家族抽取，子项数量不会抬高整类概率；
- 用户指令优先：可以自由点菜自己喜欢的任意内容；仅捕获来源用户消息中的明确兔子镜／小剧场指令，母本库未收录也会现场构造；同一条用户消息反复重说时保持同一份点菜，新用户消息未点菜时不会继承；
- 三档 Prompt 长度选择；
- 随机发挥模式；
- 动态视觉场景；
- 共同回忆资料来源：可在需要时生成回忆杀；
- 挨打猫：用于纠正兔子镜的美化效果；
- 维修兔 v2.05-test：检查和修复显示、排版及交互问题；删除功能已移除，独立 API 重说与历史入口位于挨打猫；
- 测试功能“维修兔自动巡逻”：默认关闭；开启后只对后续新生成／重新生成的兔子镜执行一次高置信本地交互修复，布局与结构问题仍需手动确认；
- 每轮 RabbitMirror 注入字符数与 Token 估算；
- 手机 Safari / WebView 的交互、裁切与 3D 翻面兼容补救。

## Token 说明

RabbitMirror 在正式生成时会追加自身 Prompt，实际长度随抽取组合和设置变化，请以设置顶部“本轮 RabbitMirror 注入”的统计为准。

- Prompt 长度档位越完整，参考内容越多，Token 占用也越高；
- 共同回忆资料只在实际生成回忆杀时增加额外 Token；
- 挨打猫只在实际提交美化反馈时增加额外 Token；
- 维修兔、诊断、本地随机避重和点菜状态缓存不会增加模型 Token。

SillyTavern 的提示词拆分界面可能把同一份内容同时归类在“扩展程序”和“聊天记录”中，这不表示模型接收了两份。

## 维修兔边界

- 只修模型已经输出的 HTML、CSS 与现有交互结构；
- 可恢复“radio 控件在外、正文容器在内”导致原始 `:has(input:checked)` 永远无法命中的分支切换；
- 可恢复“透明 checkbox 无 label、背面仅依赖父容器 `:focus-within`”导致触屏翻面无法保持或关闭的问题；
- 可恢复宿主删除的精确 radio 取消程序：仅识别“把当前兔子镜内 radio 全部取消选中”的固定写法，不执行其他原始 JavaScript，也不影响其他消息或镜面；
- 触屏 Hover 只接管真实揭示隐藏正文、展开零尺寸内容、生成伪元素正文或 3D 翻面的规则；普通变色、阴影、缩放和平面位移保持为装饰效果；
- 不凭空补写不存在的剧情、答案或结果；
- 生成结束后会先验证兔子镜源码完整性；截断或空壳不会提交抽取历史，也不会消耗挨打猫反馈；
- 若同一次生成中曾出现过完整源码、随后被宿主显示链截断，维修兔可从浏览器会话内的临时快照恢复；
- 原始输出中途截断且本轮从未出现完整来源时，只能提示重新生成；
- 全链路控件验证使用隐藏隔离副本，不操作当前页面的真实控件；
- 完整诊断可能包含当前兔子镜正文，公开反馈前请先检查隐私。

## 隐私与数据

- RabbitMirror 不包含遥测，不主动向开发者上传聊天内容或使用数据；
- 设置、抽取冷却、挨打猫状态和 Token 数字记录保存在浏览器本地；
- Token 测算不保存完整 Prompt；
- 某些塔罗展现形式可能加载第三方牌面图片。

## 内容提醒

本扩展面向成年角色扮演用户。随机主题可能涉及成人、恐怖、支配关系、催眠、羞辱或强烈情绪内容，请根据自身接受范围使用。

## 已知限制

- 不同模型、SillyTavern 版本、浏览器和其他扩展组合可能产生差异；
- Token 数量是跨模型估算，字符数才是精确值；
- 浏览器自动检查不能完全代替真实 iPhone / WebView 真机验证。

## 反馈

请通过本仓库 Issues 反馈，并附 RabbitMirror 版本、SillyTavern 版本、设备、浏览器及已检查隐私的诊断文本。


## TEST：维修兔自动巡逻

本测试版新增默认关闭的“维修兔自动巡逻（测试）”。开启后只处理之后新生成或重新生成兔子镜中的高置信局部交互修复，每面只尝试一次。布局、结构、源码恢复与内容判断仍需手动点击维修兔。该设置与执行均为本地逻辑，不注入 Prompt、不增加模型 Token。

### TEST: RabbitMirror generation modes
This test build offers two mutually exclusive modes. “Follow current API” keeps the existing injection chain and can display the generated RabbitMirror inline or in a message-level external popup. “Use independent API” removes RabbitMirror prompt injection from the current API; after the assistant reply finishes, the configured OpenAI-compatible endpoint/model receives the available chat, reasoning, character, Persona and world/author-note context and generates the only RabbitMirror as an external popup. Independent requests are sent through SillyTavern’s built-in Custom Chat Completions backend, so no browser CORS access or additional server plugin is required.


## 独立 API 响应兼容（beta.14.5-test）
独立 API 支持常见 OpenAI 兼容、Responses、Gemini、Anthropic 及 SSE 返回结构；HTTP 成功但正文解析或兔子镜完整性失败时会显示具体阶段。


## beta.14.26 独立宿主隔离

独立 API 生成的兔子镜使用 `#chat` 下的消息级 sibling shell：每条助手消息／每个 Swipe 各自保留一个外部模块。它不嵌入正文、状态栏或其他插件容器；生成中、成功和失败只更新同一 shell 的内部内容。



## beta.14.32 Swipe／重新生成后的外置宿主重新锚定

- 独立 API 仍然只使用外置模式，不向正文插入第二份兔子镜。
- SillyTavern 替换整条消息 DOM 后，已有 shell 会重新定位到当前 `.mes` 之后。
- 仅当 shell 已跑到 owner 前方时移动，若它仍在 owner 后方则不争抢其他扩展的 sibling 顺序。
- 消息替换空档暂时隐藏 shell，正文落地后恢复；真正删除消息时清理孤儿 shell。
- 外置宽度、内部 CSS、自适配、Prompt 与 Token 均未改变。

## beta.14.31 独立外置最终净化与旧缓存迁移

- 独立 API 返回的完整 `<details>`、旧缓存以及页面上仍存在的旧外置 DOM，全部强制经过同一条最终净化链。
- 修复已经带逐镜 CSS 前缀的旧缓存中，损坏标签恢复后 class 仍未对应到前缀 selector 的问题。
- 外置结果会记录当前净化版本，升级后只迁移旧节点；同一 HTML 的重复重绘使用内存缓存，减少手机端开销。
- 不修改外置宽度、内置兔子镜自适配与生成 Prompt。

## beta.14.30 动画与交互命名隔离

- 每面兔子镜的 `@keyframes`、`@-webkit-keyframes`、`animation` 与 `animation-name` 在渲染时改写为逐镜唯一名称，避免后生成的外置兔子镜覆盖旧镜动画。
- 独立 API 外置兔子镜在挂载前自动隔离 checkbox/radio/SVG 等本地 ID，并同步 label、CSS、ARIA、href 与 url(#id) 引用，避免多条永久外置兔子镜之间串联。
- 修复 `<divclass>`、`<labelclass>`、`<labelfor>` 等标签名与首属性粘连，以及对应损坏闭标签。
- 外置宽度、内置自适配、Prompt、点菜、Token 与副 API 请求链不变。

## beta.14.29 跨设备外置宽度

独立 API 的外置 shell 仅按视口宽度适配：手机 84%（最大 620px）、平板 78%（最大 760px）、普通电脑 72%（最大 860px）、超宽屏 64%（最大 920px）。这些规则不命中内置兔子镜，也不覆盖兔子镜内部布局、自适配媒体查询或组件宽度。

## beta.14.28 外置宽度统一

独立 API 外置模块不再读取某条消息瞬时的 `.mes_text` 宽度。所有外置兔子镜使用稳定、居中的舒适宽度，避免同一设备上随机出现特别窄或特别宽的模块；生成中、成功和失败状态保持同一尺寸。

## beta.14.27 外置模块视觉回调

独立 API 兔子镜仍使用与消息结构隔离的 sibling shell，但外置宽度跟随对应消息正文区域，不再铺满聊天视口。shell 自身永久保留边框、圆角和背景，生成中、成功、失败及折叠状态不会退化成无边框标题。
