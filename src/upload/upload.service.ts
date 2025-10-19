import { Injectable } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';
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
}