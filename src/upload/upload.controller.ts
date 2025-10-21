import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  // 单文件上传接口
  @Post('single')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(__dirname, '..', '..', 'uploads'),
        filename: (req, file, callback) => {
          // 生成唯一文件名：时间戳-随机数.扩展名
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `${uniqueSuffix}${ext}`;
          callback(null, filename);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 限制文件大小为 10MB
      },
      fileFilter: (req, file, callback) => {
        // 可选：限制文件类型
        // const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
        // const ext = extname(file.originalname).toLowerCase();
        // if (!allowedTypes.test(ext)) {
        //   return callback(new Error('不支持的文件类型'), false);
        // }
        callback(null, true);
      },
    }),
  )
  async uploadSingle(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }
    return this.uploadService.uploadFile(file);
  }

  // 多文件上传接口
  @Post('multiple')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: join(__dirname, '..', '..', 'uploads'),
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `${uniqueSuffix}${ext}`;
          callback(null, filename);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async uploadMultiple(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('请选择要上传的文件');
    }
    return this.uploadService.uploadFiles(files);
  }

  // 获取文件列表
  @Get('files')
  async getFiles(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    
    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      throw new BadRequestException('页码和限制数量必须是正整数');
    }

    return this.uploadService.getAllFiles(pageNum, limitNum);
  }

  // 根据ID获取文件信息
  @Get('files/:id')
  async getFileById(@Param('id') id: string) {
    const fileId = parseInt(id, 10);
    if (isNaN(fileId)) {
      throw new BadRequestException('文件ID必须是数字');
    }

    const file = await this.uploadService.getFileById(fileId);
    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    return file;
  }

  // 删除文件
  @Delete('files/:id')
  async deleteFile(@Param('id') id: string) {
    const fileId = parseInt(id, 10);
    if (isNaN(fileId)) {
      throw new BadRequestException('文件ID必须是数字');
    }

    return this.uploadService.deleteFile(fileId);
  }

  // ==================== 切片上传相关接口 ====================

  // 检查文件是否已存在（秒传）
  @Get('check')
  async checkFileExists(@Query('hash') hash: string) {
    if (!hash) {
      throw new BadRequestException('hash参数不能为空');
    }
    return this.uploadService.checkFileExists(hash);
  }

  // 检查已上传的切片
  @Get('chunks/check')
  async checkUploadedChunks(@Query('hash') hash: string) {
    if (!hash) {
      throw new BadRequestException('hash参数不能为空');
    }
    return this.uploadService.checkUploadedChunks(hash);
  }

  // 上传单个切片
  @Post('chunk')
  @UseInterceptors(
    FileInterceptor('chunk', {
      storage: diskStorage({
        destination: join(__dirname, '..', '..', 'uploads', 'chunks', 'temp'),
        filename: (req, file, callback) => {
          // 使用临时文件名
          const tempName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(null, tempName);
        },
      }),
    }),
  )
  async uploadChunk(
    @UploadedFile() chunk: Express.Multer.File,
    @Body('hash') hash: string,
    @Body('index') index: string,
    @Body('chunkHash') chunkHash: string,
  ) {
    if (!chunk) {
      throw new BadRequestException('请上传切片文件');
    }
    if (!hash || !index || !chunkHash) {
      throw new BadRequestException('缺少必要参数');
    }

    return this.uploadService.uploadChunk({
      chunk,
      hash,
      index: parseInt(index, 10),
      chunkHash,
    });
  }

  // 合并切片
  @Post('merge')
  async mergeChunks(
    @Body('hash') hash: string,
    @Body('filename') filename: string,
    @Body('size') size: number,
    @Body('mimetype') mimetype: string,
  ) {
    if (!hash || !filename || !size) {
      throw new BadRequestException('缺少必要参数');
    }

    return this.uploadService.mergeChunks({
      hash,
      filename,
      size,
      mimetype: mimetype || 'application/octet-stream',
    });
  }
}