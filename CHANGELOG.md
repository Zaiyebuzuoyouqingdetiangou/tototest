## 1.1.0-beta.14.51-test — 旧外置缓存兼容恢复

- 修复 beta.14.49 的严格空壳检测在启动同步时误判并删除旧外置兔子镜缓存。
- 新结果继续严格拒收空壳；持久化旧结果改用宽松结构恢复，支持默认隐藏、交互后显示和嵌套容器型旧镜面。
- 兼容 beta.14.47 及更早版本的正文-only `sourceHash`，避免加入思维链指纹后把旧记录全部视为失配。
- 输出缓存已被 beta.14.49 移除时，按聊天／消息／Swipe／正文指纹从“兔子镜历史”恢复。
- 热更新前快照当前已挂载镜面，旧运行时清理后回填；普通同步不再破坏性删除无法确认的历史记录。
- 未修改新镜面空壳拦截、维修隔离、后台生成、配色冷却、Prompt、Token 或原始白色外置圆框。

## 1.1.0-beta.14.49-test — 副 API维修隔离、后台续跑与暗色冷却

- 副 API兔子镜的维修兔不再读取、重绘或写入 `mes`、`swipe`、`display_text`；强制维修只作用于当前镜面。
- 副 API成功结果必须包含真实可显示主体；只有标题或 CSS 的空壳直接判失败，不保存、不交给维修兔补写。
- 正文生成结束后立即在后台预启动副 API请求，实际显示仍等待正文＋思维链稳定；切回页面会自动同步与补挂载。
- 独立 API结果正式写入视觉签名／调色板历史，连续暗色时下一轮主动回避黑色、近黑色与透明主承载面。
- 加入明确的非透明主背景约束，不修改生成完成后的兔子镜内部 CSS，也不恢复外框自动染色。

## 1.1.0-beta.14.48-test — 状态机收口、挨打猫重说与可逆维修

- 挨打猫“重说／兔子镜历史”不再只依赖外置宿主层级：宿主与镜面写入稳定 owner 元数据，并通过当前运行时动作桥直接定位聊天、消息、Swipe 和记录 key；旧事件委托保留为回退。
- 独立 API 只在正文与可用思维链共同稳定 2.8 秒后生成；取消旧的 12 字门槛，短回复也能生成。
- 使用 AbortController 真正中止正文重说、Swipe、聊天切换、生成方式切换、API 设置变化、停用和热更新前的旧请求；旧任务无法回写新正文。
- 同一聊天、消息、Swipe、来源指纹只保留一个轮询、一个飞行任务和一个宿主；异步重新配置增加序列锁，避免并发安装两套宿主事件。
- MutationObserver 识别后来插入的旧版外置宿主并触发身份合并；纯外置与外置后内嵌只迁移同一 DOM。
- 维修兔“返回修复前”改为保存并换回原始 DOM 节点，保留原节点监听与运行状态；快照按聊天／消息／Swipe／外置 key 隔离并限量。
- 删除全局强制 summary 高度与 display 的“直线修复”样式；只在布局稳定后仍真实塌陷时从完整缓存重建当前镜面。
- 当前结果和历史按 UTF-8 实际字节预算裁剪；视觉扫描器、独立 API 与输出整理器的监听器／定时器均可在热更新时清理。
- 副 API 增加无 temperature 但保留最大输出的兼容档，并限制上下文总字符量。
- 失败卡片继续只显示失败原因；卡片内“重新生成／检测 API”及相关运行逻辑保持删除。
- 保留 beta.14.34 最初外置圆框，不恢复自动取色或整框染色。

## 1.1.0-beta.14.47-test

- 删除 beta.14.35-14.46 加入的背景色提取、整框染色、主题变量和主／副 API 自动补色逻辑。
- 独立 API 恢复 beta.14.34 最初的外置圆框样式；“外置后内嵌”恢复透明宿主，不再额外包一层染色框。
- 页面恢复时仅清理旧缓存遗留的 `data-rabbit-mirror-auto-frame*` 与 `--rm-auto-frame-*`，不修改兔子镜内部 HTML/CSS。
- 挨打猫重说与历史、单宿主模式切换、正文稳定生成、维修回退均保持不变。

## 1.1.0-beta.14.46-test
- 修复挨打猫“重说/兔子镜历史”误报当前兔子镜不支持：补齐宿主到消息索引的反查，并兼容纯外置、外置后内嵌与旧缓存迁移宿主。
- 重说仍仅作用于当前副 API 兔子镜，不修改正文。

