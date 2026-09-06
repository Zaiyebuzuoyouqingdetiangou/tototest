# 1.5.21 InteractionFix1 验证范围

日期：2026-09-06。基于冻结的 1.5.20 RuntimeFix1 副本；不覆盖旧包，不自动安装在线扩展，不写 GitHub，不发送模型请求。

## 已定位问题

1. **首次交互绑定缺口。** 旧版 `extractReadyDetails` 的 ID 隔离不等于交互安装，普通展开路径却把新面标为 activated。原创五面夹具中原生正确 CSS 控件可用，跨层 checked 及被净化后的有限安全事件意图不可用；真实手动交互维修后相同控件可用。新门控对当前 live face 首次打开后或首次内部操作前安装一次；折叠历史不扫描、后续开合不重复、模型脚本不执行。四条 API/放置路线的完整结果以随交付的核验清单为准。
2. **维修保存缺少消息序号。** 真实 `currentGenerationIdentity` producer 没返回 index，真实维修 consumer 用 `identity.index` 保存，导致空 owner key 和 `chat metadata read-back mismatch`。`independentRepairMetadataOwner.test.mjs` 将真实 producer、consumer、本地读写、metadata compactor 同跑，修复前单面与五面均失败；加回 index 后 6/6 通过，消息 0、错误 source、缺 metadata、替换回执及预算负例均保留。
3. **超预算维修不能丢旧成品。** 原创约 330 KiB 夹具证明：维修副本与初态合计超过 640 KiB 时，原 compactor 会先移除本地记录再报错。现在写入前拒绝超限维修，逐字节保留旧 store，不提高限额。
4. **折叠动画与失败提示。** 移除插件在被动动效恢复时施加的 `running!important`；细分固定批次失败原因，并将准备通知移到生成调用前。错误不会触发重抽、nostream 或第二次请求。

## 验证方法

- `node --test --loader ./tests/hostLoader.mjs tests/*.test.mjs`（PowerShell 先枚举文件再传入）：集成中实际执行 384/384，0 failed、0 skipped。版本统一与最终封包还会重新执行，不以这次中途结果代替最终成品验证。
- 首次交互回归不直接预激活：生产挂载→生产工具安装→外层展开→rAF 前首次内部点击→自然返回→重复开合→重新解析/挂载。
- 主代理在统一 1.5.21 版本后重新运行 `node tests/firstUseInteraction.browser.mjs` 的无参数、`--external`、`--follow`、`--follow --external` 四条路线，全部 exit 0；真实生产 `placeExternalHost` 参与放置。折叠 0 次、首次五面 5 次、重复开合新增 0 次、重挂载五面 5 次，首个快速点击与自然返回均通过。单一 cache cohort 的 343 条导入/字面量及 29 个反向闭包模块通过。
- `firstUseInteractionLifecycle.test.mjs` 单独检查懒加载、快速点击/键盘、关合取消、重复事件、预算拒绝及已脱离 DOM。
- `passiveAnimationLifecycle.browser.mjs` 检查生产 CSS 的内嵌/外置折叠暂停、重开和作者暂停；桌面结果不代表手机温度。
- 打包使用现有 `scripts/package-candidate.mjs`：构建索引、全量测试、JS/MJS 语法、ZIP CRC、全新解压复测、逐文件 SHA-256 对比。最终包的路径、校验码和实际结果另附交付清单，避免把打包前数字当作封包成功。
- 发布校验曾拦下仍匹配 1.5.20 的转义正则及 releaseScope 的版本归一化上限。只同步到本次 1.5.21 / interactionfix1 的明确版本，不更新冻结基线哈希、不放宽功能一致性断言；最终交付须以全部重新运行通过为准。

## 不能宣称的结论

- **没有补齐云端同步写入；手机→电脑、电脑→手机成品及维修实际恢复尚未通过。** 本地存储和 live metadata 成功不是服务器回执；跟随部分成功账本仍有独立待补路径。
- 现场只读检查确认电脑加载 `index.js?rmv=1.5.20-runtimefix1`；没有把新代码装到用户页面、没有点击生成或替用户执行维修。旧页面两面已有保存回读失败提示。
- 合成 Edge 的窄屏/触摸能力不等于 iPhone Safari。手机发热、十几秒延迟、复杂裁字、真实模型配色与反模板化仍待实机验证。
- 固定批次原因码是诊断增强；没有拿到手机失败的具体新原因，不能宣称所有多面计划拒绝都已解决。

跨设备的绑定验收要求保留在 `crossdevice-acceptance-pending.md`，不会降为“单机刷新正常”。
