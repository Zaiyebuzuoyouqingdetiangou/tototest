# RabbitMirror／兔子镜现行需求与开发规则（CURRENT）

更新：2026-09-05。当前测试候选：1.5.18 Audit1C2；manifest/runtime 为 `1.5.18`，主 cache cohort 为 `1.5.18-audit1c2`。本文是本包唯一 CURRENT；旧 README／CHANGELOG 历史段落和 `docs/multiface-phase2-design.md` 的早期方案不代替实际源码。此为自动化验证后的测试候选，不是已完成真实宿主/模型/iPhone 验收的正式版。

## 基线与授权

本轮唯一源码基线为上传的 `RabbitMirror-1.5.17-BannedWordsRegex1.zip`，SHA-256 `f76b795d80429a4a428f1a82ee8751be18a2d2b34b770ed698cd8f0360991f77`。1.5.16 仅作只读比较，不作为修改起点。输入包未覆盖；GitHub 保持只读，本轮未 commit、push、创建 branch／PR，也未写入正式或测试仓库。

本轮先独立审计，再窄修：禁词标题比较/快照恢复/安全赋值、跟随每面质量与最终 DOM 扫描、CSS/ID 隔离、独立多面重复 TOTO 包装、SSE delta 保真、精确终止错误与 Regex 能力失败处理。A/B/C 闭环后才接入外部世界书 1C-2：冻结一次抽签→按选中 ID 一次预取→同步渲染；未改全栈 async、未放宽 sanitizer、未增加自动模型请求。

## 精确终止错误与无正文诊断

- 独立 API 已跨过单次付费请求边界后，若空流、多面解析、净化、质量门或其他后处理失败，必须保留当前 chat／mesid／Swipe／sourceHash 下的精确错误；后续被动同步不得用通用“正文变化”提示覆盖。
- 只有明确的新 Swipe、重说、继续、编辑或其他可靠正文替换证据成立时，才允许说明“正文随后又发生了变化”。没有精确错误且没有替换证据时，只能诚实说明本轮已请求但未形成可恢复完整成品。
- 上述保留机制只复挂同一精确身份的 error host；不得跨聊天、消息、Swipe 或 sourceHash 恢复旧错误，也不得因此发第二次请求。
- 最近请求诊断应记录不含正文的 chat key 摘要、mesid、Swipe、sourceHash、operation epoch、requestCount、terminal stage／code 和失败面序号；不得保存聊天正文、Prompt、API Key、响应正文、reasoning 或世界书正文。
- 本轮不改变多面“任一面不合格则整批不保存”的既有语义；部分批次保存仍需另行设计和授权。
- 独立 API 单面与多面质量门现在都从结构化展现形式索引取得 `{id,title,summary,tags}`；summary 只用于判断当前媒介是否原生需要页签／翻页／频道等结构，不注入新 Prompt，也不放宽 sanitizer。真正与媒介无关的通用三按钮＋平铺文字流仍会被拒绝。
- 跟随与独立均以净化且过滤后的最终可见 HTML 进行质量/视觉检查。原始 owner/hash 与过滤后的显示标题分开验证；独立多面每面只保留一层规范 TOTO，整批再验 exact 协议。旧历史缺少精确展现形式证据时推迟不确定恢复，不能伪造 recipe 或恢复已被拒绝的原始内容。
- 多面后处理错误使用精确 code／face 记录：缺面保持 `multiface-incomplete`，重复正文、空面、净化后空面、视觉程序失败和具体质量 code 不再统一误标为 `multiface-quality`；失败仍不会自动补发。

## 1～5 面生成

