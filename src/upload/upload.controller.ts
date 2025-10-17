import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    UploadedFiles,
    BadRequestException,
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
    uploadSingle(@UploadedFile() file: Express.Multer.File) {
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
    uploadMultiple(@UploadedFiles() files: Express.Multer.File[]) {
      if (!files || files.length === 0) {
        throw new BadRequestException('请选择要上传的文件');
      }
      return this.uploadService.uploadFiles(files);
    }
  }