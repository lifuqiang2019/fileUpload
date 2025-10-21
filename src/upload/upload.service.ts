import { Injectable } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UploadService {
  // 上传目录路径
  private readonly uploadPath = join(__dirname, '..', '..', 'uploads');

  constructor(private readonly prisma: PrismaService) {
    // 确保上传目录存在
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
    
    // 确保切片临时目录存在
    const tempChunkPath = join(this.uploadPath, 'chunks', 'temp');
    if (!fs.existsSync(tempChunkPath)) {
      fs.mkdirSync(tempChunkPath, { recursive: true });
    }
  }

  // 处理单文件上传
  async uploadFile(file: Express.Multer.File) {
    if (!file) {
      throw new Error('未选择文件');
    }

    try {
      // 保存文件信息到数据库
      const fileRecord = await this.prisma.fileUpload.create({
        data: {
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path,
          url: `/uploads/${file.filename}`,
        },
      });

      return {
        message: '文件上传成功',
        id: fileRecord.id,
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
        url: `/uploads/${file.filename}`,
        createdAt: fileRecord.createdAt,
      };
    } catch (error) {
      // 如果数据库保存失败，删除已上传的文件
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw new Error('文件信息保存失败: ' + error.message);
    }
  }

  // 处理多文件上传
  async uploadFiles(files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new Error('未选择文件');
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (const file of files) {
      try {
        const result = await this.uploadFile(file);
        results.push(result);
      } catch (error: any) {
        errors.push({
          filename: file.originalname,
          error: error.message,
        });
      }
    }

    return {
      message: `文件上传完成，成功: ${results.length}，失败: ${errors.length}`,
      success: results,
      errors: errors,
    };
  }

  // 获取所有上传的文件列表
  async getAllFiles(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const [files, total] = await Promise.all([
      this.prisma.fileUpload.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.fileUpload.count(),
    ]);

    return {
      files,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // 根据ID获取文件信息
  async getFileById(id: number) {
    return this.prisma.fileUpload.findUnique({
      where: { id },
    });
  }

  // 删除文件
  async deleteFile(id: number) {
    const file = await this.prisma.fileUpload.findUnique({
      where: { id },
    });

    if (!file) {
      throw new Error('文件不存在');
    }

    try {
      // 删除数据库记录
      await this.prisma.fileUpload.delete({
        where: { id },
      });

      // 删除物理文件
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      return {
        message: '文件删除成功',
        filename: file.originalname,
      };
    } catch (error) {
      throw new Error('文件删除失败: ' + error.message);
    }
  }

  // ==================== 切片上传相关方法 ====================

  // 切片存储目录
  private readonly chunksPath = join(__dirname, '..', '..', 'uploads', 'chunks');

  // 检查文件是否已存在（秒传）
  async checkFileExists(hash: string) {
    const file = await this.prisma.fileUpload.findUnique({
      where: { hash },
    });

    if (file) {
      return {
        exists: true,
        file: {
          id: file.id,
          filename: file.filename,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path,
          url: file.url,
          createdAt: file.createdAt,
        },
      };
    }

    return { exists: false };
  }

  // 检查已上传的切片
  async checkUploadedChunks(hash: string) {
    const chunkDir = join(this.chunksPath, hash);

    // 如果目录不存在，说明没有上传任何切片
    if (!fs.existsSync(chunkDir)) {
      return { uploadedChunks: [] };
    }

    try {
      // 读取目录中的所有切片文件
      const files = await fsPromises.readdir(chunkDir);
      
      // 提取切片索引
      const uploadedChunks = files
        .map((filename) => {
          // 文件名格式: hash-index
          const match = filename.match(/-(\d+)$/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter((index) => index !== null);

      return { uploadedChunks };
    } catch (error) {
      console.error('检查切片失败:', error);
      return { uploadedChunks: [] };
    }
  }

  // 上传单个切片
  async uploadChunk(data: {
    chunk: Express.Multer.File;
    hash: string;
    index: number;
    chunkHash: string;
  }) {
    const { chunk, hash, index, chunkHash } = data;

    try {
      // 确保切片目录存在
      const chunkDir = join(this.chunksPath, hash);
      if (!fs.existsSync(chunkDir)) {
        fs.mkdirSync(chunkDir, { recursive: true });
      }

      // 移动临时文件到目标目录
      const targetPath = join(chunkDir, chunkHash);
      await fsPromises.rename(chunk.path, targetPath);

      return {
        message: '切片上传成功',
        hash,
        index,
        chunkHash,
        size: chunk.size,
      };
    } catch (error) {
      console.error('保存切片失败:', error);
      throw new Error('切片保存失败: ' + error.message);
    }
  }

  // 合并切片
  async mergeChunks(data: {
    hash: string;
    filename: string;
    size: number;
    mimetype: string;
  }) {
    const { hash, filename, size, mimetype } = data;

    try {
      const chunkDir = join(this.chunksPath, hash);

      // 检查切片目录是否存在
      if (!fs.existsSync(chunkDir)) {
        throw new Error('切片目录不存在');
      }

      // 读取所有切片文件并排序
      const chunkFiles = await fsPromises.readdir(chunkDir);
      chunkFiles.sort((a, b) => {
        const indexA = parseInt(a.match(/-(\d+)$/)?.[1] || '0', 10);
        const indexB = parseInt(b.match(/-(\d+)$/)?.[1] || '0', 10);
        return indexA - indexB;
      });

      // 生成最终文件名
      const ext = filename.substring(filename.lastIndexOf('.'));
      const finalFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const finalPath = join(this.uploadPath, finalFilename);

      // 创建写入流
      const writeStream = fs.createWriteStream(finalPath);

      // 按顺序读取切片并写入最终文件
      for (const chunkFile of chunkFiles) {
        const chunkPath = join(chunkDir, chunkFile);
        const chunkBuffer = await fsPromises.readFile(chunkPath);
        writeStream.write(chunkBuffer);
      }

      // 结束写入
      await new Promise<void>((resolve, reject) => {
        writeStream.end((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // 删除切片目录
      await fsPromises.rm(chunkDir, { recursive: true, force: true });

      // 保存文件信息到数据库
      const fileRecord = await this.prisma.fileUpload.create({
        data: {
          filename: finalFilename,
          originalname: filename,
          mimetype: mimetype,
          size: size,
          path: finalPath,
          url: `/uploads/${finalFilename}`,
          hash: hash, // 保存文件hash，用于秒传
        },
      });

      return {
        message: '文件合并成功',
        id: fileRecord.id,
        filename: finalFilename,
        originalname: filename,
        size: size,
        url: `/uploads/${finalFilename}`,
        hash: hash,
        createdAt: fileRecord.createdAt,
      };
    } catch (error) {
      console.error('合并切片失败:', error);
      throw new Error('文件合并失败: ' + error.message);
    }
  }
}