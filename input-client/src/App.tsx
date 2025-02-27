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
        const md5Hash = spark.end();
        console.log(md5Hash, 'md5Hash');
        setFileMD5(md5Hash);
      }
    }

    // 读取文件内容
    fileReader.readAsArrayBuffer(file);
  }

  const checkChunks = async (fileMD5: string) => {
    console.log(fileMD5, 'fileMD5')
    const res = await fetch(`http://localhost:3000/check-chunks?fileMD5=${fileMD5}`);
    const data = await res.json();
    return data.chunks;
  }

  const uploadChunks = async () => {
    if (!file) {
      alert('Please select a file');
      return;
    };
    
    setUploading(true);

    // 获取已上传的文件分片
    const uploadedChunks = await checkChunks(fileMD5 as string) || [];

    const totalChunks = Math.ceil(file.size / chunkSize);
    let offset = 0;
    // while(offset < file?.size) {
    //   const chunk = file?.slice(offset, offset + chunkSize);
    //   chunks.push({chunk, index: offset / chunkSize});
    //   offset += chunkSize;
    // }

    try {
      // 先检查文件是否存在(秒传)
      const res = await fetch(`http://localhost:3000/check-file?fileMD5=${fileMD5}`);
      const data = await res.json();
      // if (data.exists) {
      //   alert('File already exists');
      //   return;
      // }

      // 逐个上传分片
      for (let i = 0; i < totalChunks; i++) {
        if (uploadedChunks.includes(i)) {
          console.log(`Chunk ${i} already uploaded, skipping.`);
          continue;
        }

        const chunk = file.slice(offset, offset + chunkSize);
        const formData = new FormData();
        formData.append('file', chunk);
        formData.append('index', i.toString());
        formData.append('filename', fileMD5 || '');

        const uploadResponse = await fetch('http://localhost:3000/upload-chunk', {
          method: 'POST',
          body: formData
        });

        if (!uploadResponse.ok) {
          const errText = await uploadResponse.text();
          throw new Error(`Failed to upload chunk ${i}: ${errText}`);
        }

        offset += chunkSize;
      }
      // 所有文件上传完成后，合并文件
      const mergeResponse = await fetch('http://localhost:3000/merge-chunks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: file.name,
          fileMD5
        })
      });
      if (mergeResponse.ok) {
        setUploading(false);
         alert('Upload successful');
      } else {
        const errText = await mergeResponse.text();
        alert(`Upload failed: ${errText}`);
      }
    } catch (error) {
      console.error('upload fail', error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input type='file' onChange={handleFileChange} />
      <button onClick={uploadChunks} disabled={!file}>
        {uploading ? 'Uploading...' : 'upLoading'}
      </button>
    </div>
  )
}

export default App;