## 1.1.0-beta.14.45-test

- 修复“纯外置”切换到“外置后内嵌”时复制第二个宿主：显示模式切换现在只迁移同一 DOM。
- 同一聊天、消息、Swipe、正文指纹的旧外置与内嵌宿主按身份合并，只保留一条完整结果。
- 显示模式切换不会重新请求副 API，也不会新增历史版本。

## 1.1.0-beta.14.44-test
- Added a cross-module/global in-flight lock keyed by chat, message, swipe and正文 fingerprint so duplicate trigger paths cannot start two independent RabbitMirror requests.
- Added DOM identity deduplication and startup recovery that keeps one newest valid host per reply.
- Added collapsed legacy-host recovery: invalid/empty ready shells are rebuilt from the saved complete HTML, preserving open state.

## 1.1.0-beta.14.43-test

- 修复正文重说时消息节点短暂消失导致稳定生成轮询直接退出、当前回复永远不再补生成兔子镜的问题。
- 稳定生成调度在 30 秒窗口内容忍消息替换，并在新正文重新出现后重新计算 2.6 秒安静窗口。
- source-aware 的 latest 调度统一走同一条可恢复轮询链，避免旧任务作废后没有新的入队机会。
- 不修改圆润染色框、挨打猫重说与历史、维修回退、Prompt 或 Token 逻辑。

## 1.1.0-beta.14.42-test
- Independent API generation now polls the selected reply source and requires a 2.6-second continuous stable window after regeneration events, preventing an early reasoning-pass RabbitMirror and a later duplicate.
- Maintenance Rabbit captures the current mirror DOM before a repair route changes it.
- Added “返回修复前” to Maintenance Rabbit; it restores only the current mirror and leaves chat text/history untouched.

## beta.14.40 — 正文重说提交锁与安全内嵌锚点

- 修复正文“重说”完成后，新正文与新兔子镜短暂出现、随后被旧 Swipe／旧缓存状态回写的问题。
- “外置后内嵌”的专属 anchor 从 `.mes_text` 内部迁移为紧邻 `.mes_text` 的消息级 sibling，保持原有视觉位置，但不再参与 SillyTavern 正文序列化、替换或提交。
- 独立兔子镜缓存恢复改为正文指纹严格匹配；正文变化后旧缓存立即失去回写资格。
- 副 API 任务新增逐消息修订号，旧请求即使在正文内容短暂往返时也不能落地覆盖新结果。
- 未修改正文内容、display_text、历史 Swipe、Prompt、Token、外置宽度、整框取色或挨打猫历史。

## beta.14.39 — 整框取色、挨打猫重说与逐回复历史

- 把插件原本的白色圆角框整体染成兔子镜自身背景色的柔和版本；保留圆角、留白、阴影及模型自带内框。
- 移除维修兔中的“强制删除兔子镜”。
- 独立 API 兔子镜的“重说”移入挨打猫菜单；重说前自动保存当前版本。
- 挨打猫菜单新增“兔子镜历史”，按聊天、消息与 Swipe 查看该回复下最多 10 个版本。
- 历史预览不替换当前兔子镜，不修改正文、display_text、Prompt 或 Token。

## beta.14.38 — 自动取色保守化与原框保护

- 修复自动取色覆盖模型原本深色／渐变标题栏的问题：外层 details 或 summary 已有明确背景、边框、阴影或文字设计时，完整保留原框，不再改成内层卡片的颜色。
- 普通默认外框只添加轻微标题色调与边线强调，不再重写标题文字颜色、外置 shell 背景或阴影。
- 取色只查看 details 自身与最外层视觉容器，不再深入扫描正文、反馈卡或第二状态，避免暖色内页把深色主框染成橙色。
- 无可靠背景色时保持原样，不再套用灰蓝兜底色。
- 未修改外置宽度、主／副 API 生成、Prompt、Token、正文、自适配或交互逻辑。

## beta.14.37 — 正文刷新后独立兔子镜同步再生成

- 修复“外置后内嵌”模式下，SillyTavern 刷新／重新生成正文后仍沿用旧副 API 兔子镜：成功记录新增正文指纹，生成结束、停止或 Swipe 完成时比对当前正文。
- 正文指纹改变时，旧缓存立即失效，并按新正文重新调用副 API；完成后仍按当前显示方式回到对应位置，不复制第二份。
- 副 API 请求进行中若正文再次变化，旧请求结果会被丢弃，并只为最新正文重新调度。
- 聊天首次打开与普通 DOM 重绘不会主动重生成旧兔子镜，避免升级后整段历史记录批量消耗 API。
- 未修改外置宽度、自动取色、Prompt、Token、正文、display_text、点菜或正 API 行为。

