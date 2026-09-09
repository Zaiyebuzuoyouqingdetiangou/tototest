# 正文标签提前生成与连接错误

## 本次修复的范围

- 提前生成使用所选 Connection Profile 的一次请求和兔子镜自己的取消信号，不切换正文连接，不中止正文，不自动重发。
- 如果能确认正文使用 Profile A、兔子镜使用不同的 Profile B，而 B 没有保存 Secret 引用，也没有可解析的独立代理，提前请求在付费租约消费前停止。显示明确的本地绑定问题和 `requestCount=0`，不会误报为已请求的网络断流。插件不能替用户恢复缺失凭据，也不会读取或复制密钥。
- 这里只检查非敏感引用。存在 Secret ID 不等于凭据有效；同一 Profile、当前主 Profile 身份未知、普通正文完成后生成保持原行为，不凭猜测新增拦截。独立代理例外只适用于已核实使用代理凭据的宿主来源，并比较已保存代理的名称与 HTTP(S) URL，不读取其密码；CUSTOM / OpenRouter 等不采用此代理凭据的来源不能用无关代理名绕过绑定检查。
- `API request failed` 本身无法判断失败原因。仅在宿主错误链存在明确 HTTP 状态或认证错误时给认证提示；单独出现 `secret` / `API key` 不再当成认证失败。明确限流或并发限制不建议通过关闭流式来试探。
- 外部诊断可在失败后打开，读取本页面会话最近最多 12 条传输标量回执。开始新性能诊断保留这些回执，手动“清空外部记录”清除它们。刷新页面后不保留这份会话回执。没有正文、模型名、密钥、聊天身份或用户世界书内容；不增加网络请求、存储、定时器或监听器。
- Connection Manager 没有公开原始 Response 时，HTTP / Content-Type / 字节数仍标为不可用；宿主明确报出的 HTTP 状态可以记录，未知信息不补成 200。HTTP 429 不足以区分频率、额度和并发。

## 官方接口依据（只读核对）

SillyTavern 1.18.0：

- [ConnectionManagerRequestService](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/extensions/shared.js#L382)：逐请求转交所选 Profile 的 Secret ID、端点、代理与独立 signal；不需要切换当前 Profile。其通用错误保留 `cause`。
- [ChatCompletionService](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/custom-request.js#L423)：请求级发送与取消，不使用主正文的全局生成锁。原始 HTTP 状态可能只出现在错误链。
- [SecretManager.readSecret](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/src/endpoints/secrets.js#L252)：没有 ID 时使用该类型的当前活动 Secret。因此缺少绑定的不同 Profile 不能等同于独立凭据。

## 验收边界

本地回归覆盖早发与主流并行、Profile B / signal 隔离、缺失与失效代理的发送前拒绝、同 Profile 与未知主身份兼容、认证/限流/并发/未知失败分类、诊断晚开启和手动清空、结果先后完成及用户取消的原有生命周期。没有向真实模型、用户云酒馆或手机发送测试请求。

用户提供的旧报告未记录 HTTP 状态和失败原因，不能据此证明其具体故障是密钥错误或并发限制。以上修复不声称已复现或排除了用户服务端的认证、网络与并发限制。
