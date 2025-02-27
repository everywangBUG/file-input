const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bodyParser = require('body-parser'); // 引入body-parser

const app = express();
const upload = multer({ dest: 'uploads/' });

// 存储分片元数据（实际项目中使用数据库）
const chunkMetadata = new Map();

app.use(bodyParser.json()); // 使用body-parser中间件

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

// 检查上传分片
app.get('/check-chunks', (req, res) => {
  const { fileMD5 } = req.query;
  if (!fileMD5) {
    return res.status(400).send('缺少参数: fileMD5');
  } 

  // 获取文件的已上传分片
  const uploadChunks = chunkMetadata.get(fileMD5) || [];
  // 获取已上传的分片索引
  const existsChunks = new Set(uploadChunks.map(chunk => chunk.index));
  // 返回已上传的分片索引
  res.json({ existsChunks: Array.from(existsChunks) });
})

// 上传分片文件
app.post('/upload-chunk', upload.single('file'), (req, res) => {
  // 从请求中获取分片的索引和文件名
  const { index, filename }  = req.body;

  if (!index || !filename) {
    return res.status(400).send('缺少参数: index 或 filename');
  }

  // 上传的分片文件的路径
  const chunkPath = path.join('uploads', `${filename}.part${index}`);
  try {
    // 将上传的分片文件重命名为.part{index}的形式
    fs.renameSync(req.file.path, chunkPath);
  } catch (err) {
    return res.status(500).send('重命名文件失败:' + err.message);
  }

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

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.post('/merge-chunks', (req, res) => {
  const { fileMD5, fileName } = req.body;

  if (!fileMD5 || !fileName) {
    return res.status(400).send('缺少参数: fileMD5 或 fileName');
  }

  // 检查是否所有分片都已经上传
  const chunksIndices = chunkMetadata.get(fileMD5) || [];
  console.log(chunksIndices, 'chunksIndices999')
  if (chunksIndices.length === 0) {
    return res.status(400).send('文件分片未上传完整');
  }

  const filePath = path.join(uploadDir, fileName);
  const writeStream = fs.createWriteStream(filePath);

  // 按顺序进行合并分片
  const chunkIndices = chunkMetadata.get(fileName) || [];
  chunkIndices.sort((a, b) => a.index - b.index);

  let chunksProcessed = 0;
  const totalChunks = chunkIndices.length;
  let responseSent = false;

  const sendResponse = (status, message) => {
    if (!responseSent) {
      responseSent = true;
      res.status(status).send(message);
    }
  };

  
  chunkIndices.forEach(chunkItem => {
    const chunkPath = path.join(uploadDir, `${fileName}.part${chunkItem.index}`);
    const readStream = fs.createReadStream(chunkPath);
    
    readStream.on('error', (err) => {
      sendResponse(500, '读取文件分片失败: ' + err.message);
      writeStream.end();
    })

    readStream.pipe(writeStream, { end: false });

    readStream.on('end', () => {
      fs.unlinkSync(chunkPath); // 删除已合并的分片
      chunksProcessed++;
      if (chunksProcessed === totalChunks) {
        writeStream.end();
      }
    });
  });

  writeStream.on('finish', () => {
    // 根据文件内容计算md5，而不是文件名
    const fileBuffer = fs.readFileSync(filePath);
    const fileMD5Hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    // if (fileMD5 === fileMD5Hash) {
    //   sendResponse(200, '文件合并成功');
    // } else {
    //   sendResponse(500, '文件合并失败');
    // }
    sendResponse(200, '文件合并成功');
  })

  writeStream.on('error', (err) => {
    fs.unlinkSync(filePath);
    sendResponse(500, '文件合并失败2: ' + err.message);
  })
})

app.listen(3000, () => {
  console.log(chunkMetadata, 'chunkMetadata')
  console.log('server is running on part 3000')
})