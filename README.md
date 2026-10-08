# 海报-离线

海报生成器的离线依赖版本。

## 特点

- 人脸识别、字体和二维码处理依赖均随项目提供
- Service Worker 缓存首屏资源，MediaPipe 模型和 WASM 首次使用后按需缓存
- 人脸识别在 Web Worker 中运行，不阻塞海报编辑和文字输入
- 上传图片只在浏览器本地处理
- 支持生成高清 PNG 海报

通过 GitHub Pages 或本地 HTTP 服务打开即可使用。首次加载字体和人脸识别模型需要短暂等待，之后不依赖外部 CDN。浏览器不支持 Web Worker 或 OffscreenCanvas 时，人脸功能会自动回退为居中裁剪。

本地预览可以执行：

```bash
python3 -m http.server 4173
```

然后打开 `http://localhost:4173/`。