- `rabbitMirrorFaceCount` 严格规范化为 1～5，缺失、非有限值、小数和越界值回落 1。旧安装没有字段时保持单面；UI 关闭“多面兔子镜”即 1 面，开启后可选 2、3、4 或 5 面。
- 控件集中在“高级设置 → 生成与抽取”，对跟随当前 API 与独立 API 同时生效。
- 一轮只建立一份共享 Prompt、一个 owner／intent 和一次请求租约。多面不会按 face 调用 API，不会后台补面，不会因解析、净化、挂载或质量失败自动重试／换模型。
- 独立 API 的单面与 2～5 面共用同一个规范执行锁标签；安全检查要求锁唯一、有序、完整闭合且正文行非空，不接受跨消息拼接，任何失败都发生在网络发送和单次付费 lease 消费之前。
- 抽签先冻结一次带 chat、mesid、swipe、sourceHash、设置与指令指纹的批次计划。第 1 面按既有随机规则抽取；第 2 面避开第 1 面已经随机抽中的精确主题／展现形式；第 N 面避开此前 1～N-1 面的精确随机命中。明确点菜、固定动态视觉与小池回退仍按原有规则，不用伪随机轮播替代。
- 每面收到同一份全局安全、兔子洞、美化和预算规则，只追加自己的抽签材料与差异要求；不得把整份基础 Prompt 复制 N 次。面数越多，输出长度、生成时间和实际模型费用可能增加，但网络请求次数仍为一。
- 输出必须正好含 N 个平级、完整、互不嵌套的 `<toto data-rm-face="1..N"><details>…</details></toto>`。每个 `<toto>` 只能有一个直接 `<details>` 和一个直接 `<summary>`；禁止把多面塞入同一个 `<toto>` 或 `<details>`，也禁止跨面闭合、额外面、缺面、重复编号和重复标题。
- 每面必须独立兑现自己的标题、内容、主题／形式和 UI 构思；同批先冻结不同亮度、色系、材质、外轮廓、阅读路径和交互家族，除内容全部硬性要求黑暗外至少一面使用明亮或中高明度视觉。不能只换标题／颜色、复用三按钮切页或统一退化成深黑矩形系统卡。真实美学差异仍需模型／实机验收，静态测试不冒充真实输出质量。

## 两种 API 路线与生命周期

- 跟随当前 API：仍只用主回复原本的一次生成；生成拦截器注入共享多面 Prompt，正文完成后按同一 owner 解析 N 面、逐面离线净化、整批终检和一次提交。
- 独立 API：仍只从当前目标消息的完整最终正文构造一次副 API 请求；同一个 Response 兼容 SSE、NDJSON 和非流式，DeepSeek `reasoning_content`／thought 不进入兔子镜正文。
- 显式 `delta.content` 原样累加，包括首尾空白与重复片段；非 delta snapshot 保留既有快照合并语义，不将流式重复字符误删。
- 独立成品在响应结束后先做总协议与总预算检查，再逐面离线净化、质量门、身份终检和聚合提交；不会逐 token 挂载半成品。
- 轻量桥在正文 START 时只记录 owner，不加载约 2 MiB 的重运行图；重模块只在准确完成／终止证据后以 120ms 合并唤醒。流式正文期间跟随外置与独立模式都跳过逐 token 的重 DOM 同步。
- 最终正文的 `completedAt`、正文 hash 和 revision 会被冷启动恢复复用；已满足稳定窗口时只做一次约 120ms 的精确复核，不重新叠加旧的 1.6～4 秒退避。
- 一次生成成功被接受后，即使缓存写入或 DOM 后置复核短暂未命中，也只警告并安排被动同步，不把成品反报失败、不清空已生成 UI、不自动再发请求。
- HTTP 200 若同时含 provider error envelope 与看似完整正文，优先按上游错误处理；错误正文不能绕过失败诊断。
- 第一条完成凭证尚待重运行图恢复时发送第二条，不得删除第一条的完成 intent；每条完成凭证只消费自己的目标，不清空同聊天其他已完成楼层。不同聊天、楼层、Swipe、sourceHash 和 operation epoch 隔离，迟到结果不能覆盖新正文或新 Swipe。
- 连接配置、上下文边界、批次计划或请求大小在发送前未通过时，诊断必须显示 `requestCount=0`／本轮未发送，并且不准备 nostream；只有真正跨过单次 lease 付费边界的断流才按网络／响应流失败显示。
- Connection Manager 流只对新增字符串做增量字节计数；未用于正文的隐藏非字符串状态每帧最多遍历 512 项、64 层、63 个字段，验证后不保留。过深、字段过多或持续膨胀会以 `response-boundary` 在单次已发送请求上安全停止，不伪装成网络断流、不准备 nostream，也不做随 token 数量增长的全量重复序列化。
- 跟随当前 API 的外置多面必须等每面净化 proof 与整批 commit 成功，再用精确消息身份触发一次外置同步；不依赖可能滞留的宿主 `isGenerating` 弱标志，也不把未净化半成品提前搬出正文。
- 用户主动重说某一面是一次新的、可能计费的明确操作；只替换目标 face，邻面 DOM 节点、打开状态、交互状态和工具不得整批重建。失败仍不自动重试。

## 每面 UI、维修与交互

