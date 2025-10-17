import { Injectable } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';

@Injectable()
export class UploadService {
  // 上传目录路径
  private readonly uploadPath = join(__dirname, '..', '..', 'uploads');

  constructor() {
    // 确保上传目录存在
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  // 处理单文件上传
  uploadFile(file: Express.Multer.File) {
    if (!file) {
      throw new Error('未选择文件');
    }

    return {
      message: '文件上传成功',
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      url: `/uploads/${file.filename}`,
    };
  }

  // 处理多文件上传
  uploadFiles(files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new Error('未选择文件');
    }

    return {
      message: '文件上传成功',
      files: files.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
        url: `/uploads/${file.filename}`,
      })),
    };
  }
}