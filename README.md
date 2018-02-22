# upload-to-oss
** 前端静态资源检测,并上传到阿里云的oss **

============================

### 说明 ###
-------
- watcher.js 负责记录修改的文件,写入记录文件中, 需要一开始就开启
- upload.js 负责读取记录文件里的记录,然后上传到oss
- upload.js 会查找监测文件夹下所有与记录同名的文件,目的是解决,前端静态资源压缩后,把压缩后的资源一同上传到oss
- config.js 负责读取配置文件
- 记录里面路径都采用绝对路径,暂不支持window

### 如何使用
-------
#### 第一次执行watcher的时候,会在项目根目录下创建配置文件:  .upOssConfig

```javascript
{
  "configFileName": ".upOssConfig",
  "basePath": "",
  "watchPath": "",
  "recordFileName": ".record",
  "uploadType": "",
  "oss": {
    "region": "",
    "accessKeyId": "",
    "accessKeySecret": "",
    "bucket": ""
  },
  "ignores": [".record",".upOssConfig","node_modules/",".idea/",".git/"],
  "autoSave": 10
}
```

- configFileName: 配置文件名 默认:upOssConfig.json
- basePath: 根目录的绝对路
- watchPath: 监测文件的绝对路径,默认: 为配置文件所在的文件夹
- uploadType: 文件上传方式, 默认: 全部对应上传; 1.assetsToAssets 本地_assets文件上传到oss的_assets下面 2.normalToAssets 本地检测文件上传到oss的_assets下面 3. 全部对应上传
- recordFileName: 监测结果记录文件名,默认:.record
- oss: 阿里对象存储
- ignores: 忽略文件或文件名
- autoSave: 自动保存的时间间隔(单位: s 秒),默认: 20s

### 启动监测
-------
```javascript
node xxxx/upload-to-oss/watcher [-p 'xx/xx']
```

###上传到oss
-------
```javascript
node xxxx/upload-to-oss/upload [-t 'normal']
```

### 注意
-------
- 请不要删除配置文件和记录文件,否则程序可能无法正确执行
- 配置文件修改后,请重启watcher.js,否则无法生效