- 每面都拥有自己的标题、内容、外框、维修兔、挨打猫、收藏／黑名单抽签记录及可信 `faceIndex`。工具只能作用于所在面，不能读取或改写邻面。
- 不由插件在作品底部注入通用“↶ 返回初始页”按钮；历史缓存里的遗留按钮也会移除。每个非终局第二状态都必须通过媒介内部自然对象或动作提供自然返回；继续／切换按媒介需要提供，不出现与作品割裂的万能重置按钮。
- 鼠标、触摸、键盘 Space／Enter 激活控件，以及方向键切换原生 radio 时，仍必须在状态改变前捕获当前面的初态；异常恢复继续由维修兔的“恢复交互初始状态”提供。
- 维修兔“回到交互前／返回修复前”继续使用当前面自己的有界快照；恢复后必须重绑当前面，不依赖另一个 face，也不以整批 `replaceChildren` 破坏邻面。
- 历史回载、折叠恢复、异常 DOM 归位、手机宽度救援及横竖屏重算必须遍历当前 host 的全部直接 face；不能只处理第一面或删除后续面。

## 增强视觉绘制与动态视觉

- “动态视觉场景”和“增强视觉绘制”相邻放在“生成与抽取”。解释保持简短：增强绘制加强画面细节、层次与互动，可与动态视觉同时开启。
- 两者可以叠加。动态视觉决定场景型／视觉型展现；增强绘制要求更清晰的主体与焦点、前中后景、材质接缝、光影、排版层级及可逆的内容／空间变化。叠加不会变成两次请求，也不强制每轮使用 SVG。
- 主要正文与交互反馈必须进入正常文档流并由内容撑高；按 360px 手机宽度检查字号、行高、换行和最后一行，禁止用固定高度、transform 或 `overflow:hidden/clip` 裁掉正文。
- 已完成、已展开的当前最新镜面会对每个 rendered face 在一帧内最多做一次有界高置信文字裁切检查（单批最多 5 次）：每面最多 800 节点／2,600 属性、12 个候选；只有文字真实越界且存在独立、简单、安全的裁切祖先时才自动解除裁切。`line-clamp`、省略号、低行高、控件、媒体、表格、跑马灯和可到达的揭示路径不自动改，交给维修兔判断；不扫描历史、不联网、不持久化。
- 动态场景每面最多一条明显且服务构图的主连续动画与一条可见的协同连续动画；禁止粒子群、大量重复动画节点或大面积 `blur/filter/backdrop-filter` 充当质感。折叠镜面（包括伪元素）暂停内容动画，展开后恢复；系统减少动态效果时改用低负载静态呈现。
- 增强视觉默认关闭且只接受字面量 `true`。关闭时不注入增强视觉短规则；除本版本明确授权的自然返回与动态降负载全局替换外，其余基线字节保持不变。开启时只增加一份共享短规则，不按面复制，不改变 sanitizer 白名单。
- 12,000 字符聊天正文、20,000 字符上下文和 32,000 字符完整请求上限不变。增强规则及额外 face 材料会真实占用完整请求预算；不得少报或暗中突破上限。

## 塔罗实体牌图

- 格式 ID `5.3.1`，或明确出现“塔罗”“牌阵”“Tarot”“西方神秘学”时，启用塔罗实体图规则；泛称“神秘学”不得把东方神秘类主题误判为塔罗。
- 规则只允许兔子镜既有白名单 `https://gfx.tarot.com/images/site/decks/rider/full_size/0.jpg`～`77.jpg`，必须使用真实 `<img>` 且有可见中文 `alt`。CSS 假画、emoji、文字牌名或其他外链不算实体牌图。
- 跟随与独立 API 都在安全净化后复核上述条件；缺图、被净化、越界编号、错误域名或无中文 `alt` 均不得记为成功。失败不自动补请求。

## 母本单一内容源与打包前索引构建

