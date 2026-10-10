const { RootController } = require('../apps/backend/src/controllers/root.controller.ts');
const { ServiceUnavailableException } = require('@nestjs/common');

describe('RootController health probes', () => {
  let prisma;
  let temporal;
  let connection;
  let controller;

  beforeEach(() => {
    connection = {
      operatorService: {
        listSearchAttributes: jest.fn().mockResolvedValue({ customAttributes: {} }),
      },
    };
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ ready: 1 }]),
    };
    temporal = {
      getClient: jest.fn().mockReturnValue({
        getRawClient: jest.fn().mockReturnValue({ connection }),
      }),
    };
    controller = new RootController(prisma, temporal);
  });

  test('retains the original root response', () => {
    expect(controller.getRoot()).toBe('App is running!');
  });

  test('reports liveness without querying dependencies', () => {
    expect(controller.getLiveness()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(temporal.getClient).not.toHaveBeenCalled();
  });

  test('reports ready only after PostgreSQL and Temporal respond', async () => {
    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'ok', temporal: 'ok' },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(connection.operatorService.listSearchAttributes).toHaveBeenCalledWith({
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    });
  });

  test('returns service unavailable when PostgreSQL is not ready', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('private database details'));
    await expect(controller.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.getReadiness()).resolves.toMatchObject({ status: 'ready' });
  });

  test('returns service unavailable when Temporal is not ready', async () => {
    connection.operatorService.listSearchAttributes.mockRejectedValueOnce(
      new Error('private temporal details'),
    );
    await expect(controller.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
