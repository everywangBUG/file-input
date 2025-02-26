const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); 

const app = express();
const upload = multer({ dest: 'uploads/' });

// 存储分片元数据（实际项目中使用数据库）
const chunkMetadata = new Map();

// 跨域配置
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With');
  res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204); // 预检请求返回 204 No Content
  } else {
    next();
  }
})

app.post('/upload-chunk', upload.single('file'), (req, res) => {
  // 从请求中获取分片的索引和文件名
  const { index, filename }  = req.body;
  // 上传的分片文件的路径
  const chunkPath = path.join('uploads', `${filename}.part${index}`);
  // 将上传的分片文件重命名为.part{index}的形式
  fs.rename(req.file.path, chunkPath);

  // 如果没有该文件的元数据，创建一个
  if (!chunkMetadata.has(filename)) {
    chunkMetadata.set(filename, []);
  }

  // 将分片的索引和路径存储到元数据中
  chunkMetadata.get(filename).push({ index, chunkPath });

  // 返回200表示上传成功
  res.sendStatus(200);
})

app.get('/check-file', (req, res) => {
  const { fileMD5 } = req.query;
  // 检查数据库是否存在该文件
  const exists = chunkMetadata.has(fileMD5); // 假设文件名字就是MD5值
  res.json({ exists})
})

app.post('/merge-chunks', (req, res) => {
  const { fileMD5, fileName } = req.body;
  const filePath = path.join('uploads', fileName);
  const writeSteam = fs.createReadStream(filePath);

  // 按顺序进行合并分片
  const chunkIndices = chunkMetadata.get(filename) || [];
  chunkIndices.sort((a, b) => a - b);

  chunkIndices.forEach(index => {
    const chunkPath = path.join('uploads', `${filename}.part${index}`);
    const readStream = fs.createReadStream(chunkPath);
    readStream.pipe(writeSteam, { end: false });
    readStream.on('end', () => {
      fs.unlinkSync(chunkPath); // 删除已合并的分片
    });
  })
  writeSteam.on('finish', () => {
    const fileMD5Hash = crypto.createHash('md5').update(fileName).digest('hex');
    if (fileMD5 === fileMD5Hash) {
      res.send('文件合并成功');
    } else {
      res.sendStatus(500).send('文件合并失败');
    }
  })
})

app.listen(3000, () => {
  console.log('server is running on part 3000')
})