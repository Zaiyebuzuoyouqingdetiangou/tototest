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
- 维修兔 v1.71-test：检查和修复显示、排版及交互问题，包括原 CSS 引用唯一缺失 checked 控制类时的高置信恢复；
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
This test build offers two mutually exclusive modes. “Follow current API” keeps the existing injection chain and can display the generated RabbitMirror inline or in a message-level external popup. “Use independent API” removes RabbitMirror prompt injection from the current API; after the assistant reply finishes, the configured OpenAI-compatible endpoint/model receives the available chat, reasoning, character, Persona and world/author-note context and generates the only RabbitMirror as an external popup. A live independent endpoint must permit requests from the SillyTavern page (CORS or a same-origin proxy).


## 独立 API 响应兼容（beta.14.5-test）
独立 API 支持常见 OpenAI 兼容、Responses、Gemini、Anthropic 及 SSE 返回结构；HTTP 成功但正文解析或兔子镜完整性失败时会显示具体阶段。
