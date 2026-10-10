const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    middlewareStack: { add: jest.fn() },
    send: mockSend,
  })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ type: 'put', input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ type: 'delete', input })),
}));

const { CloudflareStorage } = require('../shared/server/upload/cloudflare.storage.ts');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

describe('CloudflareStorage deletion', () => {
  let storage;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
    storage = new CloudflareStorage(
      'account',
      'access-key',
      'secret-key',
      'auto',
      'bucket-name',
      'https://assets.example.com/media',
    );
  });

  test('deletes the correct nested object key under the configured bucket URL', async () => {
    await storage.removeFile('https://assets.example.com/media/leads/customer-1.png');

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'bucket-name',
      Key: 'leads/customer-1.png',
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('returns a normalized path when the configured upload URL has a trailing slash', async () => {
    const trailingSlashStorage = new CloudflareStorage(
      'account',
      'access-key',
      'secret-key',
      'auto',
      'bucket-name',
      'https://assets.example.com/media/',
    );

    const result = await trailingSlashStorage.uploadFile(
      {
        buffer: Buffer.from('image'),
        mimetype: 'image/png',
        size: 5,
        originalname: 'image.png',
      },
      'customer-1.png',
    );

    expect(result.path).toBe('https://assets.example.com/media/customer-1.png');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('supports a configured upload URL ending with a slash', async () => {
    const trailingSlashStorage = new CloudflareStorage(
      'account',
      'access-key',
      'secret-key',
      'auto',
      'bucket-name',
      'https://assets.example.com/media/',
    );

    await trailingSlashStorage.removeFile(
      'https://assets.example.com/media/customer-1.png',
    );

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'bucket-name',
      Key: 'customer-1.png',
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('refuses deletion through another hostname or outside the configured prefix', async () => {
    await expect(
      storage.removeFile('https://attacker.example.net/media/leads/customer-1.png'),
    ).rejects.toThrow(/outside the configured upload URL/);
    await expect(
      storage.removeFile('https://assets.example.com/other/customer-1.png'),
    ).rejects.toThrow(/outside the configured upload path/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('rejects query strings, fragments, and traversal keys', async () => {
    await expect(
      storage.removeFile('https://assets.example.com/media/customer-1.png?token=1'),
    ).rejects.toThrow(/outside the configured upload URL/);
    await expect(
      storage.removeFile('https://assets.example.com/media/../customer-1.png'),
    ).rejects.toThrow(/outside the configured upload path/);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
