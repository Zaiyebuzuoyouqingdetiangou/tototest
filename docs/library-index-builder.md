# RabbitMirror 母本索引构建器

运行时继续保留“双库”设计：picker 使用轻量结构化索引，Prompt 只在抽中编号后读取该编号对应的完整母本。构建器只在开发／打包前运行，不会在 SillyTavern、浏览器或每轮生成时执行。

## 数据来源

- 完整母本：
  - `data/raw/rawPresentationFormats.js`
  - `data/raw/rawThematicCategories.js`
- 非内容元数据：
  - `data/metadata/presentationIndexMetadata.json`
  - `data/metadata/thematicIndexMetadata.json`
- 自动生成文件：
  - `data/structured/presentationIndex.js`
  - `data/structured/thematicIndex.js`

完整文字只维护在母本中。metadata 只保存无法从母本安全推导的 `tags`、旧标题 `aliases`、非标准 source 映射和少量人工确认的 compact `summaryOverride`。


## 母本条目书写规则

- 每个带编号、粗体标题的母本条目正文必须保持在同一行。
- 普通缩进续行不会被猜测合并；构建器会报告源文件、行号和最近条目，并让 `library:check`、`library:write` 与候选打包立即失败，避免内容静默丢失。
- 当前母本中少量“缩进的非编号子弹点”属于明确的 raw-only 补充语法，仍可保留；它们只在按编号读取完整母本时作为补充出现。需要让精简模式也保留其核心含义时，应使用经过人工核对的 `summaryOverride`。
- 空行、现有分组标题、库容器标记及合法编号子条目不受影响。

## 命令

```bash
npm run library:check
```

只在内存中重建两个索引并逐字节比较；不一致时失败，不写文件。

```bash
npm run library:write
```

先完整解析并校验两套母本和 metadata；所有检查通过后，才写入临时文件并替换过期索引，捕获到写入异常时恢复原文件，随后再执行一次 `--check`。

```bash
npm run package:candidate -- --output /absolute/path/RabbitMirror-candidate.zip
```

依次执行：重建索引 → 索引检查 → 全量测试 → 全 JS/MJS 语法检查 → 确定性 ZIP → CRC → 重新解压 → 再次检查／测试／语法 → 逐文件哈希比较。

## 失败即停止

以下情况会拒绝生成或打包：重复／缺失／错序 ID、母本新增但 metadata 未登记、metadata 指向错误 source、未知 metadata 字段、标题改名却未保留旧 alias、索引被手工改写、输出与母本不一致。

构建器不使用 AI、网络、DOM、SillyTavern API，也不修改 picker 权重、冷却、Prompt、运行时请求或安全净化。
