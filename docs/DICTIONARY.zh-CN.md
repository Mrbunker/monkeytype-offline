# 离线查词第一版

分支：`feat/offline-dictionary`。

## 使用与范围

- 导航栏书本按钮打开“查词 / 生词本”面板。查询英文，展示中英释义、音标、词频、考试标签和可点击词形。
- 测试结束后展开 words history，点击目标词，或 Tab 聚焦后按 Enter / Space。原始目标词用于查询，用户输入与 burst WPM 作为上下文。
- 进行中的测试不开放查词，不添加暂停计时能力。Zen 无目标词，不提供结果点击查词。
- 搜索支持大小写、首尾标点、弯撇号标准化、前缀建议和数据源提供的词形映射。没有收录时明确显示空状态，不猜测词义。
- 收藏按英文原词去重，生词本支持筛选、多选、移除和练习。练习使用现有 custom 引擎，切到英文，循环选中词，长度为至少 10 词或每词 3 次。
- 最近 20 次成功查询保存在 localStorage；生词保存在 IndexedDB，可通过 Local history 的 JSON 导出迁移。最近查询不属于备份数据。
- 第一版不包含掌握状态、复习算法、自动收集错词、真人语音或完整双语例句。ECDICT 英文释义中已有用例原样保留，缺失字段不补造。

## 数据与许可证

来源：https://github.com/skywind3000/ECDICT

固定提交：`bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`，原文件 `ecdict.csv`。
上游采用 MIT License，原文随站点放在 `frontend/static/dictionaries/en/LICENSE.txt`。
词库是上游汇编数据，详细来源说明见上游 README；此版本不承诺专名、罕见词或各字段的完整覆盖。

使用 Node 24 重建（开发阶段下载，正常构建和运行不下载）：

```sh
node scripts/build-dictionary.mjs
# 或传入同版本 CSV，本地转换
node scripts/build-dictionary.mjs /path/to/ecdict.csv
```

manifest 记录原始文件 SHA-256、提交和词条数。仅保留英文单词及含内部撇号/连字符的形式，不包含多词短语。
数据按两字符前缀分片，文件名包含内容哈希；新增词库版本需重新生成并清理不再被 manifest 引用的文件。
客户端仅从 BASE_URL 下读取 manifest 与必要分片；缓存最多 12 个分片，失败请求可重试。正常构建使用已提交的静态数据，不访问上游。

“离线”指资源由本地 HTTP 静态服务器提供，不是 Pages 在浏览器断网后的首次资源可用性；没有增加 Service Worker。

## 模块边界与一致性

- `dictionary/schema.ts`：词条与收藏格式、单词标准化。
- `dictionary/service.ts`：同源懒加载、校验、前缀建议和词形查找。并发请求复用，限制缓存大小。
- `dictionary/state.ts`：查词上下文和打开入口，不加载词库。
- `DictionaryModal.tsx`：搜索结果、收藏列表与练习衔接。请求序号防止旧查询覆盖新结果。沿用现有 AnimatedModal 与主题色。
- 结果页直接保留目标词，不从带错误标记或悬浮提示的 DOM 文本提取。
- IndexedDB 升到 v2；只新增 vocabulary store，不改成绩 store。版本升级关闭旧连接。收藏上限 10,000。
- 总备份升到 v2，导入兼容 v1。成绩和生词在同一事务合并，重复单词保留本地记录；旧备份不清空生词。设置恢复仍沿用现有单独错误报告。

## 验证

单元测试覆盖标准化、真实词典分片、词形映射、加载失败重试和备份格式。浏览器测试覆盖点击目标词、键盘/手机布局、收藏刷新、批量练习、备份恢复、旧库升级和请求范围。类型、格式、生产构建与既有离线浏览器用例一起验证。
