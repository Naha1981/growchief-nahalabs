import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import 'multer';
import { extension as findExtension } from 'mime-types';
import { IUploadProvider } from './upload.interface';
import { fetchPublicRemoteUrl } from './public.remote.download';
import { makeId } from '@growchief/shared-both/utils/make.id';

class CloudflareStorage implements IUploadProvider {
  private _client: S3Client;

  constructor(
    accountID: string,
    accessKey: string,
    secretKey: string,
    private region: string,
    private _bucketName: string,
    private _uploadUrl: string,
  ) {
    this._client = new S3Client({
      endpoint: `https://${accountID}.r2.cloudflarestorage.com`,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    this._client.middlewareStack.add(
      (next) =>
        async (args): Promise<any> => {
          const request = args.request as RequestInit;

          // Remove checksum headers
          const headers = request.headers as Record<string, string>;
          delete headers['x-amz-checksum-crc32'];
          delete headers['x-amz-checksum-crc32c'];
          delete headers['x-amz-checksum-sha1'];
          delete headers['x-amz-checksum-sha256'];
          request.headers = headers;

          Object.entries(request.headers).forEach(
            // @ts-ignore
            ([key, value]: [string, string]): void => {
              if (!request.headers) {
                request.headers = {};
              }
              (request.headers as Record<string, string>)[key] = value;
            },
          );

          return next(args);
        },
      { step: 'build', name: 'customHeaders' },
    );
  }

  async uploadSimple(path: string) {
    const loadImage = await fetchPublicRemoteUrl(path);
    const contentType =
      loadImage?.headers?.['content-type'] ||
      loadImage?.headers?.['Content-Type'];
    const extension = findExtension(contentType);
    const id = makeId(10);

    const params = {
      Bucket: this._bucketName,
      Key: `${id}.${extension}`,
      Body: loadImage.data,
      ContentType: contentType,
      ChecksumMode: 'DISABLED',
    };

    const command = new PutObjectCommand({ ...params });
    await this._client.send(command);

    return `${this._uploadUrl}/${id}.${extension}`;
  }

  async uploadFile(file: Express.Multer.File, fileName?: string): Promise<any> {
    const ida = makeId(10);
    const extensiona = findExtension(file.mimetype) || '';

    const key = fileName || `${ida}.${extensiona}`;
    const [id, extension] = key.split('.');

    // Create the PutObjectCommand to upload the file to Cloudflare R2
    const command = new PutObjectCommand({
      Bucket: this._bucketName,
      Key: key,
      Body: file.buffer,
    });

    await this._client.send(command);

    return {
      filename: `${id}.${extension}`,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
      originalname: `${id}.${extension}`,
      fieldname: 'file',
      path: `${this._uploadUrl}/${id}.${extension}`,
      destination: `${this._uploadUrl}/${id}.${extension}`,
      encoding: '7bit',
      stream: file.buffer as any,
    };
  }

  private getObjectKey(filePath: string): string {
    let baseUrl: URL;
    let targetUrl: URL;

    try {
      baseUrl = new URL(this._uploadUrl);
      targetUrl = new URL(filePath);
    } catch {
      throw new Error('Cannot delete an object: the supplied path is not an absolute URL.');
    }

    if (
      targetUrl.origin !== baseUrl.origin ||
      targetUrl.username ||
      targetUrl.password ||
      targetUrl.search ||
      targetUrl.hash
    ) {
      throw new Error('Cannot delete an object outside the configured upload URL.');
    }

    let basePath = baseUrl.pathname;
    while (basePath.endsWith('/')) {
      basePath = basePath.slice(0, -1);
    }
    const prefix = `${basePath}/`;
    if (!targetUrl.pathname.startsWith(prefix)) {
      throw new Error('Cannot delete an object outside the configured upload path.');
    }

    const encodedKey = targetUrl.pathname.slice(prefix.length);
    let segments: string[];
    try {
      segments = encodedKey.split('/').map((segment) => decodeURIComponent(segment));
    } catch {
      throw new Error('Cannot delete an object with an invalid encoded path.');
    }

    if (
      segments.length === 0 ||
      segments.some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          segment.includes('/') ||
          segment.includes('\\'),
      )
    ) {
      throw new Error('Cannot delete an object with an invalid key.');
    }

    return segments.join('/');
  }

  async removeFile(filePath: string): Promise<void> {
    const key = this.getObjectKey(filePath);
    await this._client.send(
      new DeleteObjectCommand({
        Bucket: this._bucketName,
        Key: key,
      }),
    );
  }
}

export { CloudflareStorage };
export default CloudflareStorage;
