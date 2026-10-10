const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LocalStorage } = require('../shared/server/upload/local.storage.ts');

describe('LocalStorage deletion', () => {
  let tempRoot;
  let uploadRoot;
  let storage;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'growchief-local-storage-'));
    uploadRoot = path.join(tempRoot, 'uploads');
    fs.mkdirSync(uploadRoot, { recursive: true });
    storage = new LocalStorage(uploadRoot);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('maps a returned public upload path to the file under UPLOAD_DIRECTORY', async () => {
    const filePath = path.join(uploadRoot, '2026', '10', '10', 'customer.png');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'image');

    await storage.removeFile('/v1/api/uploads/2026/10/10/customer.png');

    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('rejects traversal and malformed public upload paths', async () => {
    await expect(
      storage.removeFile('/v1/api/uploads/../../secret.txt'),
    ).rejects.toThrow(/invalid path/);
    await expect(
      storage.removeFile('/v1/api/uploads/%2e%2e/secret.txt'),
    ).rejects.toThrow(/invalid path|outside the configured upload directory/);
    await expect(
      storage.removeFile('relative/path.png'),
    ).rejects.toThrow(/supply its returned upload path or an absolute path/);
  });

  test('refuses an absolute filesystem path outside the upload directory', async () => {
    const outsidePath = path.join(tempRoot, 'keep.txt');
    fs.writeFileSync(outsidePath, 'keep');

    await expect(storage.removeFile(outsidePath)).rejects.toThrow(
      /outside the configured upload directory/,
    );
    expect(fs.existsSync(outsidePath)).toBe(true);
  });
});
