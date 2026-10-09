import { Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { notificationQuerySchema, pushTokenSchema, type PushTokenInput } from '@gk/validators';
import { CurrentUser } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notification centre (paginated)' })
  list(
    @CurrentUser() user: AuthUser,
    @ZQuery(notificationQuerySchema) q: { page: number; limit: number; unreadOnly?: boolean },
  ) {
    return this.notifications.list(user.id, q.page, q.limit, q.unreadOnly);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() user: AuthUser) {
    return { updated: await this.notifications.markAllRead(user.id) };
  }

  @Patch(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.notifications.markRead(user.id, id);
    return { id };
  }

  @Post('push-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register an Expo push token for this device' })
  async registerToken(@CurrentUser() user: AuthUser, @ZBody(pushTokenSchema) body: PushTokenInput) {
    await this.notifications.registerPushToken(user.id, body.token, body.platform);
    return { registered: true };
  }

  @Delete('push-token/:token')
  async removeToken(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.notifications.removePushToken(user.id, token);
    return { removed: true };
  }
}