- 运行时继续保留双库：`data/structured/*Index.js` 供 picker／精简 Prompt 快速读取；抽中编号后，均衡／完整模式再由 `rawSegmentLookup` 只读取该编号对应的完整母本。不会把整库发送给模型。
- 开发时完整文字只维护在 `data/raw/rawPresentationFormats.js` 与 `data/raw/rawThematicCategories.js`。`data/metadata/*IndexMetadata.json` 只保存无法从母本安全推导的 tags、旧标题 aliases、非标准 source 映射、缩进及少量人工确认的 compact `summaryOverride`。
- `scripts/build-library-indexes.mjs --check` 只在内存中确定性重建两份索引并逐字节比较，不修改文件；`--write` 会先完成两套母本与 metadata 全部校验，全部通过后才写入临时文件并替换过期索引；捕获到写入异常时恢复原文件，随后再次执行 check。
- 新增、删除、重复或错序 ID，未知 metadata 字段，source 映射错误，标题改名却未保留旧 alias，手工改写生成索引等情况必须失败并停止；构建失败不得留下半份索引。
- 带编号、粗体标题的母本条目正文当前必须保持单行。普通非空缩进续写会报告源文件、行号与最近条目并 fail-closed；`library:check`、`library:write` 和候选打包都不得继续。现有少量缩进的非编号子弹点是明确的 raw-only 补充语法，继续允许，并只在按编号读取完整母本时作为补充使用。
- `scripts/package-candidate.mjs` 在打包前依次执行：索引 write/check、完整测试、全部 JS/MJS 语法、确定性 ZIP、CRC、重解压后的索引／测试／语法复测，以及源码与成品逐文件 SHA-256 比较。
- 构建器只使用 Node／Python 标准库，不使用 AI、网络、DOM 或 SillyTavern API；不被任何运行时模块 import，不在进入酒馆、打开聊天或每轮生成时执行，因此不增加 Token、请求、Observer、轮询或手机主线程负担。
- 当前构建结果固定为 208 个展现形式与 165 个主题。1.5.10 已完成的 52 项展现形式同步与旧标题 aliases 全部保留；本轮另外将 B.3.3、B.7.4、B.7.5、C.1.6、C.2.2、G.4.7、G.7.19 七项主题 structured `raw` 指针同步到当前母本，同时保留原 compact `summaryOverride`。
- 结构化索引是构建产物，不再作为第二份人工内容源。新增母本仍需在 metadata 中明确登记其 tags／必要映射；脚本不得猜测语义、调用 AI 总结、改写母本或自动改变 group／权重。
- “不固定布局的媒介语义最低验收”本轮仍未实现。它是独立未来任务，只能检查最低可辨认媒介关系，不得生成 208 套固定 DOM 模板。

## 禁词表与不发送兔子镜正则一键配置

- 新增 `rabbitMirrorBannedWords` 本地禁词表，默认空数组；最多 256 条、单条最多 80 字符，保存时去空白、去重复。空列表严格短路，不遍历镜面 DOM，不增加 Prompt／Token。
- 禁词只作用于 RabbitMirror 自己的净化后可见 Text Node：匹配按字面量、大小写不敏感地删除；不修改酒馆正文、HTML 属性、class/id、style、CSS、SVG 属性、script/style/template 内容。单面跟随、跟随多面、独立 API、维修重解析都复用同一过滤边界；交互恢复中的安全文字赋值也会先通过同一禁词过滤，避免已删词被恢复。
- 独立 API 已净化 HTML 缓存键加入禁词表指纹；用户修改禁词后，不得命中旧禁词配置下的 prepared HTML 缓存。禁词表只影响显示成品，不进入模型 Prompt，不作为请求上下文，也不自动重试。
- 跟随当前 API 的“不发送兔子镜”Regex 仍使用既有推荐规则 `/<toto\b[^>]*>[\s\S]*?<\/toto>\s*/gi`，替换为空、placement=AI_OUTPUT、promptOnly=true。新增一键配置仅调用 SillyTavern Regex 自己导出的 global scripts 读取／保存能力，不写 scoped/preset，不覆盖用户其他规则。
- RabbitMirror 管理正则使用稳定 managed ID；重复点击幂等。已存在同指纹规则时不重复添加；managed ID 的旧版可更新；若发现同名但用户自行修改且不是 managed ID，则 fail-closed，不自动覆盖，并提示用户查看酒馆 Regex。
- 选择“跟随当前 API”时设置页显示正则状态和“一键配置正则／查看酒馆正则”；独立 API 明确提示不依赖此酒馆正则。若无法加载 Regex 功能，保留“复制推荐正则” fallback。自动打开 Regex 界面是辅助能力，失败不得回滚已经成功保存的正则。
- GLOBAL=0 为有效值；读取抛错、非数组或能力缺失不得保存未知 scope。Regex 被禁用时不得显示已生效，也不自动启用。宿主已打开的列表不保证立即刷新：保存与跳转解耦，不调用私有 `loadRegexScripts`，列表未更新时提示刷新页面。官方 1.14～1.18 已做可获得源码能力核对，1.13 未完成实机或可验证源码兼容证明；运行时仍按能力降级，不写版本白名单。

## 外部世界书母本导入（阶段 1C-2：选中材料接入，默认关闭）

