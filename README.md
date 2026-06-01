# 优速网

150+ 款常用在线工具的合集：JSON、编码加解密、格式化、正则、单位换算、对照速查等。全部在浏览器本地运行，免登录、不上传。

线上站点：<https://uso.link>

## 本地运行

需要 Go 1.22+。

```bash
git clone https://github.com/sysctl-date/uso.link.git
cd uso.link/cmd/web
go build .
./web
```

服务监听 `0.0.0.0:12345`，生产环境可在前面挂 nginx 反代到 80/443。

## 截图

![首页](sc1.png)
![工具分类](sc2.png)

## 致谢

页面 HTML 结构参考自 <https://hostloc.com/forum.php?mod=viewthread&tid=1351049>
