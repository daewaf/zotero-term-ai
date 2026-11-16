# GitHub 发布指南

## 第一次发布

1. 在 GitHub 创建公开仓库，例如 `zotero-term-ai`。只上传这个整理后的仓库目录的内容，包括 `.github`；不要上传上级工作目录。网页上传可能遗漏隐藏文件，建议使用 Git 或 GitHub Desktop。
2. 核对 LICENSE 的 MIT 许可与项目署名。如果希望使用个人/组织署名，可在首次发布前同步修改 LICENSE 和 manifest 的 author。保持插件 ID 不变，以兼容现有安装。
3. 将代码推送到默认分支，确认 Actions 的 Checks 全部通过。仓库设置中启用 Actions，允许工作流使用声明的 `contents: write` 权限创建 Release 草稿。无需 API 密钥或个人访问令牌。
4. 在本地提交对应代码后创建并推送标签：

   ```sh
   git tag v0.2.9
   git push origin v0.2.9
   ```

5. Actions 的 Release draft 工作流会测试、构建，并创建草稿，包含三个附件：`term-ai-0.2.9.xpi`、`updates.json`、`SHA256SUMS.txt`。工作流不会替你公开发布。
6. 下载草稿中的 XPI，在独立 Zotero 测试环境验证安装、API 设置、解释写入评论、加载动画、字号及旧版升级。不要在测试中公开个人配置。
7. 检查 Release 文案与附件，取消预发布选项，设置为最新版本（Latest），点击发布。草稿和预发布不作为此更新通道。
8. 在未登录浏览器中确认以下地址都能访问，确认 updates.json 中 ID、版本、下载地址正确，SHA-256 与下载的 XPI 一致：

   ```text
   https://github.com/OWNER/REPO/releases/latest/download/updates.json
   https://github.com/OWNER/REPO/releases/download/v0.2.9/term-ai-0.2.9.xpi
   ```

`OWNER/REPO` 仅在说明中表示你自己的仓库；构建产物自动使用 `GITHUB_REPOSITORY`，不包含这个占位值。仓库名称不必与示例相同，无需 GitHub Pages。

## 本地构建

```sh
python build.py --repository 真实用户名/真实仓库名
```

将 `dist/` 下三个文件一起上传到同一个正式 Release。没有实际仓库名时构建会拒绝生成含无效地址的安装包。源码 manifest 不含更新地址；只安装构建生成的 XPI。安装包中的 manifest 会自动写入主页及更新地址，源码模板保持不变。

## 后续更新

同步修改 `source/manifest.json`、`source/bootstrap.js`、`source/content/core.js`、`source/content/dialog.xhtml` 中的版本号（包括资源 URL 查询参数），更新 CHANGELOG、README 中适用信息和 `docs/RELEASE_NOTES.md`。然后提交，创建新标签并推送。不要覆盖已发布标签或同版本 XPI；修复请递增版本。

更新清单按 Zotero 的 Mozilla 风格 JSON 格式生成，包含插件 ID、版本、固定版本 XPI 下载链接、SHA-256 和兼容范围。稳定地址指向 Latest Release 的 updates.json。请保留历史 Release；未来若不同 Zotero 版本采用不同发行通道，应扩展清单保留各兼容版本，此工作流当前只维护 Zotero 10.0.x 单一通道。

公开发布前首次手动升级 0.2.8：旧版更新地址不可用，不能靠本次发布自动发现新版。手动装入本仓库 XPI 后，后续更新才使用新地址。换仓库/改插件 ID 会影响更新链路。

## 文件边界与验证

源码仅复制插件运行所需文件，保留不含真实凭据的模拟单元测试。未纳入本机路径、实机 profile、论文、截图、运行日志和本地 API 配置。`.gitignore` 提供额外防护；构建脚本以明确文件白名单打包，发现未知源码文件即失败。

本地检查：

```sh
node --test tests/core.test.cjs
python -m unittest discover -s tests -p "test_*.py"
```

单元测试不请求真实 API。构建测试验证更新链接、校验值、确定性打包、非法仓库、版本标签与未知文件拒绝。自动检查不等同于真实 Zotero 界面测试；公开每版前仍应执行上述独立环境验证。

参考：[Zotero 更新清单](https://www.zotero.org/support/dev/zotero_7_for_developers#update.rdf_updates.json)、[GitHub 工作流触发](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。
