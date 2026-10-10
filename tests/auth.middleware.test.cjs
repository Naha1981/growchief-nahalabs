const { AuthMiddleware } = require('../apps/backend/src/services/auth/auth.middleware.ts');
const { EncryptionService } = require('../shared/server/encryption/encryption.service.ts');
const { HttpUnauthorized } = require('../shared/server/exceptions/http.exceptions.ts');
const crypto = require('node:crypto');
const originalAuthSecret = process.env.AUTH_SECRET;

function makeRequest(overrides = {}) {
  return {
    headers: { auth: 'test-token' },
    cookies: {},
    ...overrides,
  };
}

describe('AuthMiddleware', () => {
  let organizationService;
  let userService;
  let middleware;
  let user;

  beforeEach(() => {
    user = {
      id: 'user-1',
      activated: true,
      isSuperAdmin: false,
      password: 'must-not-be-retained-on-request',
    };
    organizationService = {
      getOrgsByUserId: jest.fn().mockResolvedValue([]),
    };
    userService = {
      getOrgUser: jest.fn(),
    };
    middleware = new AuthMiddleware(organizationService, userService);
    jest.spyOn(EncryptionService, 'verifyJWT').mockReturnValue(user);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  test('fails closed on missing, short, placeholder, or repetitive auth secrets', () => {
    delete process.env.AUTH_SECRET;
    expect(() => EncryptionService.validateAuthSecret()).toThrow(/AUTH_SECRET/);

    process.env.AUTH_SECRET = 'YourSpecialString!@#111';
    expect(() => EncryptionService.validateAuthSecret()).toThrow(/AUTH_SECRET/);

    process.env.AUTH_SECRET = 'A'.repeat(40);
    expect(() => EncryptionService.validateAuthSecret()).toThrow(/AUTH_SECRET/);

    process.env.AUTH_SECRET = crypto.randomBytes(32).toString('base64url');
    expect(() => EncryptionService.validateAuthSecret()).not.toThrow();
  });

  test('rejects an authenticated user when no active organization is available', async () => {
    const req = makeRequest();
    const next = jest.fn();

    await expect(middleware.use(req, {}, next)).rejects.toBeInstanceOf(HttpUnauthorized);
    expect(next).not.toHaveBeenCalled();
    expect(req.org).toBeUndefined();
  });

  test('sets the active organization and continues for an authenticated user', async () => {
    const org = { id: 'org-1', users: [{ disabled: false }] };
    organizationService.getOrgsByUserId.mockResolvedValue([org]);
    const req = makeRequest();
    const next = jest.fn();

    await middleware.use(req, {}, next);

    expect(req.user).toEqual(user);
    expect(req.org).toBe(org);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('rejects a request with no authentication token', async () => {
    const req = makeRequest({ headers: {}, cookies: {} });
    const next = jest.fn();

    await expect(middleware.use(req, {}, next)).rejects.toBeInstanceOf(HttpUnauthorized);
    expect(next).not.toHaveBeenCalled();
  });
});
