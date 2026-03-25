import { Controller, Post, Get, Param, Res, UseInterceptors, UploadedFile, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Response } from 'express';
import { join, normalize } from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UploadsService } from './uploads.service';

const uploadsStorage = new UploadsService();

@Controller('uploads')
export class UploadsController {
    constructor(private readonly uploadsService: UploadsService) { }

    @Get(':filename')
    serveFile(@Param('filename') filename: string, @Res() res: Response) {
        const uploadsDir = this.uploadsService.getUploadsDir();
        const filePath = normalize(join(uploadsDir, filename));

        if (!filePath.startsWith(uploadsDir) || !existsSync(filePath)) {
            throw new NotFoundException('Arquivo não encontrado');
        }

        res.sendFile(filePath);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: (req, file, cb) => {
                    cb(null, uploadsStorage.getUploadsDir());
                },
                filename: (req, file, cb) => {
                    const extension = uploadsStorage.getFileExtension(file.originalname, file.mimetype);
                    const uniqueSuffix = `${uuidv4()}${extension}`;
                    cb(null, uniqueSuffix);
                },
            }),
            limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
            fileFilter: (req, file, cb) => {
                if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|gif)$/)) {
                    return cb(new BadRequestException('Apenas imagens são permitidas'), false);
                }
                cb(null, true);
            },
        }),
    )
    uploadFile(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('Nenhum arquivo enviado');
        }

        return {
            url: this.uploadsService.buildPublicUrl(file.filename),
            filename: file.filename,
        };
    }
}