## beta.14.36 — 独立 API 失败按钮触控热修

- 修复 iPhone/Safari 独立 API 失败卡片“重新生成／检测 API”可见但点击无反应：在 window 捕获层优先接管两个专属动作，避开 document/chat 捕获链提前拦截。
- 保留按钮节点直接绑定作为兼容回退，并提高失败动作区点击层级与最小触控高度。
- 未修改自动取色、显示方式、外置宽度、Prompt、Token、正文或副 API 请求参数。

## beta.14.35 — 主／副 API 兔子镜外框自动取色

- 主 API 正文内兔子镜与独立 API 纯外置／外置后内嵌兔子镜，生成完成后均从自身主体背景一次性提取主题色。
- 只给最外层 details、summary 与独立外置 shell 写入边框／标题变量；不修改兔子镜内部卡片、媒体、动画、Grid、Flex 或媒体查询。
- 深浅背景自动选择标题文字对比色；透明或无法识别的背景使用稳定中性色。
- 取色仅在新镜面完成、旧缓存恢复或 Swipe 重绘后的首次安装执行，不持续监听动画。
- Prompt、Token、正文、display_text、点菜、副 API 请求与外置宽度均未修改。

## beta.14.34 — 移除标题栏重说入口

- 移除独立 API 兔子镜标题栏中的 `↻` 重说按钮。
- 升级后会清理旧缓存外置兔子镜中遗留的重说按钮。
- 失败卡片中的“重新生成 / 检测 API”继续保留。
- 纯外置 / 外置后内嵌、强制删除与默认最大输出 12000 均保持不变。

## beta.14.33 — 独立显示双模式、重说与强制删除

- 独立 API 显示方式新增：① 纯外置；② 外置后内嵌。
- 标题工具栏新增 ↻ 重说；只重新生成当前兔子镜，不重说正 API 正文。
- 维修兔菜单新增“强制删除兔子镜”；独立 API 会同时写入当前消息/Swipe 删除标记，避免重绘后恢复。
- 独立 API 默认最大输出改为 12000；已有用户手动设置不强制覆盖。
- 未修改 Prompt、美化母本、点菜、Token、正文、display_text 与历史 Swipe。

# RabbitMirror 1.1.0-beta.14.35-test

- 修复 SillyTavern Swipe／“重新生成”替换整条 `.mes` 后，独立外置 shell 停留在旧 DOM 槽位、视觉上跑到新正文上方的问题。
- 外置 shell 仍只绑定 `chatId + mesid + swipeId`，不新建内置副本；当前 owner 节点被替换后，只在 shell 位于新 owner 之前时重新锚定到正文之后。
- 消息替换的短暂空档会隐藏旧 shell；新正文出现后恢复，若消息确实被删除则延迟清理孤儿 shell。
- `MESSAGE_SWIPED`、生成结束／停止事件会同步触发宿主重新锚定；不修改正文、外置宽度、Prompt、Token 或兔子镜内部自适配。

# RabbitMirror 1.1.0-beta.14.31-test

- 修复独立 API 外置结果的最终净化入口：完整 `<details>` 不再依赖“作品长度/标签数量”启发式判断，成功结果、旧缓存和现存外置 DOM 都会强制经过逐镜 class、keyframe 与损坏标签清理。
- 修复“CSS 已有逐镜前缀，但 `<divclass=...>` 修复后仍保留原始 class”问题：为当前 scope 的旧前缀 class 建立后缀别名，恢复对应样式。
- 为外置结果写入净化版本标记；升级后会重新整理旧 beta.14.29/14.30 DOM，保留展开状态与维修兔、挨打猫节点。
- 增加已净化 HTML 的小型内存缓存，避免同一条长兔子镜在酒馆重绘时重复执行整套字符串清理。
- 外置宽度、内置自适配、Prompt、美化母本、点菜、Token、副 API 请求与自动维修业务规则未修改。

# RabbitMirror 1.1.0-beta.14.30-test

## beta.14.30 — 动画、交互 ID 与损坏标签隔离

