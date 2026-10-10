import { IUploadProvider } from './upload.interface';
import { mkdirSync, unlink, writeFileSync } from 'fs';
import { extname, isAbsolute, resolve, sep } from 'path';
import { fetchPublicRemoteUrl } from './public.remote.download';
import { extension } from 'mime-types';

export class LocalStorage implements IUploadProvider {
  constructor(private uploadDirectory: string) {}

  async uploadSimple(path: string) {
    const loadImage = await fetchPublicRemoteUrl(path);
    const contentType =
      loadImage?.headers?.['content-type'] ||
      loadImage?.headers?.['Content-Type'];
    const findExtension = extension(contentType);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const innerPath = `/${year}/${month}/${day}`;
    const dir = `${this.uploadDirectory}${innerPath}`;
    mkdirSync(dir, { recursive: true });

    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('');

    const filePath = `${dir}/${randomName}.${findExtension}`;
    const publicPath = `${innerPath}/${randomName}.${findExtension}`;
    // Logic to save the file to the filesystem goes here
    writeFileSync(filePath, loadImage.data);

    return '/v1/api/uploads' + publicPath;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const innerPath = `/${year}/${month}/${day}`;
    const dir = `${this.uploadDirectory}${innerPath}`;
    mkdirSync(dir, { recursive: true });

    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('');

    const filePath = `${dir}/${randomName}${extname(file.originalname)}`;
    const publicPath = `${innerPath}/${randomName}${extname(
      file.originalname,
    )}`;

    // Logic to save the file to the filesystem goes here
    writeFileSync(filePath, file.buffer);

    return {
      filename: `${randomName}${extname(file.originalname)}`,
      path: '/v1/api/uploads' + publicPath,
      mimetype: file.mimetype,
      originalname: file.originalname,
    };
  }

  private getFileSystemPath(filePath: string): string {
    const uploadRoot = resolve(this.uploadDirectory);
    let candidate: string;

    if (filePath.startsWith('/v1/api/uploads/')) {
      const relativePath = filePath.slice('/v1/api/uploads/'.length);
      let segments: string[];
      try {
        segments = relativePath.split('/').map((segment) => decodeURIComponent(segment));
      } catch {
        throw new Error('Cannot delete an upload with an invalid encoded path.');
      }

      if (
        segments.length === 0 ||
        segments.some(
          (segment) =>
            !segment ||
            segment === '.' ||
            segment === '..' ||
            segment.includes('/') ||
            segment.includes('\\') ||
            segment.includes('\0'),
        )
      ) {
        throw new Error('Cannot delete an upload with an invalid path.');
      }

      candidate = resolve(uploadRoot, ...segments);
    } else if (isAbsolute(filePath)) {
      candidate = resolve(filePath);
    } else {
      throw new Error('Cannot delete an upload: supply its returned upload path or an absolute path.');
    }

    if (candidate === uploadRoot || !candidate.startsWith(`${uploadRoot}${sep}`)) {
      throw new Error('Cannot delete a file outside the configured upload directory.');
    }

    return candidate;
  }

  async removeFile(filePath: string): Promise<void> {
    const safeFilePath = this.getFileSystemPath(filePath);
    return new Promise((resolvePromise, reject) => {
      unlink(safeFilePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolvePromise();
        }
      });
    });
  }
}
