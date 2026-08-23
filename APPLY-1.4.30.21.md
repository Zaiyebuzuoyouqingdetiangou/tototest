# RabbitMirror 1.4.30.21 配色冷却 Overlay

适用基线：`Zaiyebuzuoyouqingdetiangou/tototest` main @ `32fd0c44f34b25626bb071fd4e4886585adb79e9`，并已覆盖 1.4.30.20 rendered-visual-feedback overlay。

将本 overlay 中的文件按相同相对路径覆盖到上述组合目标。

## 修复内容

- 把现有真实配色指纹正式接入主 API 与独立 API 的活跃 Prompt。
- 最近三面的明度、主色相、冷暖和饱和度按距离进入短期冷却。
- 同一完整配色族近三面出现至少两次时触发强避让；米黄、奶油、暖灰等不再因为高明度而漏过冷却。
- 一次真实低明度主承载继续触发五轮冷却。
- 用户明确指定的视觉偏好仍具有最终优先级。

## 未修改

- 不改变历史存储格式、抽签、独立 API 请求、塔罗规则、DOM 清洗或维修逻辑。
- 不增加网络请求、观察器、定时轮询或模型调用。
- 1.4.30.20 的渲染态识别逻辑保持不变，仅更新版本标记。

## 本地验证

```bash
node --check index.js
node --check src/injector.js
node --check src/independentApi.js
node --check src/promptBuilder.js
node --check src/paletteCooldown.js
node --check src/renderedVisualFeedbackHotfix.js
node tests/paletteCooldown.test.mjs
node tests/independentSecurityGuard.test.mjs
python3 -m json.tool manifest.json > /dev/null
```
