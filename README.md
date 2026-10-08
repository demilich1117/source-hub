# Source Hub

给每一张装饰，一个稳定的地址。

[公开素材库](https://demilich1117.github.io/source-hub/) · [GitHub 仓库](https://github.com/demilich1117/source-hub)

这是供酒馆主题与界面装饰使用的素材仓库：本机管理图片，GitHub 保存版本，GitHub Pages 提供可浏览的目录和图片直链。无需第三方依赖，也不需要在网页里填写 GitHub Token。

## 本地使用

安装 Node.js 22 或更高版本，双击 `start.cmd`，或在仓库目录运行：

```sh
npm start
```

打开 **http://127.0.0.1:19325**。已有服务运行时，直接打开这个地址。也可用环境变量 `PORT` 更改端口。

1. 点击「导入素材」，填写图集与版本，例如 `moonveil-covenant` / `2.2.4`。
2. 选择或拖入多张 PNG、JPEG、WebP、GIF。系统保留原文件，不自动压缩。
3. 搜索名称、标签或版本；切换深色、浅色或棋盘底查看透明装饰。
4. 打开详情，复制直链、CSS `url("…")` 或 Markdown。名称、标签和备注可以编辑。
5. 在酒馆美化工作台里，把公开图片地址粘贴到素材 URL 输入框；本地地址可供同一台机器预览。

公开网站提供浏览和复制功能。导入、编辑、归档在本地管理页完成。文件选择一次最多处理浏览器选中的文件，逐张报告结果，失败项可重试。

## 发布更新

本地导入会写入 `assets/` 和 `catalog.json`，此时公开链接还未生效。检查后提交并推送：

```sh
npm test
npm run check
git add assets catalog.json
git commit -m "Add theme artwork"
git push origin main
```

`main` 的更新触发 GitHub Actions：测试 → 校验所有图片哈希 → 构建 → 发布 Pages。Actions 成功后打开公开目录查看。Raw 地址在推送后可用，Pages 地址须等部署完成；缓存刷新可能稍有延迟。提交后刷新本地页面，可选择新提交的固定链接。

首次搭建其他仓库时，修改 `hub.config.json`，并在 GitHub **Settings → Pages → Source** 选择 **GitHub Actions**。本仓库已配置 `.github/workflows/pages.yml`。

## 地址如何选择

| 类型 | 用途 |
| --- | --- |
| GitHub Raw | 日常引用；图集版本与内容哈希一起确定文件 |
| GitHub Pages | 从公开站点读取图片，便于查看与分享 |
| 固定提交 | 锁定到特定 Git 提交，适合主题定版；仍需先推送该提交 |
| 本地 | 仅本机酒馆预览，不能分享给其他设备 |

文件存放格式：

```text
assets/<图集>/<版本>/<英文文件名>-<SHA256前16位>.<格式>
```

- 同一图集和版本内，重复导入相同内容会复用已有图片。
- 同名图片内容变化后使用新地址，保留原地址。
- 中文名称显示在目录中，磁盘文件名会转换为 ASCII；可在详情单独修改显示名称。
- 图集和版本作为地址的一部分不能原地修改。需要分类迁移时，将图片导入新位置，旧条目可归档。
- 归档后公开目录不显示该条目，但文件仍随站点发布，旧主题引用继续可用。勾选「含归档」可恢复。
- 不要手动覆盖或删除已有图片。文件哈希改变会使校验失败。

## 大图与容量

本管理器单张限制 **32 MiB**、最多 **一亿像素**；这是本项目的限制。浏览器按需加载原图，不另外生成缩略图。建议在入库前裁掉透明空白、调整像素尺寸，并将大型透明装饰导出为 WebP。动图同样保留原文件。

外链让主题 JSON 不再携带整张图片的 Base64，但图片仍需下载，也仍会占用设备解码内存。超大图应先缩小、压缩或拆成几个可复用部件；本项目不使用 Git LFS 作为 Pages 图床。

构建在素材总量超过 900 MiB 时停止，给站点留出空间。GitHub 对普通 Git 文件有 100 MiB 上限，Pages 发布站点有 1 GB 上限及流量限制。需要长期存放大量原始大图时，应拆分图库或迁移到对象存储，发布到主题里的则保留适合显示的版本。

平台说明：[GitHub 大文件](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)、[Pages 使用限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。

## 给自动化工具与 Agent

运行本地服务后，命令行复用同一个写入接口，避免两个进程同时覆盖索引：

```sh
npm run hub -- list
npm run hub -- add "D:/art/new-decoration.webp" moonveil-covenant 2.2.5
npm run hub -- edit "<素材ID>" "metadata.json"
```

`metadata.json` 示例：

```json
{"name":"新月吊坠","tags":["导航","银色"],"note":"用于设置按钮","archived":false}
```

默认从 `.local/runtime.json` 读取服务地址，也可设置 `HUB_URL`。API 位于 `/api/assets`，使用本地会话令牌与索引版本检查；网页及 CLI 自动处理。目录、版本和图片字节在导入后保持不变。

未来工作台可以读取公开的 `catalog.json` 浏览素材，按 `hub.json` 的仓库配置生成链接。本仓库提供素材层；酒馆里的布局修改、评论小票和实时预览仍由主题工作台负责。

## 开发与目录

```sh
npm test       # 存储、API、构建与链接回归
npm run check  # 语法、尺寸、文件字节与 SHA-256 校验
npm run build  # 生成 site/ 供 GitHub Pages 部署
```

```text
assets/            已发布图片，保留历史地址
catalog.json       素材名称、分类、版本、尺寸、哈希和标签
hub.config.json    仓库与站点地址
web/               管理页和公开目录共用界面
lib/               图片信息、不可变存储和 Git 状态
server.mjs         仅监听 127.0.0.1 的本地服务
scripts/           CLI、检查和构建
tests/             回归测试
.local/            本地运行信息，Git 忽略
site/              生成的公开站点，Git 忽略
```

构建只复制明确允许的网页文件、素材和公开配置，不会发布本地会话令牌、运行日志或服务代码。

## 首批图集

`moonveil-covenant / 2.2.4` 收录「月弧浮页」主题实际引用的 12 张装饰，保留生产版 WebP 字节。包括银龙、月链、城堡背景、羽毛笔、九切片边框和蜡封。素材由该主题工程的 ImageGen 插画生成流程产出，具体用途与原文件名记录在各图片备注中。

代码与素材目前未设置统一的再分发许可证；后续授权以仓库维护者说明为准。
