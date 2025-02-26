import { FC, useState } from 'react';
import SparkMD5 from 'spark-md5';

const chunkSize = 10 * 1024 * 1024; // 10MB分片大小

const App: FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileMD5, setFileMD5] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      calculateFileMD5(selectedFile);
    } else {
      setFile(null);
      setFileMD5(null);
    }
  }

  const calculateFileMD5 = (file: File) => {
    const fileReader = new FileReader();
    const spark = new SparkMD5.ArrayBuffer();

    // 读取文件内容后计算MD5
    fileReader.onload = async (e) => {
      if (e.target?.result) {
        spark.append(e.target.result as ArrayBuffer);
        setFileMD5(spark.end());
      }
    }

    // 读取文件内容
    fileReader.readAsArrayBuffer(file);
  }

  const uploadChunks = async () => {
    if (!file) {
      alert('Please select a file');
      return;
    };
    
    setUploading(true);
    const chunks = [];
    console.log(file, 'file')
    let offset = 0;
    while(offset < file?.size) {
      const chunk = file?.slice(offset, offset + chunkSize);
      chunks.push({chunk, index: offset / chunkSize});
      offset += chunkSize;
    }

    try {
      // 先检查文件是否存在(秒传)
      const isExist = await fetch(`http://localhost:3000/check-file?fileMD5=${fileMD5}`);
      if (isExist) {
        alert('File already exists');
        return;
      }

      // 逐个上传分片
      for (const { chunk, index } of chunks) {
        const formData  = new FormData();
        formData.append('file', chunk);
        formData.append('index', index.toString());
        formData.append('fileName', file.name);
        await fetch('http://localhost:3000/upload-chunk', {
          method: 'POST',
          body: formData
        });
      }
      // 所有文件上传完成后，合并文件
      await fetch('http://localhost:3000/merge-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: file.name,
          fileMD5
        })
      });
      alert('Upload successful');
    } catch (error) {
      console.error('upload fail', error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input type='file' onChange={handleFileChange} />
      <button onClick={uploadChunks} disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'upLoading'}
      </button>
    </div>
  )
}

export default App;
