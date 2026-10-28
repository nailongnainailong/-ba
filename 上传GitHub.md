# 上传到 GitHub（合成大 ba）

这个文件夹的**内容**就是网站根目录，`index.html` 必须在最外层。

我已经打好一个包：`C:\Users\28204\Desktop\文件\ba_site.zip`（2.77 MB），
里面是 `index.html / game.js / matter.min.js / assets / voices / bgm`，不含 README 和预览图。

---

## 方案一：新建一个仓库（推荐，和 dinner 分开）

目标地址：`https://你的用户名.github.io/ba/`

1. 打开 <https://github.com/new>
   - Repository name 填 `ba`
   - 选 **Public**
   - 点 `Create repository`
2. 在新仓库页点 `uploading an existing file`
3. 把 `ba_game` 文件夹**里面的东西**全部选中拖进去：
   `index.html`、`game.js`、`matter.min.js`、`assets` 文件夹、`voices` 文件夹、`bgm` 文件夹
   （`assets`/`voices`/`bgm` 三个文件夹必须一起拖，漏一个就没图或没声音）
4. 点 `Commit changes`
5. 仓库 `Settings` → 左侧 `Pages` → `Source: Deploy from a branch`
   → Branch 选 `main`、目录选 `/ (root)` → `Save`
6. 等 1~2 分钟，刷新 Pages 页面，顶部会出现：
   `https://你的用户名.github.io/ba/`

## 方案二：塞进现有仓库的子目录

比如放进 `dinner` 仓库的 `ba/` 子目录，地址就是
`https://你的用户名.github.io/dinner/ba/`。
同样要保证 `ba/` 目录下直接是 `index.html`，不要多套一层。

---

## 更新版本时（重要）

浏览器会缓存 `game.js`，改了代码但手机还跑旧的，就会「页面正常但游戏不动」。

`index.html` 里这两行是版本号：

```html
<script src="matter.min.js?v=1"></script>
<script src="game.js?v=1"></script>
```

**每次改完 `game.js`，把 `?v=1` 改成 `?v=2 / v=3…`**，再上传，就能顶掉缓存。
实在不行让用户在地址后面加个 `?v=2` 强制刷新。

---

## 国内访问的现实情况

| 托管 | 国内打开 |
|---|---|
| `用户名.github.io` | 时快时慢，个别网络打不开 |
| `xxx.netlify.app` | 一般能开，偶尔慢 |
| `xxx.vercel.app` | 基本不通，别用 |

只是自己和小范围朋友玩，GitHub Pages 够了；要稳就国内云厂商静态托管 + 备案域名。

---

## 一个坑：音频后缀

`voices/kei.m4a`、`voices/midori.m4a`、`bgm/bgm1.m4a`、`bgm/bgm2.m4a`
原本是 `.mp4` 扩展名，但里面**只有音频轨**（AAC 编码，没有视频），
所以按规范改成了 `.m4a`。上传说它们是纯音频，浏览器能直接播。

如果 GitHub Pages 返回的 MIME 是 `application/octet-stream`，Chrome/Edge 仍能靠内容嗅探播放；
真遇到播不出，把文件换成 `.mp3` 或 `.ogg` 再传即可（`game.js` 顶部的 `VOICE`、`BGM` 两个表改路径就行）。
