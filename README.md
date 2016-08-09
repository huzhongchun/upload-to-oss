# upload-to-oss
**简单的文件检测+阿里云上传**

============================

### 说明 ###
-------
- watcher.js负责记录修改的文件,写入记录文件中, 需要一开始就开启
- app.js 负责读取记录文件里的记录,然后上传到oss
- app.js会查找监测文件夹下所有与记录同名的文件,目的是解决,前端静态资源压缩后,把压缩后的资源一同上传到oss
- config.js 负责读取配置文件
- 记录里面路径都采用绝对路径,暂不支持window

### 如何使用
-------
#### 在项目根目录下创建配置文件:  upOssConfig.json

```javascript
{
  "configFileName": "upOssConfig.json",
  "basePath": "",
  "watchPath": "",
  "recordFileName": ".record",
  "oss": {
    "region": "",
    "accessKeyId": "",
    "accessKeySecret": "",
    "bucket": ""
  },
  "ignores": [".record","upOssConfig.json","node_modules"],
  "autoSave": 20
}
```

- configFileName: 配置文件名 默认:upOssConfig.json
- basePath: 根目录的绝对路
- watchPath: 监测文件的绝对路径,默认: 为配置文件所在的文件夹
- recordFileName: 监测结果记录文件名,默认:.record
- oss: 阿里对象存储
- ignores: 忽略文件或文件名
- autoSave: 自动保存的时间间隔(单位: s 秒),默认: 20s

### 启动监测
-------
```javascript
node xxxx/upload-to-oss/watcher
```

###上传到oss
-------
```javascript
node xxxx/upload-to-oss/app
```

### 注意
-------
- 请不要删除配置文件和记录文件,否则程序可能无法正确执行
- 配置文件修改后,请重启watcher.js,否则无法生效