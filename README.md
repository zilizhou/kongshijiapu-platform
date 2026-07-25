# 孔氏家谱编修平台（第 1 期）

原生部署：本机 MySQL 8 + Node.js 24 + PM2（不使用 Docker）。

## 访问

- 地址：`http://10.31.26.22:8090`
- 账号：`editor` / `first` / `second` / `final`（另有 `admin`）
- 密码：`123456`

## 服务器部署

```bash
cd /home/zlzhou/kong-jiapu

# 1) 导入家谱库（首次，较久）
chmod +x deploy/*.sh
./deploy/import-native.sh

# 2) 安装依赖、构建并启动
./deploy/native-setup.sh
```

常用命令：

```bash
pm2 status
pm2 logs kong-jiapu
pm2 restart kong-jiapu
```

## 第 1 期功能

- 登录与角色：录入员 / 一审 / 二审 / 终审
- 首页总览
- 家谱查询（筛选、展开子代、详情）
- 编修：新增 / 修改 / 删除 → 暂存或提交审核
- 三审流程（保存并通过 / 驳回）
- 工作记录
