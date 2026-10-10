import {
  Controller,
  Get,
  HttpCode,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Connection } from '@temporalio/client';
import { PrismaService } from '@growchief/shared-backend/database/prisma';
import { TemporalService } from 'nestjs-temporal-core';

@Controller('/')
export class RootController {
  constructor(
    private readonly _prismaService: PrismaService,
    private readonly _temporalService: TemporalService,
  ) {}

  @Get('/')
  @Post('/')
  @HttpCode(200)
  getRoot(): string {
    return 'App is running!';
  }

  @Get('/health/live')
  @HttpCode(200)
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('/health/ready')
  @HttpCode(200)
  async getReadiness(): Promise<{
    status: 'ready';
    checks: { database: 'ok'; temporal: 'ok' };
  }> {
    try {
      await this._prismaService.$queryRaw`SELECT 1`;

      const connection = this._temporalService
        ?.getClient()
        ?.getRawClient()
        ?.connection as Connection | undefined;
      if (!connection) {
        throw new Error('Temporal connection is not available');
      }

      await connection.operatorService.listSearchAttributes({
        namespace: process.env.TEMPORAL_NAMESPACE || 'default',
      });

      return {
        status: 'ready',
        checks: { database: 'ok', temporal: 'ok' },
      };
    } catch {
      // Avoid exposing database or Temporal connection details to unauthenticated probes.
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
  }
}