- 1A／1B 已有能力继续保留：两个只读来源（SillyTavern 已有世界书／本地 JSON）、entry 级整本选择与筛选、纯本地分类建议、人工确认、独立 IndexedDB 事务保存以及本地启用／停用／删除管理。源世界书始终只读。
- 只有 `library.enabled=true`、`entry.enabled=true`、`userConfirmed=true` 且最终分类明确为 `theme` 或 `format` 的条目能够进入轻量外部池；mixed／auxiliary／ignore／pending／unknown 及停用库、停用条目全部排除。轻量池只保存 externalId／libraryId／classification，不保存 rawContent、summary、正文或关键词。
- 默认 `externalWorldBookRandomEnabled=false`，`externalWorldBookMixMode='builtin-only'`。通过单面、多面、跟随、独立、预算、missing 和身份竞态验证后，在“外部世界书母本”管理窗口开放“外部母本参与抽签”和来源偏好。旧 enabled=true + builtin-only 显示为关闭；用户开启时使用内置优先。不自动启用任何本地库，也不自动打开增强视觉。
- 无外部随机时必须严格短路到 1.5.15 原 picker：不读取 external snapshot、不进入来源选择、不调用额外 `randomUnit()`。固定 `Math.random`＋`crypto.getRandomValues` 时，1～5 面 ID 序列与随机调用次数必须逐轮等同 1.5.15 基线。
- 外部随机启用后的来源层分三步：① 每个 theme／format slot 独立决定 builtin 或 external；② 若为 external，按该类型当前 eligible 数量的 `sqrt(n)` 给外部库加权；③ 在被选中的外部库内均匀抽具体 externalId。theme 与 format 分别计算 eligible 数量，外部库总规模不能直接决定另一类型的权重。
- `sqrt(n)` 是库均匀与 entry 完全均匀之间的折中：例如 10 vs 1000 个 eligible 条目时，外部条件下库总机会约 1:10、单 entry 机会约 10:1；第一层 builtin/external 比例由 mix mode 独立控制，不随外部库数量或规模变化，也不使用轮播／每 N 轮强制外部。
- 单面和 2～5 面共用同一 `applyDirectiveOrRandom` 来源选择层；`planBatchFace` 继续沿既有 batchIdentity、pending、history 与 exact 排重语义，只额外把此前 face 已选 externalId 纳入批内硬排除。没有可靠 semantic family 的外部条目不伪造内置 group/family，不参与内置 eligible-miss／soft-pity 统计。
- `forceVisualScenery` 继续拥有 format 最高优先级：动态视觉开启时 format 固定内置 `10.2.2`，external format 不得覆盖；theme 仍可按来源规则抽取。`enhancedVisualDrawing` 默认 false、注入条件与 Prompt 位置不变，外部来源不会修改视觉开关。
- `planRabbitMirrorPromptDetails` 与 `renderRabbitMirrorPromptPlan` 保持同步；两种异步生成入口在中间按唯一 selected external IDs 调用 `getSelectedExternalEntries`。一次只读 IDB 事务使用唯一 `byExternalId` 索引逐项 get；跨面同 ID 去重，不按面读库，不全库 getAll，不重抽替代 missing。临时 Map 在 finally 清空，不能跨下一轮缓存 raw。
- 发送副本仅将实际抽中的 summary/raw 作为低优先级参考；转义保留标签、上下文/锁、宏与内部 data 标记，不执行外部 HTML/CSS/宏，不修改 IDB 原文。材料放在 RabbitMirror 自己的 Prompt，不混入独立 API 聊天 transcript；诊断不记录 raw。
- 外部材料复用原策略：compact summary170/raw0；balanced summary170、主题 raw 总360/单条180、形式总540/单条360；full summary210、主题总900/单条500、形式总1500/单条900。共享规则不复制 N 次，原完整请求上限不变。固定 selected IDs 时库总规模不进入 Prompt；全 builtin 则 external raw0、Prompt 增量0、随机额外调用0。
- async 预取后及付费 lease 消费前复核 chat、消息、Swipe、sourceHash、operation epoch 和 batch。missing、停用、未确认、分类变化与迟到结果发送前停止，requestCount=0，不自动重抽、改参数或请求。
- IDB v2 增加唯一 externalId 索引及轻量 poolMetadata；模块 import/启动不读 raw。开启外部抽签后的冷态按需恢复 ID-only metadata；旧库缺索引时需用户点击指定库的“重建抽签索引”，允许这一次用户操作读取该库，不能改成启动期自动全库扫描。停用旧库缺索引不阻塞其他已启用库；重复 externalId 升级失败保留旧数据。
- external pool singleton 的所有生产 import 必须使用同一 `?rmv=1.5.18-audit1c2` specifier。保存／启用／停用／删除本地库时同步其轻量 ID 快照；toggle/delete 不读取整库 raw。冷态 metadata 有有界 I/O 成本，不能声称开启状态总成本严格为零。
- 外部世界书导入与“独立 API 复用本轮已激活世界书上下文”继续完全解耦，不共用状态、缓存或设置。

