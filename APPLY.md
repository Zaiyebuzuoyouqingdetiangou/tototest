# RabbitMirror 1.4.30.19 Security Test Overlay

**唯一适用基线：** `Zaiyebuzuoyouqingdetiangou/tototest` main @ `5d7d45aacac37087c222d50b28b955e488dd66fc`（1.4.30.18）。

这是**覆盖包（overlay）**，不是完整插件 ZIP。把本目录中的文件按相同相对路径覆盖到上述基线仓库即可。

## 本轮修改

1. **独立 API 出站隐私边界**
   - 仅拦截 RabbitMirror 自己发往 SillyTavern `/api/backends/chat-completions/generate` 的独立 API 请求。
   - 独立 API 不再自动携带完整 `extensionPrompts`、`chatMetadata`、未显式启用的 `worldInfo` 聚合对象。
   - 保留当前聊天、当前角色卡、Persona、作者注释。
   - 用户明确开启“读取世界书”后，本轮主生成**实际激活**并通过原有 per-book 过滤的 World Info 仍保留。
   - 使用四个 RabbitMirror 专属标记做强识别；普通 SillyTavern 请求不会被改写。

2. **独立生成响应硬上限**
   - RabbitMirror 独立生成响应最多读取 **12 MiB**。
   - 超过后停止读取并返回本地 413：`RABBIT_MIRROR_RESPONSE_TOO_LARGE`，避免异常/恶意上游把 Safari / WebView 内存拖死。
   - 原实现本来就在 `readApiResponse()` 里等待完整 `response.text()`，因此本补丁没有把实时逐 token UI 改成缓冲模式；只是给原有缓冲路径加上限。

3. **旧手动 API Key 清理**
   - 只要已使用 Connection Manager profile，`updateSettings()` 会把遗留的 `independentApiKey` 清空再保存。
   - 安全 guard 初始化和每次 RabbitMirror 独立请求前也会做一次迁移清理。
   - Connection Manager / SillyTavern Secrets 本身不被复制或暴露。

4. **连接配置下拉选择**
   - 在原“从酒馆当前连接一键配置”区域增加 Connection Manager profile 下拉框。
   - 只列出项目现有 `getIndependentConnectionProfiles()` 判定可复用的 Chat Completion profile。
   - 切换 profile 后同步保存 profile ID；若 profile 自带模型则同步模型；不复制 Secrets。

5. **测试候选版本**
   - manifest / index cache key 标记为 `1.4.30.19`。
   - 核心 runtime 仍保持项目已有的 `1.4.30.17` 内部运行身份，避免为了测试安全补丁一次性改动所有旧模块 cache/runtime 守卫。正式发布时再做全图版本统一更安全。

## 明确未修改

- **塔罗牌图片规则、`gfx.tarot.com` 图源、塔罗 allowlist：完全未改。**
- 生成 Prompt 主体、母本、抽签、黑名单/收藏算法未改。
- stream/retry/single-flight/自动失败停止语义未改。
- Touch Theater / 大接近逻辑未改。
- sanitizer / 维修兔修复主体未改。

## 本地检查

在覆盖后的仓库根目录运行：

```bash
node --check index.js
node --check src/settings.js
node --check src/independentSecurityGuard.js
node --check src/independentProfileSelectorHotfix.js
node tests/independentSecurityGuard.test.mjs
python -m json.tool manifest.json > /dev/null
```

## 真机测试建议

1. iPhone / Safari 打开长聊天，确认进入速度、流式结束、设置保存仍正常。
2. 选择“使用独立 API”，确认新增“连接配置”下拉框能列出可复用的 Connection Manager 配置。
3. 切换两个不同 profile，确认模型同步、下一次兔子镜确实走所选连接。
4. 先在旧手动接口里放一个测试 Key，再切换 Connection Manager；重新打开设置后确认旧 Key 已清空。
5. **世界书 OFF**：独立兔子镜仍应根据聊天/角色卡/Persona 正常生成，但不应偷偷吃其他扩展 Prompt、chat metadata 或 worldInfo 聚合内容。
6. **世界书 ON**：本轮主生成实际激活的世界书仍应能影响独立兔子镜；关闭某本书后该书不应进入独立上下文。
7. 测一次普通跟随当前 API：结果应与 1.4.30.18 一致，安全 guard 不应触碰非 RabbitMirror 独立请求。
8. 测塔罗：牌图仍按原规则正常加载，确认本轮没有任何塔罗回归。
9. 高级设置 / 世界书弹窗在 iOS 上仍可滚动、关闭、返回。

## 回滚

删除两个新增文件，并把 `index.js`、`manifest.json`、`src/settings.js` 恢复到基线 SHA 对应版本即可。该补丁不会迁移或改写兔子镜历史 HTML。
