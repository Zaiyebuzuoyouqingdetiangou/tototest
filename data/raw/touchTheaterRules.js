export const TOUCH_THEATER_RULES = String.raw`
【大接近模式 / 大接近モード 专用规则】
仅当本轮展现形式明确抽中或点名“6.2.1.1.e 大接近模式 / 大接近モード”时启用。

定位：
- 这是《心跳回忆 GS》系“大接近”触摸体验在 RabbitMirror 中的独立展现形式，不是普通按钮菜单、身体信息卡或九宫格换皮。
- 视觉中心必须是当前 {{char}} 的近距离人物舞台；人物应占据主要视觉面积，触摸热点直接覆盖在人物对应部位上。
- 若没有真实角色图片资源，用纯 CSS 人物剪影、局部近景、姿态线稿、头像／半身构图或抽象人形承载热点；禁止编造不存在的外部图片 URL，也不要输出 Base64 假立绘。
- 参考纯卡母本的九区语义：head / face / shoulder / chest / arm / hand / waist / thigh / knee。根据当前姿态实际可见范围选择 5～9 个，不可见的部位不要硬塞。
- 每个热点都要预先生成一个独立反应，内容结合当前剧情、地点、关系与 {{char}} 性格；不得九项套同一句式，也不得把触摸擅自写成已经发生在正文中的既成事实。
- chest / waist / thigh 只在角色明确为成年人且当前关系、情境允许时作为亲密触摸热点；年龄不明或未成年角色只使用 head / face / shoulder / arm / hand 等日常安全接触。

稳定 DOM 契约：
- 新版大接近舞台根节点必须写 data-rm-dai-sekkin-mode="true"。
- 每个可触摸入口必须使用独立 <label> 并写 data-rm-touch-zone="语义ID"；新输出语义 ID 只使用：head / face / shoulder / chest / arm / hand / waist / thigh / knee。
- 每个 label 必须通过 for 关联一个独立 input[type="radio"] 或 input[type="checkbox"]；input 与 label 分离书写，不把 input 嵌套进 label，以减少净化、scoping 与维修兔重写后的兼容风险。
- 同一舞台优先使用同组 radio 作为“当前触摸部位”互斥状态；input:checked + CSS 控制对应 reaction 面板。基础交互必须纯 HTML/CSS 可用，禁止 onclick、onpointer*、onmouseover、<script>、javascript: 或要求执行任意 STscript。
- 每个 reaction 必须明确表现“刚刚触摸了哪里 + {{char}} 当下反应”；可以有短促表情、动作、呼吸变化或一句台词，但不能伪造跨消息持久好感度、累计触摸次数、已保存解锁状态或点击后现场生成的新剧情。
- 切换到其它热点时上一反应应自然关闭；不得让所有 reaction 初始同时展开，也不得第一次点击后永久锁死舞台。

移动端与视觉：
- 热点实际可点尺寸至少约 44×44 CSS px；即使热点透明，也必须有 checked/focus 可见反馈，不能只靠 hover。
- 点击／选中反馈可以使用短促扩散光圈、闪光、心形粒子、局部高亮或轻微位移；禁止无限动画和覆盖正文的大面积特效。
- 人物近景、热点与 reaction 都要自适配当前兔子镜容器；不得以固定桌面宽度撑出手机横向滚动。
- 作者明确设计的窄相框／手机框／相纸可以保留，不要无条件 width:100vw。

Live2D 可选增强：
- data-rm-touch-zone 同时是 RabbitMirror Live2D 桥的语义入口。模型只输出上述语义 zone，不输出模型路径、motion 名、expression 名、slash command 或消息发送指令。
- Live2D 不存在、未启用、当前角色未绑定模型、模型未加载或找不到匹配 hit area 时，大接近模式的 HTML/CSS 触摸仍必须完整可用。
- RabbitMirror 只允许复用用户本地 Live2D 配置中已经存在的 expression / motion 映射；忽略 hit-area message，不因触摸调用 generate()、发送 user message 或追加任何模型请求。
- 不同 Live2D 模型的 hit area 命名不统一，动画增强允许 fail-soft；不能为了“必须动起来”伪造模型动作名或扩大命令执行范围。
`;