## 随机、库与其他保护边界

- 1.5.6 的普通路线展现形式 group 冷却窄修继续保留：普通路线不承担 group 连带降权；最终主题明确 `if` tag 时保留原 group 系数。exact 尝试记录、正式 history、family／group、soft-pity、收藏倍率、黑名单和小池回退不因多面被重写。
- 多面只在同一批内排除前面已经随机抽中的精确项；除本轮已批准的构建工具与七项主题 raw 指针同步外，不修改候选池编号、专属权重、主题规则、成人虚构角色扮演边界或配色冷却。
- 不修改标签扫描／过滤：选中标签的标签本身和包裹内容只从发给副 API 的上下文副本删除，不改酒馆正文、主 API 或历史；最近 X 层、角色卡／Persona 默认开启兼容和世界书选择保持原规则。
- Token 卡分别保存跟随与独立两种来源的记录，再按当前生成方式读取；明确标注“跟随正文 API／独立 API”“最近／历史”和“Prompt 本地估算、非服务商账单”。独立路线显示的是 system＋user 请求消息内容字符合计；跟随路线显示兔子镜待注入／追加 Prompt，不冒充主请求完整 Token。
- 单次付费 lease、当前最终正文读取、Swipe／重说／聊天切换隔离、SSE／NDJSON／非流式、DeepSeek reasoning 排除、Touch Theater 与安全净化边界保持不变。

## 性能、缓存与发布

- 多面逻辑只在一次生成生命周期内按面数做有界 O(N) 解析、净化和局部工具安装；N 最大为 5。不得新增常驻轮询、无界 Observer、额外网络请求或全聊天扫描。
- 跟随模式不新增独立模型请求，但会增加主请求 Prompt／输出；独立模式在正文请求后再发一次兔子镜请求，1～5 面仍共享这一次且不自动重发。首次未缓存的动态模块会产生同源 GET；是否影响真实家庭网络只能用目标设备 HAR／服务端日志验证，静态测试不得声称“完全不占网”。
- 新增运行时工作均有严格上限：每个完成 owner 一次合并唤醒、每个 follow 批次一次精确 commit 事件、当前最新宿主中每个 face 一帧裁切检查，以及 Connection Manager 每帧固定上限的隐藏状态验证；不新增 `setInterval`、常驻轮询、第二个 MutationObserver 或后台模型请求。
- 1.5.18 主 cache cohort 为 `1.5.18-audit1c2`。导入/分类管理仍在用户点击后加载；外部 raw 读取只在抽签计划已冻结且确实选中外部 ID 时发生。启动轻桥不增加 raw、Regex 或禁词全聊天扫描；无新常驻 Observer/轮询。更新后必须整页刷新酒馆；不要以清空设置／冷却历史代替刷新。
- 正式仓库默认只读。本包是测试候选，只有用户明确实机验收并当轮授权仓库、分支和写入类型后才可晋升；正式交付名仍使用“兔子镜小剧场”。

## 本轮验证边界

- 1.5.17 基线重新执行 223/223，1.5.16 只读比较重新执行 216/216；不沿用旧报告。最终源码测试、突变、浏览器矩阵、文件清单、逐文件 SHA 与重复封包 SHA 以随包交付的审计报告为准。
- 当前机制已有 Node 契约测试与隔离 Edge 的真实生产 DOM/IndexedDB 接入测试；模型及宿主接口使用原创 synthetic fixture/底层 transport 替身。内置 Prompt/lock/随机 90 项字节对照、外部 5000 条按 selected IDs 读取、源码 import 闭包、母本重建与语法均独立核查。
- 部分成功仅设计未实现；all-or-nothing 继续保留。模型审美、真实通过率、长聊天白屏/流式卡顿、家用网络与手机发热不由 synthetic 成功作保证。
- 仅完成源码／自动化／synthetic验证，尚未完成真实 SillyTavern、真实模型网络及 iPhone Safari 实机验证。
