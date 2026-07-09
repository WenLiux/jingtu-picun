# 京图批存

> 作者：Wenl

Tampermonkey（油猴）脚本，在京东商品详情页一键批量下载全部详情图。

## 一键安装

- [Greasy Fork 安装（推荐）](https://greasyfork.org/scripts/586245)
- [OpenUserJS 安装](https://openuserjs.org/scripts/wenl/%E4%BA%AC%E5%9B%BE%E6%89%B9%E5%AD%98)
- [GitHub Raw 安装（备用）](https://github.com/WenLiu6677/jingtu-picun/raw/main/jd-detail-image-downloader.user.js)

需要 Chrome 或 Edge，并提前安装 Tampermonkey。批量保存使用浏览器文件夹访问能力。

## 功能

- 在商品页右下角注入红色下载按钮
- 自动扫描 `graphext` 端点提取全部详情图 URL
- 深色预览面板，网格缩略图，点击可看原图
- **单张下载**：卡片右上角按钮，即点即存
- **批量下载**：只选择一次保存文件夹，后续图片自动写入同一位置
- **稳定下载**：3 路并发、失败自动重试 2 次，并准确显示成功/失败数量

## 使用

1. 打开任意京东商品详情页（`item.jd.com/*.html`）
2. 点击页面右下角的红色下载按钮
3. 预览详情图，或点击“选择文件夹并下载”
4. 选择一次目标文件夹，等待全部图片保存完成

首次批量保存时，浏览器会请求所选文件夹的写入权限。

## 技术原理

```
item.jd.com (React SPA, 详情图 JS 异步加载 → 直接抓不到)
       │
       ▼
in.m.jd.com/product/graphext/{skuId}.html
       │  ├─ 返回纯 HTML，含详情图 URL
       │  └─ 两种存放路径：
       │       ├─ img*.360buyimg.com/img/jfs/.../*.jpg.dpg
       │       └─ img*.360buyimg.com/imgzone/jfs/.../*.jpg.dpg
       │
       ▼
正则提取 → 去重 → 规范文件名 → 选择目录 → 并发写入文件
```

### 关键发现

| 发现 | 说明 |
|---|---|
| `.dpg` 格式 | JD 私有后缀，实质是标准 JPEG（Lavc 编码），直接改 `.jpg` 即可 |
| `graphext` 端点 | JD 移动版遗留页面，未做 SPA 改造。SKU ID 从 `location.pathname` 提取 |
| 两种图片路径 | `img/jfs/` 和 `imgzone/jfs/` 都可能出现，必须同时匹配（v1.0.1 修复） |
| `GM_xmlhttpRequest` | 绕过 `item.jd.com` → `in.m.jd.com` 的跨子域 CORS 限制 |
| File System Access API | 用户选择一次目录后，将全部图片直接写入同一位置 |

## 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 1.0.0 | 2026-07-08 | 初始版本，单张 + ZIP 打包 |
| 1.0.1 | 2026-07-09 | 修复正则只匹配 `imgzone` 的 bug，新增 `img/jfs/` 路径支持 |
| 1.1.0 | 2026-07-09 | ZIP 改为 8 并发并行下载；单张改用 `GM_download` |
| 1.2.0 | 2026-07-09 | 去掉 ZIP 打包，批量直存浏览器下载目录；移除 JSZip 依赖 |
| 1.3.0 | 2026-07-09 | 批量下载改为限并发队列；增加超时、失败重试和准确统计；支持所有图片节点及更多 URL 形式 |
| 1.4.0 | 2026-07-09 | 使用文件夹选择器批量保存；只需选择一次目录，后续图片不再逐张弹出保存窗口 |
| 1.4.1 | 2026-07-09 | 正式更名为“京图批存”，增加作者 Wenl 署名 |
| 1.4.2 | 2026-07-09 | 增加 GitHub 项目主页、问题反馈和公开发布信息 |
| 1.4.3 | 2026-07-09 | 许可证改为 CC BY-NC-SA 4.0 |

## 隐私

脚本只在京东商品详情页运行。图片请求直接发送到京东图片域名，所选文件夹仅用于本地写入，不上传文件或收集个人信息。

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)  
允许署名转载和改编，禁止商业使用，改编内容须以相同许可证共享。