- 为每面兔子镜生成逐镜唯一的 keyframe 名称，并同步改写 style 块与 inline style 的 animation 引用，阻断多条永久外置兔子镜之间的全局动画名覆盖。
- 独立 API 结果在进入外置宿主前执行纯结构 ID 隔离，不启动额外交互兜底；同步 label、CSS、ARIA、href、SVG url(#id) 与 radio name。
- 增加通用的首属性粘连标签修复，覆盖 `<divclass>`、`<labelclass>`、`<labelfor>` 等及其损坏闭标签。
- 外置宿主宽度、内置模式、Prompt、Token、点菜和 API 请求策略未改。

## beta.14.29 — 外置宿主跨设备宽度适配

- 仅调整独立 API 外置宿主的视口宽度：手机保持 beta.14.28 的舒适宽度，平板、普通电脑与超宽屏分别使用独立比例和最大宽度封顶。
- 所有新规则只命中 `data-rm-source="independent"` 的外置 shell，不命中内置兔子镜、跟随当前 API 模式、`.mes_text` 或兔子镜内部生成内容。
- 未新增对子元素、媒体、Grid/Flex 或兔子镜内部 `max-width` 的覆盖；原有自适配继续由每面兔子镜自己的 CSS 决定。

## beta.14.28 — 稳定舒适宽度与内外一致性热修

- 撤销 beta.14.27 对每条 `.mes_text` 实时宽度的复制；该宽度会在手机渲染、状态栏或其他扩展插入时短暂缩窄，导致同一套兔子镜随机出现窄版。
- 独立 API 外置宿主统一采用稳定的聊天区相对宽度：手机目标约 84%，居中，最大 620px；窄屏自动保留安全边距。
- loading／ready／error 共用同一宽度，不再因生成内容、消息状态或横竖屏变化重新取样。
- 外置 `<details>` 的直接内容限制在宿主内，但不改变兔子镜自身的布局、比例、交互和美化规则。
- 仍保持 message-sibling 隔离、永久边框以及每消息／每 Swipe 唯一外置宿主。


- 保留 beta.14.26 的 message-sibling 隔离宿主，但外置模块宽度改为跟随所属消息的 `.mes_text` 实际矩形，恢复此前舒适的左右留白，不再铺满整个 `#chat`。
- 外置 shell 自身提供持续存在的边框、圆角与背景；loading、ready、error 以及折叠／展开状态均使用同一有框模块，不再在生成完成后退化为无边框标题。
- 生成结果、Prompt、美化母本、点菜、Token、自动维修业务规则和 `userRequestOverrideRules.js` 未修改。

# RabbitMirror 1.1.0-beta.14.26-test

- 独立 API 兔子镜改为 `#chat` 下、整条消息之后的专属 sibling shell，不再挂入 `.mes_text`、状态栏或其他插件容器。
- loading、ready、error 始终复用同一 shell；完成态只替换 shell 内部内容，不再重排宿主。
- shell 绑定 chat / mesid / swipe，并由消息级查询恢复；新消息与其他插件插入节点不会删除或搬动旧 shell。
- 维修兔、挨打猫与诊断链可通过 shell owner 元数据定位原消息，不依赖 `closest(.mes)`。
- 外置 shell 全宽、无额外 padding/max-width，并使用 RabbitMirror 专属命名空间和 `isolation:isolate`，降低与其他插件样式及 DOM 管理冲突。

## 1.1.0-beta.14.25-test
- 独立 API 每条助手消息/Swipe 使用稳定槽位保存，外置宿主不会因正文哈希或后续消息变化丢失。
- 独立结果只保留在消息级外置宿主，并在宿主被酒馆重绘移动时恢复到正文后、状态栏前。
- 外置宿主与消息正文同宽，不增加横向 padding 或 max-width。
- 修复模型常见的 `<labelfor>` 等丢空格标签，并将 label[for] 重映射到隔离后的真实控件 ID。

# 1.1.0-beta.14.25-test

- 独立 API 去重键改为“聊天 + 消息序号 + Swipe”，同一条消息/Swipe 同时只允许一个生成任务。
- `MESSAGE_RECEIVED`、`CHARACTER_MESSAGE_RENDERED`、`MESSAGE_UPDATED` 仅刷新已有外置 UI，不再启动副 API；只在生成结束、停止、Swipe 或聊天载入后的稳定阶段启动。
- 请求完成前若正文或 Swipe 已变化，旧结果会被判定为过期并丢弃，不会先显示 A 再被 B 覆盖。
- 加载、成功、失败继续复用最初建立的同一个外置宿主；宿主一旦连接后不再因 ready/error/tool 更新重新插入，避免成功后改变到状态栏下方。
- 不修改 Prompt、美化母本、点菜、Token、自动维修、副 API 参数或正式版。

# 1.1.0-beta.14.23-test

- 修复 iPhone/Safari 外置失败卡片“重新生成”“检测 API”可见但点击无反应：按钮节点直接绑定 pointerup + click，不再依赖 window/document 捕获委托。
- 长度截断错误会显示当前最大输出值；低于 8192 时给出明确提高建议。
- 不修改 Prompt、美化母本、点菜、Token、自动维修或副 API 请求参数策略。

## 1.1.0-beta.14.22-test

- 独立 API 生成改为流式优先，避免长时间无首字节导致反向代理 HTTP 524。
- API 检测使用 32 Token 极小请求，降低等待时间与消耗。
- 524/HTML 网关错误不再整页显示，改为明确的超时摘要。

## 1.1.0-beta.14.22-test

- 修复独立 API 失败弹窗中“检测 API／重新生成”在手机端点击无反应。
- 失败操作委托从 document 捕获层提升到 window 捕获层，先于维修兔／挨打猫的文档级拦截处理。
- 不改变独立 API 请求、Prompt、外置宿主或自动维修逻辑。

# 1.1.0-beta.14.22-test

- 修复手机端高频循环：聊天工具观察器仅监听结构插入，不再监听 class/style/hidden/characterData。
- 外置兔子镜内部 DOM 与工具节点变化不再触发维修兔/挨打猫重新扫描。
- 独立 API 观察器忽略移除节点与自身外置宿主变化，避免宿主校正与工具安装互相触发。
- 宿主事件引起的全聊天工具扫描合并为单次 180ms 去抖。

## 1.1.0-beta.14.22-test

- 撤销必须额外安装 RabbitMirror Server Plugin 的方案。
- 模型列表、测试连接、失败检测、重新生成和正式生成统一复用 SillyTavern 内置 `/api/backends/chat-completions/status` 与 `/api/backends/chat-completions/generate`。
- 副 API Key 通过 Custom Chat Completions 的自定义请求头传递；不修改酒馆当前主 API 设置，也不写入 SillyTavern secrets。
- 不使用浏览器跨域直连、通用 `/proxy/` 或 `enableServerPlugins`，只安装一个前端 ZIP 即可。
- 保留 beta.14.18 的外置宿主锁定、自动维修状态保持、维修兔与挨打猫逻辑。

## 1.1.0-beta.14.22-test

- 独立 API 的加载、成功与失败状态现在始终锁定在同一个消息级外置宿主中。
- 成功内容只替换外置宿主内部的 details；即使酒馆重绘或其他扫描器尝试移动节点，也会按所有权标记恢复到 `.mes_text` 外侧。
- 不改独立 API 服务端桥接、Prompt、点菜、Token、维修兔或挨打猫业务逻辑。

## 1.1.0-beta.14.22-test

- 独立 API 模型列表、连接检测与正式生成统一改走 RabbitMirror 服务端桥接插件。
- 不再依赖浏览器 CORS，也不再访问 SillyTavern 通用 `/proxy/`。
- 新增配套 `server-plugin-rabbitmirror-independent-api`，路由为 `/api/plugins/rabbitmirror-independent-api/fetch`。
- 服务端桥接插件缺失时给出明确安装提示，不再静默回退到错误连接方式。

# RabbitMirror Changelog

## 1.1.0-beta.14.22-test
- Independent API requests are now direct-only across model fetch, generation, retry and diagnostics.
- Removed every automatic SillyTavern `/proxy/` fallback that could trigger an HTTP Basic Auth credential dialog.
- Browser requests explicitly omit same-site credentials; direct CORS/TLS/network failures are reported without touching the protected Tavern route.

# 1.1.0-beta.14.22-test

- Fixed settings drawer stutter on mobile: removed automatic memory-provider scanning when the UI mounts or opens.
- Independent API fields no longer save the full extension settings object on every `input`/autofill event; text credentials save on change/blur and selectors/numbers save on change.
- Added layout/paint containment for settings sections and disabled the summary arrow transition on mobile.
- No generation, Prompt, picker, token, RabbitMirror output, independent API request, maintenance rabbit, or feedback cat behavior changed.

## 1.1.0-beta.14.22-test

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
